/**
 * Keeps the signed-in user's data on the device and in the cloud in step.
 *
 * - The app keeps reading and writing the local database (fast, works offline). Dexie
 *   hooks notice every write to a synced table for the signed-in user and queue its key.
 * - The queue (outbox) is saved, so changes made offline upload once back online.
 * - Pulls bring down rows changed elsewhere: everything on a new device, then only rows
 *   newer than the last pull. Realtime pushes changes from the user's other devices live.
 * - A row waiting to upload is never overwritten by an older copy from the cloud.
 */
import Dexie from 'dexie';
import { create } from 'zustand';
import { db } from '../db/db';
import { cloud } from './client';
import { MAP, SYNCED, SyncedTable } from './tables';

type Status = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export const useSync = create<{ status: Status; lastSync: number | null }>(() => ({ status: 'idle', lastSync: null }));

const PAGE = 1000;
const OVERLAP_MS = 15_000; // re-read a little behind the cursor so late commits are never missed
const REMOTE = 'cloud';

let userId: string | null = null;
let outbox: Record<SyncedTable, Map<string, number>> = emptyOutbox();
let seq = 0;
let hooksInstalled = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;
let again = false;
let backoff = 2000;
let channel: ReturnType<ReturnType<typeof cloud>['channel']> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let changeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const profileListeners = new Set<(row: Record<string, unknown>) => void>();

function emptyOutbox(): Record<SyncedTable, Map<string, number>> {
  return Object.fromEntries(SYNCED.map((t) => [t, new Map<string, number>()])) as Record<SyncedTable, Map<string, number>>;
}

const outboxKey = (uid: string) => `cdnx-outbox:${uid}`;
const cursorKey = (uid: string) => `cdnx-cursor:${uid}`;

function store(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: the in-memory queue still works for this session */
  }
}
function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function saveOutbox() {
  if (!userId) return;
  const plain = Object.fromEntries(SYNCED.map((t) => [t, [...outbox[t].keys()]]));
  const any = SYNCED.some((t) => outbox[t].size);
  store(outboxKey(userId), any ? JSON.stringify(plain) : null);
}

function loadOutbox(uid: string) {
  outbox = emptyOutbox();
  const raw = read(outboxKey(uid));
  if (!raw) return;
  try {
    const plain = JSON.parse(raw) as Record<string, string[]>;
    for (const t of SYNCED) for (const k of plain[t] ?? []) outbox[t].set(k, ++seq);
  } catch {
    /* corrupt queue: a full pull + the next writes recover */
  }
}

/** Number of changes waiting to upload. */
export function pendingCount(): number {
  return SYNCED.reduce((a, t) => a + outbox[t].size, 0);
}

function track(table: SyncedTable, row: { userId?: string } | undefined) {
  if (!userId || !row || row.userId !== userId) return;
  const tx = Dexie.currentTransaction as unknown as { source?: string } | null;
  if (tx?.source === REMOTE) return; // this write came from the cloud
  outbox[table].set(MAP[table].key(row), ++seq);
  saveOutbox();
  scheduleFlush(350);
}

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  for (const t of SYNCED) {
    const table = db.table(t);
    table.hook('creating', (_pk, obj) => { track(t, obj); });
    table.hook('updating', (mods, _pk, obj) => { track(t, { ...(obj as object), ...(mods as object) } as { userId?: string }); });
  }
}

function scheduleFlush(ms: number) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, ms);
}

async function flushOnce(): Promise<void> {
  const uid = userId;
  if (!uid || !pendingCount()) return;
  useSync.setState({ status: 'syncing' });
  for (const t of SYNCED) {
    const snap = [...outbox[t].entries()];
    if (!snap.length) continue;
    for (let i = 0; i < snap.length; i += 500) {
      const part = snap.slice(i, i + 500);
      const rows = (await db.table(t).bulkGet(part.map(([k]) => k))).filter((r): r is { userId: string } => !!r && r.userId === uid);
      if (rows.length) {
        const { error } = await cloud().from(t).upsert(rows.map((r) => MAP[t].toRemote(r)));
        if (error) throw error;
      }
      // drop only keys that were not changed again while uploading
      for (const [k, s] of part) if (outbox[t].get(k) === s) outbox[t].delete(k);
      saveOutbox();
    }
  }
}

/** Upload everything waiting. Resolves when done (or failed, to retry later). */
export function flush(): Promise<void> {
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = (async () => {
    try {
      await flushOnce();
      backoff = 2000;
      if (userId) useSync.setState({ status: 'synced', lastSync: Date.now() });
    } catch {
      useSync.setState({ status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error' });
      scheduleFlush(backoff);
      backoff = Math.min(backoff * 2, 60_000);
    } finally {
      flushing = null;
      if (again) {
        again = false;
        scheduleFlush(50);
      }
    }
  })();
  return flushing;
}

/** Write rows that came from the cloud into the device, unless a newer local change waits. */
async function applyRemote(table: SyncedTable, remote: Record<string, unknown>[]): Promise<number> {
  const uid = userId;
  if (!uid || !remote.length) return 0;
  const rows = remote.map((r) => MAP[table].toLocal(r)).filter((r) => r.userId === uid && !outbox[table].has(MAP[table].key(r)));
  if (!rows.length) return 0;
  await db.transaction('rw', db.table(table), async (tx) => {
    (tx as unknown as { source: string }).source = REMOTE;
    await db.table(table).bulkPut(rows);
  });
  emitChange();
  return rows.length;
}

function emitChange() {
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { changeTimer = null; for (const f of listeners) f(); }, 120);
}

/**
 * Download rows changed in the cloud. `full` fetches everything (a new device);
 * otherwise only rows changed since the last pull. Throws if the cloud can't be reached.
 */
export async function pull(full = false): Promise<void> {
  const uid = userId;
  if (!uid) return;
  const cursor = full ? null : read(cursorKey(uid));
  const since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
  let newest = cursor;
  for (const t of SYNCED) {
    for (let from = 0; ; from += PAGE) {
      let q = cloud().from(t).select('*').eq('user_id', uid);
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q.order('updated_at', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      for (const r of rows) if (typeof r.updated_at === 'string' && (!newest || r.updated_at > newest)) newest = r.updated_at;
      await applyRemote(t, rows);
      if (rows.length < PAGE) break;
    }
  }
  if (userId === uid && newest) store(cursorKey(uid), newest);
  useSync.setState({ status: pendingCount() ? 'syncing' : 'synced', lastSync: Date.now() });
}

function subscribe(uid: string) {
  const ch = cloud().channel(`cdnx-user-${uid}`);
  for (const t of SYNCED) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `user_id=eq.${uid}` }, (p) => {
      const row = (p as { new?: Record<string, unknown> }).new;
      if (row && Object.keys(row).length) void applyRemote(t, [row]);
    });
  }
  ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, (p) => {
    const row = (p as { new?: Record<string, unknown> }).new;
    if (row) for (const f of profileListeners) f(row);
  });
  ch.subscribe();
  channel = ch;
}

const onVisible = () => {
  if (document.visibilityState === 'visible' && userId) {
    void pull().catch(() => {});
    void flush();
  }
};
const onOnline = () => { if (userId) { void flush(); void pull().catch(() => {}); } };

/**
 * Start syncing for a signed-in user. `fresh` (no local copy of this account yet) waits for
 * the full download and throws if the cloud can't be reached; otherwise it returns at once
 * and syncs in the background.
 */
export async function startSync(uid: string, opts: { fresh: boolean }): Promise<void> {
  if (userId && userId !== uid) await stopSync();
  installHooks();
  userId = uid;
  loadOutbox(uid);
  if (opts.fresh) {
    await pull(true);
  } else {
    void pull().catch(() => useSync.setState({ status: 'offline' }));
  }
  void flush();
  if (!channel) {
    try {
      subscribe(uid);
    } catch {
      /* live updates are a bonus; polling below covers us */
    }
  }
  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    if (!pollTimer) pollTimer = setInterval(() => { if (document.visibilityState === 'visible') void pull().catch(() => {}); }, 60_000);
  }
}

/** Stop syncing (log out). Tries to upload pending changes first, for up to `waitMs`. */
export async function stopSync(waitMs = 4000): Promise<{ clean: boolean }> {
  if (!userId) return { clean: true };
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  await Promise.race([flush(), new Promise((r) => setTimeout(r, waitMs))]);
  const clean = pendingCount() === 0;
  if (channel) {
    void cloud().removeChannel(channel);
    channel = null;
  }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (typeof window !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  }
  userId = null;
  outbox = emptyOutbox();
  useSync.setState({ status: 'idle', lastSync: null });
  return { clean };
}

/** Called after rows arrive from the cloud. Returns an unsubscribe function. */
export function onCloudChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function onProfileChange(f: (row: Record<string, unknown>) => void): () => void {
  profileListeners.add(f);
  return () => profileListeners.delete(f);
}

/** Remove a user's data from this device (after logging out). Cloud copies stay. */
export async function clearLocal(uid: string): Promise<void> {
  await db.transaction('rw', SYNCED.map((t) => db.table(t)), async (tx) => {
    (tx as unknown as { source: string }).source = REMOTE;
    for (const t of SYNCED) {
      const table = db.table(t);
      if (t === 'wallets' || t === 'settings') await table.delete(uid);
      else await table.where('userId').equals(uid).delete();
    }
  });
  store(cursorKey(uid), null);
  store(outboxKey(uid), null);
}

/** For tests. */
export function syncState() {
  return { userId, pending: pendingCount() };
}

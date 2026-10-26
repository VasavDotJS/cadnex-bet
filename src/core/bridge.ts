/**
 * Connects the engine to the app: restores and saves engine snapshots, mirrors updates into
 * the live store, settles bets as markets resolve and raises notifications.
 */
import { db } from '../db/db';
import { startEngine, EngineHandle } from '../engine/client';
import type { EventPublic, FromEngine } from '../engine/types';
import { parseEventKey } from '../feed/types';
import { formatMoney } from '../lib/money';
import { remoteMoney, serverMoney } from '../money/remote';
import { betService, shortRef } from '../services/betService';
import { findSelection, useLive } from '../store/live';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';

let handle: EngineHandle | null = null;
let ready = false;
let settling = false;
let settleQueued = false;

/** Notification and toast for bets that just reached a result. */
async function announce(settled: import('../db/db').BetRow[], meId: string): Promise<void> {
  for (const b of settled) {
    const ret = BigInt(b.returnMinor ?? '0');
    const title = b.status === 'WON' ? `Won ${formatMoney(ret, b.currency)}` : b.status === 'VOID' ? 'Bet voided, stake returned' : 'Bet lost';
    const body = `${b.legs[0].home} v ${b.legs[0].away}${b.legs.length > 1 ? ` +${b.legs.length - 1} more` : ''} · Ref ${shortRef(b.id)}`;
    await db.notifications.put({ id: `n_settle_${b.id}`, userId: b.userId, kind: 'settled', title, body, link: '/bets', createdAt: Date.now(), read: false });
    if (b.userId === meId && useSession.getState().settings?.notifySettled !== false) {
      const ui = useUi.getState();
      if (b.status === 'WON') { ui.toast({ tone: 'win', title, body, action: { label: 'View', to: '/bets' } }); ui.win(); }
      else if (b.status === 'LOST' && ret === 0n) { ui.toast({ tone: 'loss', title, body }); ui.loss(); }
      else ui.toast({ tone: 'neutral', title, body });
    }
  }
  await useSession.getState().refreshAll();
}

async function settleNow(): Promise<void> {
  if (settling) { settleQueued = true; return; }
  settling = true;
  try {
    const events = useLive.getState().events;
    const me = useSession.getState().user;
    if (!me) return; // nobody signed in on this device: nothing to settle here
    const { settled, changed } = await betService.settle((leg) => {
      const ev = events[leg.eventId];
      if (!ev) {
        if (!ready) return null;
        // bets from the old simulated matches, or real matches we can no longer find
        if (!parseEventKey(leg.eventId)) return 'VOID';
        return Date.now() - leg.startTime > 4 * 86_400_000 ? 'VOID' : null;
      }
      const f = findSelection(ev, leg.marketKey, leg.code);
      if (!f) return ev.status === 'FINISHED' ? 'VOID' : null;
      return f.selection.result === 'PENDING' ? null : f.selection.result;
    }, me.id);
    if (settled.length) {
      await announce(settled, me.id);
    } else if (changed) {
      // legs may have updated (e.g. one leg of a parlay won); refresh quietly
      await useSession.getState().refreshBets();
    }
  } catch (e) {
    console.error('settlement failed', e);
  } finally {
    settling = false;
    if (settleQueued) { settleQueued = false; void settleNow(); }
  }
}

/**
 * Once per app start, ask the server to look at every open bet: it settles anything that
 * finished while the app was closed, including matches this device no longer follows.
 */
let swept = false;
async function sweep(): Promise<void> {
  const me = useSession.getState().user;
  if (swept || !me || !remoteMoney()) return;
  swept = true;
  try {
    const r = await serverMoney('settle', {});
    const done = new Set(r.settled ?? []);
    if (done.size) await announce(r.bets.filter((b) => done.has(b.id)), me.id);
    else if (r.bets.length) await useSession.getState().refreshAll();
  } catch {
    swept = false; // try again next time
  }
}

function watchIncidents(prev: Record<string, EventPublic>, incoming: EventPublic[]): void {
  const s = useSession.getState();
  if (!s.user || !s.settings?.notifyGoals) return;
  const mine = new Set<string>(s.settings.followed);
  for (const b of s.bets) if (b.status === 'OPEN' || b.status === 'PARTIALLY_CASHED_OUT') for (const l of b.legs) mine.add(l.eventId);
  for (const ev of incoming) {
    if (!mine.has(ev.id)) continue;
    const before = prev[ev.id]?.incidents[0]?.id;
    const fresh = [];
    for (const i of ev.incidents) { if (i.id === before) break; fresh.push(i); }
    for (const i of fresh.slice(0, 2)) {
      if (!i.major || i.kind === 'end') continue;
      useUi.getState().toast({ tone: 'neutral', title: `${ev.home.short} ${ev.scoreText?.[0] ?? ev.score[0]}–${ev.scoreText?.[1] ?? ev.score[1]} ${ev.away.short}`, body: i.text, action: { label: 'Watch', to: `/event/${ev.id}` } }, 5000);
    }
  }
}

function onMessage(m: FromEngine): void {
  switch (m.type) {
    case 'ready':
      ready = true;
      useLive.getState().setReady(m.events, handle?.mode ?? 'worker');
      void sweep().then(() => settleNow());
      break;
    case 'update': {
      const prev = useLive.getState().events;
      useLive.getState().apply(m.events, m.removed);
      watchIncidents(prev, m.events);
      const touched = m.events.some((e) => e.markets.length > 0);
      if (touched) void settleNow();
      break;
    }
    case 'status':
      useLive.getState().setHealth(m.health);
      break;
    case 'snapshot':
      if (ready) void db.engine.put({ id: SNAP_KEY, snapshot: m.snapshot }).catch(() => {});
      break;
    case 'log':
      console.warn('[engine]', m.msg);
      break;
  }
}

const SNAP_KEY = 'live-v2';
let starting: Promise<void> | null = null;
let lastTracked = '';

/** Tell the engine which matches carry open bets or alerts, so it keeps following them. */
function syncTracked(): void {
  const s = useSession.getState();
  const ids = new Set<string>(s.settings?.followed ?? []);
  for (const b of s.bets) if (b.status === 'OPEN' || b.status === 'PARTIALLY_CASHED_OUT') for (const l of b.legs) if (parseEventKey(l.eventId)) ids.add(l.eventId);
  const key = [...ids].sort().join(',');
  if (key === lastTracked) return;
  lastTracked = key;
  handle?.send({ type: 'track', ids: [...ids] });
}

export function startBridge(): Promise<void> {
  if (!starting) starting = boot();
  return starting;
}

async function boot(): Promise<void> {
  handle = await startEngine(onMessage);
  void db.engine.delete('snapshot').catch(() => {}); // old simulation state
  if (handle.mode === 'worker') {
    // the worker reads and writes its snapshot itself: nothing large crosses to this thread
    handle.send({ type: 'init', snapshot: null, now: Date.now(), selfStore: true });
  } else {
    let snapshot = null;
    try {
      snapshot = (await db.engine.get(SNAP_KEY))?.snapshot ?? null;
    } catch {
      snapshot = null;
    }
    handle.send({ type: 'init', snapshot, now: Date.now() });
  }
  syncTracked();
  useSession.subscribe(syncTracked);
  const save = () => handle?.send({ type: 'snapshot-request' });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
    else handle?.send({ type: 'refresh' });
  });
  window.addEventListener('pagehide', save);
}

export function refreshFeed(): void {
  handle?.send({ type: 'refresh' });
}

export function focusEvent(id: string | null): void {
  handle?.send({ type: 'focus', eventId: id });
}

export function requestSettlement(): void {
  void settleNow();
}

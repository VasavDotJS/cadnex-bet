/**
 * Tennis player photos, looked up through the app's /api/player route and remembered on the
 * device (a found photo for a week, "no photo" for a day). Lookups are spread out (at most a
 * few at a time) so a long list of matches doesn't hit the photo sources all at once.
 */

import { isPlaceholderName } from './placeholder';

export { isPlaceholderName };

export interface PlayerPhotoInfo {
  /** same-origin photo address (/api/photo?u=…) */
  photo: string;
  /** "Photo: author · licence · Wikimedia Commons" when the licence asks for credit */
  credit?: string;
  /** the photo's page on Wikimedia Commons */
  source?: string;
}

const KEY = 'cdnx-players-2';
const MAX = 400;
const FOUND_MS = 7 * 86_400_000;
const NONE_MS = 86_400_000;
const PHOTO = /^\/api\/photo\?u=[^\s"'<>]+$/;
const SOURCE = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s"'<>]+$/;

type Stored = Record<string, { p: PlayerPhotoInfo | null; t: number }>;
let stored: Stored | null = null;

function load(): Stored {
  if (stored) return stored;
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Stored;
  } catch {
    stored = {};
  }
  return stored;
}

function save(k: string, p: PlayerPhotoInfo | null): void {
  const m = load();
  delete m[k];
  m[k] = { p, t: Date.now() };
  const keys = Object.keys(m);
  if (keys.length > MAX) for (const x of keys.slice(0, keys.length - MAX)) delete m[x];
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage full or blocked: the in-memory copy still works */
  }
}

/** Only well-formed, same-origin answers are used. */
function clean(j: unknown): PlayerPhotoInfo | null {
  const o = j as Partial<PlayerPhotoInfo> | null;
  if (!o || typeof o.photo !== 'string' || !PHOTO.test(o.photo)) return null;
  return {
    photo: o.photo,
    credit: typeof o.credit === 'string' ? o.credit.slice(0, 160) : undefined,
    source: typeof o.source === 'string' && SOURCE.test(o.source) ? o.source : undefined,
  };
}

// ── a small queue: at most four lookups in flight ──
const LIMIT = 4;
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= LIMIT) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

const inflight = new Map<string, Promise<PlayerPhotoInfo | null>>();

const keyOf = (name: string, id?: string) => `${name.trim().toLowerCase()}|${id && /^\d{1,10}$/.test(id) ? id : ''}`;

/** The player's photo, or null when there isn't one we can show. */
export function playerPhoto(name: string, id?: string): Promise<PlayerPhotoInfo | null> {
  if (typeof window === 'undefined' || isPlaceholderName(name)) return Promise.resolve(null);
  const k = keyOf(name, id);
  const hit = load()[k];
  if (hit && Date.now() - hit.t < (hit.p ? FOUND_MS : NONE_MS)) return Promise.resolve(hit.p ? clean(hit.p) : null);
  const pending = inflight.get(k);
  if (pending) return pending;
  const qs = new URLSearchParams({ name: name.trim(), v: '2' });
  if (id && /^\d{1,10}$/.test(id)) qs.set('id', id);
  const p = slot(async () => {
    const r = await fetch(`/api/player?${qs}`, { credentials: 'omit' });
    const j = (await r.json().catch(() => null)) as { retry?: boolean } | null;
    if (!r.ok || j?.retry) throw new Error('busy');
    const info = clean(j);
    save(k, info);
    return info;
  }).catch(() => null);
  inflight.set(k, p);
  // a failed lookup (offline, source busy) may be retried a minute later
  p.then((v) => setTimeout(() => inflight.delete(k), v ? 0 : 60_000));
  return p;
}

const images = new Map<string, Promise<HTMLImageElement | null>>();

/** The photo as a decoded image (same-origin, so canvases can read it). */
export function playerImage(info: PlayerPhotoInfo): Promise<HTMLImageElement | null> {
  let p = images.get(info.photo);
  if (!p) {
    p = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = info.photo;
    });
    images.set(info.photo, p);
  }
  return p;
}

/**
 * Official club logos. The sports feed gives each team a logo on ESPN's image CDN; the app
 * loads them through its own /api/logo route so they're cached at the edge, sized to fit,
 * and same-origin (so the story canvas can draw them into a video).
 *
 * Logos seen in the feed are remembered by team name, so past bets and Wrapped can show
 * them after the match has dropped off the feed.
 */

const ALLOWED = /(^|\.)espncdn\.com$/;

/** Accepts only https URLs on ESPN's image CDN; anything else is dropped. */
export function cleanLogo(u: unknown): string | undefined {
  if (typeof u !== 'string' || !u) return undefined;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && ALLOWED.test(url.hostname) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const SIZES = [64, 128, 256, 500] as const;

/** The same-origin address of a logo, at a size that covers `px` CSS pixels on a 2× screen. */
export function logoSrc(url: string, px: number): string {
  const want = px * 2;
  const w = SIZES.find((s) => s >= want) ?? 500;
  return `/api/logo?u=${encodeURIComponent(url)}&w=${w}`;
}

const KEY = 'cdnx-logos';
const MAX = 600;
let known: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (known) return known;
  try {
    known = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    known = {};
  }
  return known;
}

export function rememberLogos(teams: { name: string; logo?: string }[]): void {
  if (typeof window === 'undefined') return;
  const m = load();
  let changed = false;
  for (const t of teams) {
    if (t.logo && m[t.name] !== t.logo) {
      delete m[t.name]; // re-insert so the newest stay when trimming
      m[t.name] = t.logo;
      changed = true;
    }
  }
  if (!changed) return;
  const keys = Object.keys(m);
  if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete m[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage full or blocked: logos still work for live matches */
  }
}

export function logoFor(name: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return load()[name];
}

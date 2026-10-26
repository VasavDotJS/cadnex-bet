/**
 * Tennis player portraits for the story canvases, as halftone dot prints. Like the logos,
 * drawing never waits: until a portrait is ready the monogram shows, and `preloadPortraits`
 * waits briefly before a video is made so the file has them.
 */
import { drawHalftone, prepareHalftone, Prepared } from '../lib/halftone';
import { isPlaceholderName, playerImage, playerPhoto } from '../lib/players';

const art = new Map<string, Prepared | null>();
const pending = new Map<string, Promise<void>>();

const key = (name: string, cells: number) => `${name}|${cells}`;

function start(name: string, cells: number): Promise<void> {
  const k = key(name, cells);
  const have = pending.get(k);
  if (have) return have;
  const p = playerPhoto(name)
    .then((info) => (info ? playerImage(info) : null))
    .then((img) => { art.set(k, img ? prepareHalftone(img, cells) : null); })
    .catch(() => { art.set(k, null); });
  pending.set(k, p);
  return p;
}

/** The prepared dot print for a player, or null while loading or if there's no photo. */
export function portraitArt(name: string | undefined, cells: number): Prepared | null {
  if (!name || isPlaceholderName(name) || typeof Image === 'undefined') return null;
  const k = key(name, cells);
  if (art.has(k)) return art.get(k) ?? null;
  void start(name, cells);
  return null;
}

/** Story crests use two print sizes: the big matchday crest and the small leg discs. */
export const CREST_CELLS = 52;
export const DISC_CELLS = 22;

export async function preloadPortraits(names: (string | undefined)[], timeoutMs = 4000): Promise<void> {
  const list = [...new Set(names.filter((n): n is string => !!n && !isPlaceholderName(n)))];
  if (!list.length || typeof Image === 'undefined') return;
  const all = list.flatMap((n) => [start(n, CREST_CELLS), start(n, DISC_CELLS)]);
  await Promise.race([Promise.all(all), new Promise((r) => setTimeout(r, timeoutMs))]);
}

/** Draws a portrait disc; returns false when there's none to draw (so the caller draws its monogram). */
export function drawPortrait(ctx: CanvasRenderingContext2D, name: string | undefined, cells: number, cx: number, cy: number, r: number, progress = 1): boolean {
  const p = portraitArt(name, cells);
  if (!p) return false;
  drawHalftone(ctx, p, cx, cy, r * 2, { progress, paper: '#141418', highlight: '#B5F23D' });
  return true;
}

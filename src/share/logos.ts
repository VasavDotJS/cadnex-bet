/**
 * Logo images for the story canvases. Drawing never waits: a logo that hasn't loaded yet
 * is simply skipped (the monogram shows), and the live preview picks it up on a later
 * frame. Before a video is made, `preloadLogos` waits briefly so the file has them.
 */
import { logoSrc } from '../lib/logo';

const cache = new Map<string, HTMLImageElement | null>();
const pending = new Map<string, Promise<void>>();

function start(url: string): Promise<void> {
  const have = pending.get(url);
  if (have) return have;
  const p = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { cache.set(url, img.naturalWidth ? img : null); resolve(); };
    img.onerror = () => { cache.set(url, null); resolve(); };
    img.src = logoSrc(url, 256);
  });
  pending.set(url, p);
  return p;
}

/** The loaded logo for a feed URL, or null while loading or if it has none. */
export function logoImage(url: string | undefined): HTMLImageElement | null {
  if (!url || typeof Image === 'undefined') return null;
  if (cache.has(url)) return cache.get(url) ?? null;
  void start(url);
  return null;
}

export async function preloadLogos(urls: (string | undefined)[], timeoutMs = 3000): Promise<void> {
  const list = [...new Set(urls.filter((u): u is string => !!u))];
  if (!list.length || typeof Image === 'undefined') return;
  await Promise.race([Promise.all(list.map(start)), new Promise((r) => setTimeout(r, timeoutMs))]);
}

/** Draws an image centred in a box of `size`, keeping its aspect ratio. */
export function drawContained(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, size: number): void {
  const k = size / Math.max(img.naturalWidth, img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

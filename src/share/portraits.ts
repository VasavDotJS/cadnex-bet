/**
 * Tennis player photos (black and white) for the story canvases. Like the logos, drawing never
 * waits: until a photo is ready a chip with the initials shows, and `preloadPortraits` waits
 * briefly before a video is made so the file has them.
 */
import { isPlaceholderName, playerImage, playerPhoto } from '../lib/players';
import { bwPhoto } from '../lib/bwphoto';

const prints = new Map<string, HTMLCanvasElement | null>();
const pending = new Map<string, Promise<void>>();

/** Story photos are made at one size and scaled down where needed. */
const PRINT_PX = 520;

function start(name: string): Promise<void> {
  const have = pending.get(name);
  if (have) return have;
  const p = playerPhoto(name)
    .then((info) => (info ? playerImage(info) : null))
    .then((img) => { prints.set(name, img ? bwPhoto(img, PRINT_PX) : null); })
    .catch(() => { prints.set(name, null); });
  pending.set(name, p);
  return p;
}

/** The black-and-white photo for a player, or null while loading or if there's no photo. */
export function printFor(name: string | undefined): HTMLCanvasElement | null {
  if (!name || isPlaceholderName(name) || typeof Image === 'undefined') return null;
  if (prints.has(name)) return prints.get(name) ?? null;
  void start(name);
  return null;
}

export async function preloadPortraits(names: (string | undefined)[], timeoutMs = 4000): Promise<void> {
  const list = [...new Set(names.filter((n): n is string => !!n && !isPlaceholderName(n)))];
  if (!list.length || typeof Image === 'undefined') return;
  await Promise.race([Promise.all(list.map(start)), new Promise((r) => setTimeout(r, timeoutMs))]);
}

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/** The player's photo as a rounded square with a soft drop shadow; without one, a chip with their initials. */
export function drawPrintCard(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, size: number, sans: string): void {
  const print = printFor(name);
  const h = size / 2;
  const r = size * 0.16;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = size * 0.16;
  ctx.shadowOffsetY = size * 0.07;
  ctx.beginPath();
  ctx.roundRect(cx - h, cy - h, size, size, r);
  ctx.fillStyle = '#26262D';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  if (print) ctx.drawImage(print, cx - h, cy - h, size, size);
  else {
    ctx.fillStyle = 'rgba(244,244,246,0.75)';
    ctx.font = `700 ${Math.round(size * 0.34)}px ${sans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(name), cx, cy + size * 0.02);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(cx - h, cy - h, size, size, r);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.stroke();
}

/** The photo in a small disc (bet story legs). Returns false when there's no photo to draw. */
export function drawPrintDisc(ctx: CanvasRenderingContext2D, name: string | undefined, cx: number, cy: number, r: number): boolean {
  const print = printFor(name);
  if (!print) return false;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(print, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  return true;
}

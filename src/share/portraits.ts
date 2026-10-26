/**
 * Tennis player prints for the story canvases. Like the logos, drawing never waits: until a
 * print is ready a paper chip with the initials shows, and `preloadPortraits` waits briefly
 * before a video is made so the file has them.
 */
import { isPlaceholderName, playerImage, playerPhoto } from '../lib/players';
import { scanPrint } from '../lib/scanprint';

const prints = new Map<string, HTMLCanvasElement | null>();
const pending = new Map<string, Promise<void>>();

/** Story prints are made at one size and scaled down where needed. */
const PRINT_PX = 520;

function start(name: string): Promise<void> {
  const have = pending.get(name);
  if (have) return have;
  const p = playerPhoto(name)
    .then((info) => (info ? playerImage(info) : null))
    .then((img) => { prints.set(name, img ? scanPrint(img, { size: PRINT_PX, seed: name }) : null); })
    .catch(() => { prints.set(name, null); });
  pending.set(name, p);
  return p;
}

/** The finished print for a player, or null while loading or if there's no photo. */
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

/**
 * A print pasted onto the poster: a slightly tilted square photo with a soft drop shadow and,
 * optionally, a flat lime sticker on one corner. Without a photo, a blank paper chip with the
 * player's initials. `side` (-1 left, 1 right) mirrors the tilt and the sticker.
 */
export function drawPrintCard(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, size: number, side: -1 | 1, sans: string, sticker = true): void {
  const print = printFor(name);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(side * -0.045);
  const h = size / 2;
  const r = size * 0.06;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = size * 0.16;
  ctx.shadowOffsetY = size * 0.07;
  ctx.beginPath();
  ctx.roundRect(-h, -h, size, size, r);
  ctx.fillStyle = '#E7E1D4';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.clip();
  if (print) ctx.drawImage(print, -h, -h, size, size);
  else {
    ctx.fillStyle = '#2A2722';
    ctx.font = `700 ${Math.round(size * 0.34)}px ${sans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(name), 0, size * 0.02);
  }
  ctx.restore();
  if (sticker && print) {
    // the flat neon sticker, half on the print
    ctx.save();
    ctx.translate(side * h * 0.62, h * 0.78);
    ctx.rotate(side * 0.2);
    const s = size * 0.2;
    ctx.fillStyle = '#B5F23D';
    ctx.fillRect(-s / 2, -s * 0.32, s, s * 0.64);
    ctx.restore();
  }
  ctx.restore();
}

/** A print in a small disc (bet story legs). Returns false when there's no print to draw. */
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

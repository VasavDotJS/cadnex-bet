/**
 * Halftone portraits: a photo re-drawn as a grid of dots whose size follows the light, like
 * a newspaper print or the dot-matrix scoreboard. Works on any canvas, so the same portrait
 * appears in the app and in story videos.
 */

export interface HalftoneOptions {
  /** output size in device pixels (square) */
  size: number;
  /** dots across the portrait */
  cells?: number;
  /** 0..1: how much of the print has appeared (rows reveal top to bottom) */
  progress?: number;
  /** dot colours: brightest areas, darkest areas, and the scanner glow while printing */
  ink?: string;
  shadow?: string;
  highlight?: string;
  /** disc behind the dots */
  paper?: string;
}

export interface Prepared {
  /** brightness per cell, row by row, 0..1 after contrast */
  levels: Float32Array;
  cells: number;
}

/**
 * Square crop that keeps the player: tennis photos are mostly upright action or press shots
 * with the head in the upper middle, so zoom in a little and favour the top.
 */
function crop(w: number, h: number): [number, number, number] {
  if (h > w * 1.1) {
    const side = w * 0.86;
    return [(w - side) / 2, h * 0.02, side];
  }
  const side = Math.min(w, h) * 0.78;
  return [(w - side) / 2, (h - side) * 0.12, side];
}

const SUPER = 3; // samples per cell side, averaged, so fine detail survives the shrink

/** Read the photo once into a small grid of brightness levels. */
export function prepareHalftone(img: CanvasImageSource & { width: number; height: number }, cells = 34): Prepared | null {
  const w = (img as HTMLImageElement).naturalWidth || img.width;
  const h = (img as HTMLImageElement).naturalHeight || img.height;
  if (!w || !h) return null;
  const n = cells * SUPER;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const [sx, sy, side] = crop(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, n, n);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, n, n).data;
  } catch {
    return null; // a cross-origin image can't be read; callers fall back to a monogram
  }
  const raw = new Float32Array(cells * cells);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      raw[Math.floor(y / SUPER) * cells + Math.floor(x / SUPER)] += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    }
  }
  for (let i = 0; i < raw.length; i++) raw[i] /= SUPER * SUPER;
  // sharpen against a 3x3 blur so eyes, jawlines and kit edges read even at crest size
  const sharp = new Float32Array(raw.length);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      let sum = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || xx < 0 || yy >= cells || xx >= cells) continue;
          sum += raw[yy * cells + xx];
          k++;
        }
      }
      const v = raw[y * cells + x];
      sharp[y * cells + x] = v + 1.4 * (v - sum / k);
    }
  }
  // stretch between the 3rd and 97th percentiles so every photo prints with deep shadows and clean highlights
  const sorted = Array.from(sharp).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.03)];
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.985))];
  const span = Math.max(0.15, hi - lo);
  const levels = new Float32Array(sharp.length);
  for (let i = 0; i < levels.length; i++) levels[i] = Math.pow(Math.min(1, Math.max(0, (sharp[i] - lo) / span)), 1.0);
  return { levels, cells };
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Draw a prepared portrait as a dotted disc centred at (cx, cy). */
export function drawHalftone(ctx: CanvasRenderingContext2D, p: Prepared, cx: number, cy: number, diameter: number, o: Omit<HalftoneOptions, 'size' | 'cells'> = {}): void {
  const { cells, levels } = p;
  const cell = diameter / cells;
  const r0 = diameter / 2;
  const progress = o.progress ?? 1;
  const ink = rgb(o.ink ?? '#F4F4F6');
  const dim = rgb(o.shadow ?? '#6E6E7C');
  const hl = rgb(o.highlight ?? '#D9FF8A');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r0, 0, Math.PI * 2);
  ctx.fillStyle = o.paper ?? '#121218';
  ctx.fill();
  ctx.clip();
  const shown = progress * (cells + 6);
  const x0 = cx - r0, y0 = cy - r0;
  for (let row = 0; row < cells; row++) {
    const reveal = Math.min(1, Math.max(0, (shown - row) / 6));
    if (reveal <= 0) break;
    // the leading rows of the print glow in the accent colour, like a scanner head passing
    const glow = progress < 1 ? Math.max(0, 1 - Math.abs(shown - 3 - row) / 3) : 0;
    for (let col = 0; col < cells; col++) {
      const x = x0 + (col + 0.5) * cell;
      const y = y0 + (row + 0.5) * cell;
      const d = Math.hypot(x - cx, y - cy) / r0;
      if (d > 1.02) continue;
      // a soft vignette keeps the eye on the player and lets the dots thin out at the rim
      const edge = d < 0.5 ? 1 : Math.max(0, 1 - 0.45 * ((d - 0.5) / 0.5) ** 1.5 - (d > 0.86 ? (d - 0.86) / 0.16 : 0));
      const l = levels[row * cells + col] * edge * reveal;
      const rad = (cell / 2) * Math.sqrt(l) * 0.96;
      if (rad < cell * 0.07) continue;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = glow > 0 ? mix(mix0(dim, ink, l), hl, glow) : mix(dim, ink, Math.min(1, l * 1.15));
      ctx.fill();
    }
  }
  ctx.restore();
}

function mix0(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const u = Math.min(1, t * 1.15);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/** A finished portrait on its own canvas (for drawing into story videos). */
export function halftoneCanvas(img: CanvasImageSource & { width: number; height: number }, o: HalftoneOptions): HTMLCanvasElement | null {
  const p = prepareHalftone(img, o.cells ?? 34);
  if (!p) return null;
  const c = document.createElement('canvas');
  c.width = c.height = o.size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  drawHalftone(ctx, p, o.size / 2, o.size / 2, o.size, o);
  return c;
}

/**
 * "Scanned print" portraits: a photo screened into a fine 45° halftone on warm paper, then run
 * through a tired scanner (crushed blacks, grain, paper mottling, dust, hairline scratches,
 * faint banding). Rendered once per player and size; the same canvas is used in the app and
 * in story videos. Every flaw is seeded by the player's name, so a print never changes.
 */

export interface PrintOptions {
  /** output size in device pixels (square) */
  size: number;
  /** seeds the dust, scratches and grain */
  seed?: string;
  /** paper and ink colours */
  paper?: string;
  ink?: string;
}

const PAPER = '#ECE6DA';
const INK = '#14120F';

/** Small deterministic PRNG (mulberry32), seeded from a string. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Square crop that fills the frame with the player: most lead photos are upright portraits or
 * action shots with the head in the upper middle, so zoom in and favour the top.
 */
export function cropFor(w: number, h: number): [number, number, number] {
  if (h > w * 1.08) {
    const side = w * 0.8;
    return [(w - side) / 2, h * 0.03, side];
  }
  const side = Math.min(w, h) * 0.8;
  return [(w - side) / 2, (h - side) * 0.15, side];
}

/** Smooth value noise in 0..1 on a grid of `cells`, for paper mottling. */
function valueNoise(n: number, cells: number, rand: () => number): Float32Array {
  const g = cells + 2;
  const grid = new Float32Array(g * g).map(() => rand());
  const out = new Float32Array(n * n);
  const s = cells / n;
  for (let y = 0; y < n; y++) {
    const gy = y * s, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < n; x++) {
      const gx = x * s, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
      const a = grid[y0 * g + x0], b = grid[y0 * g + x0 + 1], c = grid[(y0 + 1) * g + x0], d = grid[(y0 + 1) * g + x0 + 1];
      out[y * n + x] = (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    }
  }
  return out;
}

/** The finished print on its own canvas, or null if the photo can't be read. */
export function scanPrint(img: CanvasImageSource & { width: number; height: number }, o: PrintOptions): HTMLCanvasElement | null {
  const n = Math.max(32, Math.round(o.size));
  const w = (img as HTMLImageElement).naturalWidth || img.width;
  const h = (img as HTMLImageElement).naturalHeight || img.height;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const [sx, sy, side] = cropFor(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, n, n);
  let px: ImageData;
  try {
    px = ctx.getImageData(0, 0, n, n);
  } catch {
    return null; // a cross-origin image can't be read; callers fall back to a monogram
  }
  const d = px.data;
  const rand = rng(o.seed ?? 'cadnex');

  // 1. luminance, levels from the 1st–99th percentile, then a hard S-curve that crushes the shadows
  const lum = new Float32Array(n * n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) {
    const l = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    lum[i] = l / 255;
    hist[Math.min(255, Math.round(l))]++;
  }
  const pct = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= q * lum.length) return v / 255;
    return 1;
  };
  const lo = pct(0.01), hi = Math.max(lo + 0.15, pct(0.99));
  const curve = (x: number) => {
    const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
    const s = t < 0.5 ? 0.5 * Math.pow(2 * t, 1.7) : 1 - 0.5 * Math.pow(2 * (1 - t), 1.7);
    return Math.min(1, Math.max(0, (s - 0.05) / 0.92)); // blacks clip a little, like a hot scan
  };

  // 2. a 45° amplitude-modulated screen (cosine spot: round dots → checkerboard → white dots)
  const pitch = Math.min(5, Math.max(2.2, n / 72));
  const k = (2 * Math.PI) / pitch;
  const aa = 0.9 / pitch;
  const mottle = valueNoise(n, 6, rand);
  const fine = valueNoise(n, Math.max(12, Math.round(n / 9)), rand);
  const paper = rgb(o.paper ?? PAPER);
  const ink = rgb(o.ink ?? INK);
  const bandPhase = rand() * 10;
  for (let y = 0; y < n; y++) {
    // faint scanner banding: a slow wave plus a little per-row jitter
    const band = Math.sin(y * 0.07 + bandPhase) * 0.012 + (rand() - 0.5) * 0.018;
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const dark = 1 - curve(lum[i]);
      const u = (x + y) * Math.SQRT1_2, v = (x - y) * Math.SQRT1_2;
      const spot = (Math.cos(k * u) + Math.cos(k * v)) / 4 + 0.5;
      const edge = aa + spot * (1 - 2 * aa);
      const t = Math.min(1, Math.max(0, (dark - edge) / (2 * aa) + 0.5));
      const inkAmt = t * (0.94 + fine[i] * 0.06); // ink never lies down perfectly flat
      // paper: mottled, darker towards the edges (scanner lid shadow), grain everywhere
      const ex = Math.abs(x / n - 0.5) * 2, ey = Math.abs(y / n - 0.5) * 2;
      const burn = Math.pow(Math.max(ex, ey), 6) * 0.16 + (ex * ex + ey * ey) * 0.03;
      const grain = (rand() - 0.5) * 0.09;
      const shade = 1 - burn - (mottle[i] - 0.5) * 0.07 + band + grain;
      for (let ch = 0; ch < 3; ch++) {
        const base = paper[ch] + (ink[ch] - paper[ch]) * inkAmt;
        d[i * 4 + ch] = Math.max(0, Math.min(255, base * shade));
      }
      d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(px, 0, 0);

  // 3. dust, lint and hairline scratches
  const unit = n / 240;
  const specks = Math.round((n * n) / 5200);
  for (let s = 0; s < specks; s++) {
    const r = (0.4 + rand() * rand() * 1.6) * unit;
    ctx.beginPath();
    ctx.arc(rand() * n, rand() * n, r, 0, Math.PI * 2);
    ctx.fillStyle = rand() < 0.6 ? `rgba(20,18,15,${0.35 + rand() * 0.4})` : `rgba(250,246,238,${0.5 + rand() * 0.4})`;
    ctx.fill();
  }
  const scratches = 2 + Math.floor(rand() * 3);
  ctx.lineCap = 'round';
  for (let s = 0; s < scratches; s++) {
    const x0 = rand() * n, y0 = rand() * n;
    const ang = rand() * Math.PI;
    const len = n * (0.15 + rand() * 0.45);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + Math.cos(ang) * len * 0.5 + (rand() - 0.5) * 8 * unit, y0 + Math.sin(ang) * len * 0.5 + (rand() - 0.5) * 8 * unit, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    ctx.lineWidth = (0.35 + rand() * 0.5) * unit;
    ctx.strokeStyle = rand() < 0.7 ? `rgba(248,244,236,${0.35 + rand() * 0.3})` : `rgba(20,18,15,${0.25 + rand() * 0.25})`;
    ctx.stroke();
  }
  // a couple of short lint hairs
  for (let s = 0; s < 2; s++) {
    let x = rand() * n, y = rand() * n;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (rand() - 0.5) * 14 * unit;
      y += (rand() - 0.5) * 14 * unit;
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 0.5 * unit;
    ctx.strokeStyle = 'rgba(20,18,15,0.35)';
    ctx.stroke();
  }
  return c;
}

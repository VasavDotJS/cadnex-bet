/**
 * Randomness.
 * - `cryptoRng` drives real match outcomes: every draw comes from crypto.getRandomValues,
 *   buffered for speed. No seeds, nothing predetermined.
 * - `fastRng` (xorshift128, seeded from crypto) drives Monte Carlo pricing only. Pricing
 *   samples never decide a result, so a fast PRNG is fine there.
 */
export interface Rng {
  next(): number; // [0, 1)
}

const BUF = 4096;

export function createCryptoRng(): Rng {
  const buf = new Uint32Array(BUF);
  let i = BUF;
  return {
    next() {
      if (i >= BUF) {
        crypto.getRandomValues(buf);
        i = 0;
      }
      return buf[i++] / 4294967296;
    },
  };
}

export function createFastRng(): Rng {
  const s = new Uint32Array(4);
  crypto.getRandomValues(s);
  let x = s[0] | 1, y = s[1] | 2, z = s[2] | 4, w = s[3] | 8;
  return {
    next() {
      const t = x ^ (x << 11);
      x = y; y = z; z = w;
      w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
      return w / 4294967296;
    },
  };
}

export const cryptoRng = createCryptoRng();

export function uniform(r: Rng, a: number, b: number): number {
  return a + (b - a) * r.next();
}

export function randInt(r: Rng, a: number, b: number): number {
  return a + Math.floor(r.next() * (b - a + 1));
}

export function chance(r: Rng, p: number): boolean {
  return r.next() < p;
}

/** Standard normal via Box–Muller. */
export function normal(r: Rng, mean = 0, sd = 1): number {
  let u = 0;
  while (u === 0) u = r.next();
  const v = r.next();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[Math.floor(r.next() * arr.length)];
}

export function weighted<T>(r: Rng, items: readonly T[], weight: (t: T) => number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  let x = r.next() * total;
  for (const it of items) {
    x -= Math.max(0, weight(it));
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

/** Poisson sample (Knuth for small lambda, normal approx above 30). */
export function poisson(r: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(normal(r, lambda, Math.sqrt(lambda))));
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= r.next(); } while (p > L);
  return k - 1;
}

export function shuffle<T>(r: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Shared market helpers: outcome tallies, fair odds, handicap and total settlement. */
import type { LegResult } from '../lib/money';
import type { Side } from './types';

export interface SelDef {
  code: string;
  label: string;
}

export type Settled = Record<string, LegResult>;

export interface Tally {
  w: number; hw: number; p: number; hl: number; l: number;
}

// ── shared helpers ──

export function emptyTally(): Tally {
  return { w: 0, hw: 0, p: 0, hl: 0, l: 0 };
}

export function addResult(t: Tally, r: LegResult, weight = 1): void {
  switch (r) {
    case 'WON': t.w += weight; break;
    case 'HALF_WON': t.hw += weight; break;
    case 'PUSH':
    case 'VOID': t.p += weight; break;
    case 'HALF_LOST': t.hl += weight; break;
    default: t.l += weight;
  }
}

/** Fair decimal odds from an outcome distribution (expected return = 1). */
export function fairOddsFromTally(t: Tally): number {
  const n = t.w + t.hw + t.p + t.hl + t.l;
  if (n <= 0) return Infinity;
  const pw = t.w / n, phw = t.hw / n, pp = t.p / n, phl = t.hl / n;
  const den = pw + phw / 2;
  if (den <= 0) return Infinity;
  const num = 1 - phw / 2 - pp - phl / 2;
  return Math.max(1.0001, num / den);
}

/** Two-way result from a single number: >0 win, 0 push, <0 loss. */
function sign(x: number): LegResult {
  return x > 1e-9 ? 'WON' : x < -1e-9 ? 'LOST' : 'PUSH';
}

/** Asian handicap result for margin `diff` (selection's goals minus opponent's) and line. */
export function asianResult(diff: number, line: number): LegResult {
  const frac = Math.abs(line * 4) % 2;
  if (frac === 1) {
    const a = sign(diff + line - 0.25);
    const b = sign(diff + line + 0.25);
    if (a === b) return a;
    const pair = [a, b].sort().join(',');
    if (pair === 'PUSH,WON') return 'HALF_WON';
    if (pair === 'LOST,PUSH') return 'HALF_LOST';
    return a;
  }
  return sign(diff + line);
}

/** Over/under on a total (supports quarter lines). */
export function totalResult(total: number, line: number, over: boolean): LegResult {
  return over ? asianResult(total, -line) : asianResult(-total, line);
}

export function fmtLine(l: number, signed = false): string {
  const s = Number.isInteger(l * 2) ? l.toFixed(1) : l.toFixed(2);
  if (!signed) return s;
  return l > 0 ? `+${s}` : l === 0 ? '0.0' : s;
}

export function ou(over: boolean): Settled {
  return over ? { o: 'WON', u: 'LOST' } : { o: 'LOST', u: 'WON' };
}

export function sideWin(w: Side | null, codes: [string, string, string?]): Settled {
  const [h, a, d] = codes;
  const r: Settled = { [h]: w === 0 ? 'WON' : 'LOST', [a]: w === 1 ? 'WON' : 'LOST' };
  if (d) r[d] = w === null ? 'WON' : 'LOST';
  return r;
}

export function allVoid(sels: SelDef[]): Settled {
  const r: Settled = {};
  for (const s of sels) r[s.code] = 'VOID';
  return r;
}

export function poissonCdf(k: number, lambda: number): number {
  // P(X <= k)
  if (k < 0) return 0;
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= k; i++) {
    term *= lambda / i;
    sum += term;
  }
  return Math.min(1, sum);
}

export function poissonPmf(lambda: number, max: number): number[] {
  const out: number[] = [];
  let term = Math.exp(-lambda);
  for (let i = 0; i <= max; i++) {
    out.push(term);
    term *= lambda / (i + 1);
  }
  return out;
}

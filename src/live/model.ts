/**
 * Contract for pricing and settling markets on real matches.
 * A model reads the latest FeedEvent plus a small memory the engine keeps per match
 * (pre-match strengths, goal order, history) and never invents results.
 */
import type { SportId } from '../data/types';
import type { SelDef, Settled, Tally } from '../engine/sport';
import type { FeedEvent } from '../feed/types';

export interface MarketSpec {
  key: string;
  name: string;
  group: string;
  order: number;
  line?: number;
  margin: number;
  sels: SelDef[];
}

export interface Memory {
  /** pre-match strength parameters, frozen at kick-off */
  pre?: Record<string, number | string>;
  preKey?: string;
  /** side of each goal in order; null where we could not tell */
  goals: (0 | 1 | null)[];
  lastScore: [number, number];
  history: number[];
  histAt?: number;
  momentum: number;
  recent: { at: number; h: number; a: number; sh: number; sa: number }[];
  derived: { id: string; at: number; clock: string; kind: string; side?: 0 | 1; text: string; major?: boolean }[];
  seq: number;
}

export interface Model {
  sport: SportId;
  /** compute pre-match parameters (from odds, ratings or records) */
  prematch(ev: FeedEvent): Record<string, number | string>;
  /** market keys to offer in the current state */
  keys(ev: FeedEvent, mem: Memory): string[];
  spec(key: string, ev: FeedEvent): MarketSpec | null;
  /** outcome distribution per selection for each market */
  price(ev: FeedEvent, mem: Memory, specs: MarketSpec[]): Map<string, Record<string, Tally>>;
  /**
   * Settle a market. With final=false return a result only if it is already certain.
   * With final=true return the result, or null when the data can't decide it (→ void).
   */
  settle(key: string, ev: FeedEvent, mem: Memory, final: boolean): Settled | null;
}

export function newMemory(): Memory {
  return { goals: [], lastScore: [0, 0], history: [], momentum: 0, recent: [], derived: [], seq: 0 };
}

// ── maths ──

export function erf(x: number): number {
  // Abramowitz–Stegun 7.1.26
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** Standard normal CDF. */
export function phi(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** Inverse normal CDF (Acklam). */
export function phiInv(p: number): number {
  const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (q < pl) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - pl) {
    const r = Math.sqrt(-2 * Math.log(1 - q));
    return -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  const r = q - 0.5;
  const t = r * r;
  return (((((a[0] * t + a[1]) * t + a[2]) * t + a[3]) * t + a[4]) * t + a[5]) * r / (((((b[0] * t + b[1]) * t + b[2]) * t + b[3]) * t + b[4]) * t + 1);
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** Bookmaker-style implied probabilities from decimal odds, overround removed. */
export function implied(odds: (number | undefined)[]): number[] | null {
  if (odds.some((o) => !o || o <= 1)) return null;
  const raw = odds.map((o) => 1 / (o as number));
  const s = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => r / s);
}

/** Win/loss tally from a probability. */
export function wl(p: number): Tally {
  const q = clamp(p, 0, 1);
  return { w: q, hw: 0, p: 0, hl: 0, l: 1 - q };
}

/** "W-D-L" or "W-L" record → points-per-game style strength in [-1, 1]. */
export function recordStrength(record?: string, form?: string): number | null {
  let s: number | null = null;
  const m = record?.match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (m) {
    const w = Number(m[1]);
    const x = Number(m[2]);
    const y = m[3] !== undefined ? Number(m[3]) : null;
    const games = w + x + (y ?? 0);
    if (games > 0) s = y !== null ? ((3 * w + x) / games - 1.4) / 1.4 : (w / games - 0.5) * 2;
  }
  if (form && /^[WDL]{2,}$/i.test(form)) {
    const pts = form.toUpperCase().split('').reduce((a, c) => a + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0) / form.length;
    const f = (pts - 1.4) / 1.4;
    s = s === null ? f * 0.7 : s * 0.7 + f * 0.3;
  }
  return s === null ? null : clamp(s, -1, 1);
}

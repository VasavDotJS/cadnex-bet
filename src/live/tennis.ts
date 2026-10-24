/**
 * Tennis on real data. Each player has a chance of winning any game, set from the
 * pre-match price (odds, then ranking). Exact set and match probabilities follow from
 * the real games and sets so far. A retirement or walkover voids undecided markets.
 */
import { Settled, Tally } from '../engine/sport';
import type { FeedEvent } from '../feed/types';
import { clamp, implied, MarketSpec, Memory, Model, wl } from './model';

export interface SetsState {
  sets: [number, number];
  /** games in the set in progress (null when between sets) */
  cur: [number, number] | null;
  /** winner of each completed set */
  winners: (0 | 1)[];
}

export function setComplete(a: number, b: number): boolean {
  return (a >= 6 || b >= 6) && (Math.abs(a - b) >= 2 || a === 7 || b === 7);
}

export function setsState(ev: FeedEvent): SetsState {
  const n = Math.max(ev.home.lines.length, ev.away.lines.length);
  const winners: (0 | 1)[] = [];
  let cur: [number, number] | null = null;
  for (let i = 0; i < n; i++) {
    const a = ev.home.lines[i] ?? 0;
    const b = ev.away.lines[i] ?? 0;
    const last = i === n - 1;
    const done = setComplete(a, b) || (!last) || (ev.status === 'FINISHED' && a !== b && !ev.extra.retired && !ev.extra.walkover);
    if (done && a !== b) winners.push(a > b ? 0 : 1);
    else cur = [a, b];
  }
  const sets: [number, number] = [winners.filter((w) => w === 0).length, winners.filter((w) => w === 1).length];
  return { sets, cur, winners };
}

/** P(player A wins the set) from games (a, b), given A's chance per game g. */
function setProb(g: number, a: number, b: number, memo: Map<string, number>): number {
  if ((a >= 6 && a - b >= 2) || a === 7) return 1;
  if ((b >= 6 && b - a >= 2) || b === 7) return 0;
  if (a === 6 && b === 6) return clamp(0.5 + (g - 0.5) * 1.6, 0.03, 0.97);
  const k = `${a},${b}`;
  const v = memo.get(k);
  if (v !== undefined) return v;
  const r = g * setProb(g, a + 1, b, memo) + (1 - g) * setProb(g, a, b + 1, memo);
  memo.set(k, r);
  return r;
}

/** Distribution over final set scores, from the current state. */
export function finalSets(g: number, bestOf: number, st: SetsState): Map<string, number> {
  const need = Math.ceil(bestOf / 2);
  const memo = new Map<string, number>();
  const pFresh = setProb(g, 0, 0, memo);
  const out = new Map<string, number>();
  const rec = (sa: number, sb: number, p: number, first: number | null) => {
    if (p < 1e-12) return;
    if (sa === need || sb === need) {
      const k = `${sa}-${sb}`;
      out.set(k, (out.get(k) ?? 0) + p);
      return;
    }
    const q = first ?? pFresh;
    rec(sa + 1, sb, p * q, null);
    rec(sa, sb + 1, p * (1 - q), null);
  };
  const first = st.cur ? setProb(g, st.cur[0], st.cur[1], memo) : null;
  rec(st.sets[0], st.sets[1], 1, first);
  return out;
}

function matchProbFromG(g: number, bestOf: number): number {
  let p = 0;
  for (const [k, v] of finalSets(g, bestOf, { sets: [0, 0], cur: null, winners: [] })) {
    const [a, b] = k.split('-').map(Number);
    if (a > b) p += v;
  }
  return p;
}

/** Find the per-game chance g that reproduces a pre-match win probability. */
export function gameProbFor(pMatch: number, bestOf: number): number {
  let lo = 0.3, hi = 0.7;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (matchProbFromG(mid, bestOf) < pMatch) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function prematch(ev: FeedEvent): Record<string, number | string> {
  const bo = ev.extra.bestOf ?? 3;
  const o = ev.odds;
  const p = o ? implied([o.home, o.away]) : null;
  if (p) return { g: gameProbFor(p[0], bo), src: 'odds' };
  const r0 = ev.home.rank, r1 = ev.away.rank;
  if (r0 && r1) {
    const pm = 1 / (1 + Math.pow(r0 / r1, 0.55));
    return { g: gameProbFor(clamp(pm, 0.1, 0.9), bo), src: 'ranking' };
  }
  return { g: 0.5, src: 'default' };
}

function keys(ev: FeedEvent): string[] {
  if (ev.status !== 'SCHEDULED' && ev.status !== 'LIVE') return [];
  if (ev.extra.retired || ev.extra.walkover) return [];
  const st = setsState(ev);
  const bo = ev.extra.bestOf ?? 3;
  const out = ['mw', 'sb', `ts:${bo === 5 ? 3.5 : 2.5}`];
  const setNo = st.sets[0] + st.sets[1] + 1;
  if (setNo <= bo) out.push(`sw:${setNo}`);
  return out;
}

function sbCodes(bo: number): string[] {
  const need = Math.ceil(bo / 2);
  const c: string[] = [];
  for (let l = 0; l < need; l++) c.push(`${need}-${l}`);
  for (let l = need - 1; l >= 0; l--) c.push(`${l}-${need}`);
  return c;
}

function spec(key: string, ev: FeedEvent): MarketSpec | null {
  const [kind, arg] = key.split(':');
  const [A, B] = [ev.home.short, ev.away.short];
  const bo = ev.extra.bestOf ?? 3;
  const two = [{ code: '1', label: ev.home.name }, { code: '2', label: ev.away.name }];
  switch (kind) {
    case 'mw': return { key, name: 'Match winner', group: 'Main', order: 1, margin: 0.045, sels: two };
    case 'sb': return { key, name: 'Set betting', group: 'Main', order: 2, margin: 0.08, sels: sbCodes(bo).map((c) => { const [x, y] = c.split('-').map(Number); return { code: c, label: x > y ? `${A} ${x}–${y}` : `${B} ${y}–${x}` }; }) };
    case 'ts': return { key, name: `Total sets ${arg}`, group: 'Sets', order: 5, line: Number(arg), margin: 0.06, sels: [{ code: 'o', label: `Over ${arg}` }, { code: 'u', label: `Under ${arg}` }] };
    case 'sw': return { key, name: `Set ${arg} winner`, group: 'Sets', order: 10 + Number(arg), margin: 0.05, sels: two };
  }
  return null;
}

function price(ev: FeedEvent, mem: Memory, specs: MarketSpec[]): Map<string, Record<string, Tally>> {
  const g = Number((mem.pre ?? prematch(ev)).g);
  const bo = ev.extra.bestOf ?? 3;
  const st = setsState(ev);
  const fs = finalSets(g, bo, st);
  const out = new Map<string, Record<string, Tally>>();
  for (const s of specs) {
    const [kind, arg] = s.key.split(':');
    if (kind === 'mw') {
      let p = 0;
      for (const [k, v] of fs) { const [a, b] = k.split('-').map(Number); if (a > b) p += v; }
      out.set(s.key, { '1': wl(p), '2': wl(1 - p) });
    } else if (kind === 'sb') {
      const t: Record<string, Tally> = {};
      for (const c of sbCodes(bo)) t[c] = wl(fs.get(c) ?? 0);
      out.set(s.key, t);
    } else if (kind === 'ts') {
      const L = Number(arg);
      let p = 0;
      for (const [k, v] of fs) { const [a, b] = k.split('-').map(Number); if (a + b > L) p += v; }
      out.set(s.key, { o: wl(p), u: wl(1 - p) });
    } else if (kind === 'sw') {
      const n = Number(arg);
      const played = st.sets[0] + st.sets[1];
      const memo = new Map<string, number>();
      const p = n === played + 1 && st.cur ? setProb(g, st.cur[0], st.cur[1], memo) : setProb(g, 0, 0, memo);
      out.set(s.key, { '1': wl(p), '2': wl(1 - p) });
    }
  }
  return out;
}

function settle(key: string, ev: FeedEvent, _mem: Memory, final: boolean): Settled | null {
  const [kind, arg] = key.split(':');
  const st = setsState(ev);
  if (kind === 'sw') {
    const w = st.winners[Number(arg) - 1];
    if (w === undefined) return null;
    return w === 0 ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' };
  }
  if (!final || ev.extra.retired || ev.extra.walkover) return null;
  const bo = ev.extra.bestOf ?? 3;
  const need = Math.ceil(bo / 2);
  const [a, b] = st.sets;
  if (a !== need && b !== need) {
    // trust ESPN's winner flag if the set count looks incomplete
    if (ev.home.winner === undefined && ev.away.winner === undefined) return null;
  }
  const homeWon = a === need || (a !== need && b !== need && ev.home.winner === true);
  if (kind === 'mw') return homeWon ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' };
  if (a !== need && b !== need) return null;
  if (kind === 'sb') {
    const r: Settled = {};
    for (const c of sbCodes(bo)) r[c] = c === `${a}-${b}` ? 'WON' : 'LOST';
    return r;
  }
  if (kind === 'ts') return a + b > Number(arg) ? { o: 'WON', u: 'LOST' } : { o: 'LOST', u: 'WON' };
  return null;
}

export const tennisModel: Model = { sport: 'tennis', prematch, keys, spec, price, settle };

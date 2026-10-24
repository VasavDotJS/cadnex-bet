/**
 * Football on real data. Pre-match goal expectations come from bookmaker odds in the feed,
 * then from CADNEX's club ratings, then from league records and form. In play, the
 * remaining goals are Poisson given the real minute, score and red cards. Markets settle
 * on the 90-minute score.
 */
import { FOOTBALL_TEAMS } from '../data/football';
import { addResult, asianResult, emptyTally, fmtLine, ou, poissonPmf, Settled, sideWin, Tally } from '../engine/sport';
import { parseMinute } from '../feed/espn';
import type { FeedEvent } from '../feed/types';
import { clamp, implied, MarketSpec, Memory, Model, recordStrength } from './model';

const MAXG = 8;

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(fc|cf|afc|sc|ac|as|ssc|club|de|the|cd|ca|sl|sv|vfl|vfb|rc|ogc|losc|1\.)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const RATED = FOOTBALL_TEAMS.map((t) => ({ t, n: norm(t.name) }));

function rating(name: string) {
  const n = norm(name);
  return RATED.find((r) => r.n === n || (n.length > 4 && (r.n.includes(n) || n.includes(r.n))))?.t;
}

function poissonProbs(lh: number, la: number): { h: number; d: number; a: number } {
  const ph = poissonPmf(lh, 10);
  const pa = poissonPmf(la, 10);
  let h = 0, d = 0, a = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = ph[i] * pa[j];
    if (i > j) h += p; else if (i === j) d += p; else a += p;
  }
  return { h, d, a };
}

/** Find goal expectations that reproduce the market's home/away probabilities. */
export function solveLambdas(pH: number, pA: number, total = 2.65): { lh: number; la: number } {
  let best = { lh: 1.45, la: 1.15, err: Infinity };
  for (let share = 0.15; share <= 0.85; share += 0.01) {
    for (const t of [total - 0.35, total, total + 0.35]) {
      const lh = t * share;
      const la = t * (1 - share);
      const p = poissonProbs(lh, la);
      const err = (p.h - pH) ** 2 + (p.a - pA) ** 2;
      if (err < best.err) best = { lh, la, err };
    }
  }
  return { lh: best.lh, la: best.la };
}

function prematch(ev: FeedEvent): Record<string, number | string> {
  const o = ev.odds;
  const p = o ? implied([o.home, o.draw, o.away]) : null;
  if (p) {
    const total = o?.total ? o.total + 0.15 : 2.65;
    const { lh, la } = solveLambdas(p[0], p[2], total);
    return { lh, la, src: 'odds' };
  }
  const rh = rating(ev.home.name);
  const ra = rating(ev.away.name);
  if (rh && ra) {
    const lam = (me: typeof rh, op: typeof rh, home: boolean) =>
      Math.exp((me.attack - op.defence) / 36 + (me.midfield - op.midfield) / 90) * (home ? 1.08 + me.home * 0.12 : 0.94);
    return { lh: lam(rh, ra, true), la: lam(ra, rh, false), src: 'ratings' };
  }
  const sh = recordStrength(ev.home.record, ev.home.form) ?? 0;
  const sa = recordStrength(ev.away.record, ev.away.form) ?? 0;
  return { lh: 1.42 * Math.exp(0.45 * (sh - sa)), la: 1.12 * Math.exp(0.45 * (sa - sh)), src: sh || sa ? 'form' : 'default' };
}

/** Effective minute of play (0–95) from the real clock. */
export function minuteOf(ev: FeedEvent): number {
  if (ev.status === 'SCHEDULED') return 0;
  if (ev.status !== 'LIVE') return 95;
  if (ev.clock === 'HT' || /HALFTIME/.test(ev.statusName)) return 46;
  const m = parseMinute(ev.clock);
  if (m) return Math.min(m.minute, 95);
  return ev.period >= 2 ? 60 : 20;
}

function reds(ev: FeedEvent): [number, number] {
  const r: [number, number] = [0, 0];
  for (const i of ev.incidents) if (i.kind === 'red' && i.side !== undefined) r[i.side]++;
  r[0] = Math.max(r[0], ev.home.stats.red ?? 0);
  r[1] = Math.max(r[1], ev.away.stats.red ?? 0);
  return r;
}

/** Remaining expected goals for each side. */
export function remaining(ev: FeedEvent, mem: Memory): [number, number] {
  const pre = mem.pre ?? prematch(ev);
  const lh = Number(pre.lh), la = Number(pre.la);
  const minute = minuteOf(ev);
  if (ev.status !== 'SCHEDULED' && ev.status !== 'LIVE') return [0, 0];
  const r = clamp((95 - minute) / 95, 0, 1);
  const [rh, ra] = reds(ev);
  const diff = ev.home.score - ev.away.score;
  const late = clamp((minute - 55) / 35, 0, 1);
  const state = (d: number) => (d > 0 ? 0.9 : d < 0 ? 1 + 0.25 * late : 1);
  return [
    lh * r * Math.pow(0.7, rh) * Math.pow(1.18, ra) * state(diff),
    la * r * Math.pow(0.7, ra) * Math.pow(1.18, rh) * state(-diff),
  ];
}

const CS: [number, number][] = [];
for (let h = 0; h <= 3; h++) for (let a = 0; a <= 3; a++) CS.push([h, a]);

function spec(key: string, ev: FeedEvent): MarketSpec | null {
  const [H, A] = [ev.home.short, ev.away.short];
  const [kind, arg] = key.split(':');
  const L = arg !== undefined ? Number(arg) : undefined;
  switch (kind) {
    case '1x2': return { key, name: 'Match result', group: 'Main', order: 1, margin: 0.05, sels: [{ code: '1', label: ev.home.name }, { code: 'X', label: 'Draw' }, { code: '2', label: ev.away.name }] };
    case 'dc': return { key, name: 'Double chance', group: 'Main', order: 2, margin: 0.05, sels: [{ code: '1X', label: `${H} or draw` }, { code: '12', label: `${H} or ${A}` }, { code: 'X2', label: `Draw or ${A}` }] };
    case 'dnb': return { key, name: 'Draw no bet', group: 'Main', order: 3, margin: 0.05, sels: [{ code: '1', label: ev.home.name }, { code: '2', label: ev.away.name }] };
    case 'ng': return { key, name: `Goal ${L}: next to score`, group: 'Main', order: 4, line: L, margin: 0.06, sels: [{ code: '1', label: ev.home.name }, { code: 'none', label: 'No goal' }, { code: '2', label: ev.away.name }] };
    case 'btts': return { key, name: 'Both teams to score', group: 'Goals', order: 5, margin: 0.07, sels: [{ code: 'y', label: 'Yes' }, { code: 'n', label: 'No' }] };
    case 'ou': return { key, name: `Total goals ${fmtLine(L!)}`, group: 'Goals', order: 10 + L!, line: L, margin: 0.06, sels: [{ code: 'o', label: `Over ${fmtLine(L!)}` }, { code: 'u', label: `Under ${fmtLine(L!)}` }] };
    case 'oe': return { key, name: 'Total goals odd/even', group: 'Goals', order: 20, margin: 0.05, sels: [{ code: 'odd', label: 'Odd' }, { code: 'even', label: 'Even' }] };
    case 'ah': return { key, name: `Asian handicap ${H} ${fmtLine(L!, true)}`, group: 'Handicap', order: 30 + L!, line: L, margin: 0.05, sels: [{ code: 'h', label: `${H} ${fmtLine(L!, true)}` }, { code: 'a', label: `${A} ${fmtLine(-L!, true)}` }] };
    case 'cs': return {
      key, name: 'Correct score', group: 'Specials', order: 60, margin: 0.16,
      sels: [...CS.map(([h, a]) => ({ code: `${h}-${a}`, label: `${h}–${a}` })), { code: 'oh', label: `Other ${H} win` }, { code: 'od', label: 'Other draw' }, { code: 'oa', label: `Other ${A} win` }],
    };
    case 'wm': {
      const codes = ['h1', 'h2', 'h3', 'd', 'a1', 'a2', 'a3'];
      const labels = [`${H} by 1`, `${H} by 2`, `${H} by 3+`, 'Draw', `${A} by 1`, `${A} by 2`, `${A} by 3+`];
      return { key, name: 'Winning margin', group: 'Specials', order: 61, margin: 0.1, sels: codes.map((c, i) => ({ code: c, label: labels[i] })) };
    }
  }
  return null;
}

/** Settle a score-based market from a (90-minute) score. */
function byScore(key: string, h: number, a: number): Settled | null {
  const [kind, arg] = key.split(':');
  const L = Number(arg);
  const w = h > a ? 0 : a > h ? 1 : null;
  switch (kind) {
    case '1x2': return sideWin(w, ['1', '2', 'X']);
    case 'dc': return { '1X': w !== 1 ? 'WON' : 'LOST', '12': w !== null ? 'WON' : 'LOST', X2: w !== 0 ? 'WON' : 'LOST' };
    case 'dnb': return w === null ? { '1': 'VOID', '2': 'VOID' } : sideWin(w, ['1', '2']);
    case 'btts': return h > 0 && a > 0 ? { y: 'WON', n: 'LOST' } : { y: 'LOST', n: 'WON' };
    case 'ou': return ou(h + a > L);
    case 'oe': return (h + a) % 2 ? { odd: 'WON', even: 'LOST' } : { odd: 'LOST', even: 'WON' };
    case 'ah': return { h: asianResult(h - a, L), a: asianResult(a - h, -L) };
    case 'cs': {
      const r: Settled = {};
      const listed = h <= 3 && a <= 3;
      for (const [x, y] of CS) r[`${x}-${y}`] = x === h && y === a ? 'WON' : 'LOST';
      r.oh = !listed && h > a ? 'WON' : 'LOST';
      r.od = !listed && h === a ? 'WON' : 'LOST';
      r.oa = !listed && a > h ? 'WON' : 'LOST';
      return r;
    }
    case 'wm': {
      const d = h - a;
      const win = d === 0 ? 'd' : `${d > 0 ? 'h' : 'a'}${Math.min(3, Math.abs(d))}`;
      const r: Settled = {};
      for (const c of ['h1', 'h2', 'h3', 'd', 'a1', 'a2', 'a3']) r[c] = c === win ? 'WON' : 'LOST';
      return r;
    }
  }
  return null;
}

/**
 * The 90-minute score. Equal to the final score unless the match went to extra time,
 * in which case it's rebuilt from goal times. Own goals are credited whichever way makes
 * the goal list agree with the final score; if nothing agrees, return null (→ void).
 */
export function regulationScore(ev: FeedEvent): [number, number] | null {
  if (!ev.extra.aet && !ev.extra.pens) return [ev.home.score, ev.away.score];
  const goals = ev.incidents.filter((i) => (i.kind === 'goal' || i.kind === 'penalty' || i.kind === 'owngoal') && i.side !== undefined);
  for (const flip of [false, true]) {
    const all: [number, number] = [0, 0];
    const reg: [number, number] = [0, 0];
    for (const g of goals) {
      const side = (g.kind === 'owngoal' && flip ? 1 - g.side! : g.side!) as 0 | 1;
      all[side]++;
      if (!g.extraTime) reg[side]++;
    }
    if (all[0] === ev.home.score && all[1] === ev.away.score) return reg;
  }
  return null;
}

function keys(ev: FeedEvent, mem: Memory): string[] {
  if (ev.status !== 'SCHEDULED' && ev.status !== 'LIVE') return [];
  if (ev.extra.aet || /EXTRA|OVERTIME|SHOOTOUT|PENALT/.test(ev.statusName)) return [];
  const total = ev.home.score + ev.away.score;
  const out = ['1x2', 'dc', 'dnb', 'btts', 'cs', 'wm', 'oe', `ng:${total + 1}`];
  let n = 0;
  for (let L = 0.5; L <= 7.5 && n < 5; L += 1) if (L > total) { out.push(`ou:${L}`); n++; }
  const [rh, ra] = remaining(ev, mem);
  const exp = ev.home.score - ev.away.score + rh - ra;
  const centre = Math.round(-exp * 4) / 4;
  for (let d = -0.5; d <= 0.5; d += 0.25) {
    const l = Math.round((centre + d) * 4) / 4;
    out.push(`ah:${l === 0 ? 0 : l}`);
  }
  return out;
}

function price(ev: FeedEvent, mem: Memory, specs: MarketSpec[]): Map<string, Record<string, Tally>> {
  const out = new Map<string, Record<string, Tally>>();
  const [rh, ra] = remaining(ev, mem);
  const ph = poissonPmf(rh, MAXG);
  const pa = poissonPmf(ra, MAXG);
  const grid = specs.filter((s) => !s.key.startsWith('ng:'));
  for (const s of grid) {
    const t: Record<string, Tally> = {};
    for (const sel of s.sels) t[sel.code] = emptyTally();
    out.set(s.key, t);
  }
  for (let x = 0; x <= MAXG; x++) for (let y = 0; y <= MAXG; y++) {
    const p = ph[x] * pa[y];
    if (p < 1e-9) continue;
    const h = ev.home.score + x;
    const a = ev.away.score + y;
    for (const s of grid) {
      const r = byScore(s.key, h, a);
      if (!r) continue;
      const t = out.get(s.key)!;
      for (const code in r) if (t[code]) addResult(t[code], r[code], p);
    }
  }
  for (const s of specs.filter((x) => x.key.startsWith('ng:'))) {
    const lam = rh + ra;
    const any = 1 - Math.exp(-lam);
    const pH = lam > 0 ? (rh / lam) * any : 0;
    const pA = lam > 0 ? (ra / lam) * any : 0;
    out.set(s.key, {
      '1': { w: pH, hw: 0, p: 0, hl: 0, l: 1 - pH },
      none: { w: 1 - any, hw: 0, p: 0, hl: 0, l: any },
      '2': { w: pA, hw: 0, p: 0, hl: 0, l: 1 - pA },
    });
  }
  return out;
}

function settle(key: string, ev: FeedEvent, mem: Memory, final: boolean): Settled | null {
  const [kind, arg] = key.split(':');
  if (kind === 'ng') {
    const n = Number(arg);
    const g = mem.goals[n - 1];
    if (g === null) return null; // couldn't tell who scored it
    if (g !== undefined) return { '1': g === 0 ? 'WON' : 'LOST', none: 'LOST', '2': g === 1 ? 'WON' : 'LOST' };
    if (!final) return null;
    const reg = regulationScore(ev);
    if (!reg) return null;
    return reg[0] + reg[1] < n ? { '1': 'LOST', none: 'WON', '2': 'LOST' } : null;
  }
  if (!final) {
    if (ev.extra.aet) return null;
    const h = ev.home.score, a = ev.away.score;
    if (kind === 'ou' && h + a > Number(arg)) return ou(true);
    if (kind === 'btts' && h > 0 && a > 0) return { y: 'WON', n: 'LOST' };
    return null;
  }
  const reg = regulationScore(ev);
  return reg ? byScore(key, reg[0], reg[1]) : null;
}

export const footballModel: Model = { sport: 'football', prematch, keys, spec, price, settle };

/**
 * Basketball (NBA) on real data. The final margin and total are modelled as normal
 * variables: their centre comes from the bookmaker spread and total in the feed (or team
 * records), and their spread shrinks with the real game clock. Overtime counts.
 */
import { fmtLine, ou, Settled, Tally } from '../engine/sport';
import type { FeedEvent } from '../feed/types';
import { clamp, implied, MarketSpec, Memory, Model, phi, phiInv, recordStrength, wl } from './model';

const SD_MARGIN = 12.5;
const SD_TOTAL = 18;
const DEFAULT_TOTAL = 226;

function prematch(ev: FeedEvent): Record<string, number | string> {
  const o = ev.odds;
  let mu: number | null = null;
  let src = 'default';
  if (o?.spreadHome !== undefined) { mu = -o.spreadHome; src = 'spread'; }
  else {
    const p = o ? implied([o.home, o.away]) : null;
    if (p) { mu = SD_MARGIN * phiInv(p[0]); src = 'moneyline'; }
  }
  if (mu === null) {
    const sh = recordStrength(ev.home.record) ?? 0;
    const sa = recordStrength(ev.away.record) ?? 0;
    mu = 2.5 + 7 * (sh - sa);
    if (sh || sa) src = 'records';
  }
  return { mu, total: o?.total ?? DEFAULT_TOTAL, src };
}

function parseClock(clock: string): number | null {
  const m = clock.match(/(\d+):(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const s = clock.match(/(\d+(?:\.\d+)?)\s*$/);
  return s ? Number(s[1]) / 60 : null;
}

/** Fraction of regulation remaining (overtime adds 5/48 per period). */
export function remainingFraction(ev: FeedEvent): number {
  if (ev.status === 'SCHEDULED') return 1;
  if (ev.status !== 'LIVE') return 0;
  if (/half/i.test(ev.clock)) return 0.5;
  const p = Math.max(1, ev.period);
  const left = parseClock(ev.clock.replace(/^Q\d|^\d?OT/, '').trim()) ?? (/^end/i.test(ev.clock) ? 0 : 6);
  if (p <= 4) return clamp(((4 - p) * 12 + Math.min(12, left)) / 48, 0, 1);
  return clamp(Math.min(5, left) / 48, 0, 0.11);
}

interface Dist { mMean: number; mSd: number; tMean: number; tSd: number; f: number }

function dist(ev: FeedEvent, mem: Memory): Dist {
  const pre = mem.pre ?? prematch(ev);
  const mu = Number(pre.mu);
  const T = Number(pre.total);
  const r = remainingFraction(ev);
  const played = 1 - r;
  const curM = ev.home.score - ev.away.score;
  const curT = ev.home.score + ev.away.score;
  const pace = played > 0.2 && ev.period <= 4 ? curT / played : T;
  const rate = 0.65 * T + 0.35 * pace;
  return {
    mMean: curM + mu * r,
    mSd: Math.max(0.01, SD_MARGIN * Math.sqrt(r)),
    tMean: curT + rate * r,
    tSd: Math.max(0.01, SD_TOTAL * Math.sqrt(r)),
    f: r,
  };
}

function currentQuarter(ev: FeedEvent): number {
  if (ev.status === 'SCHEDULED') return 1;
  if (/half/i.test(ev.clock)) return 3;
  if (/^end/i.test(ev.clock)) return Math.min(4, ev.period + 1);
  return Math.min(4, Math.max(1, ev.period));
}

function keys(ev: FeedEvent, mem: Memory): string[] {
  if (ev.status !== 'SCHEDULED' && ev.status !== 'LIVE') return [];
  const d = dist(ev, mem);
  const sc = Math.round(-d.mMean) + 0.5;
  const tc = Math.round(d.tMean) + 0.5;
  const out = ['ml', `sp:${sc - 3}`, `sp:${sc}`, `sp:${sc + 3}`, `tot:${tc - 6}`, `tot:${tc}`, `tot:${tc + 6}`];
  if (ev.period <= 4) out.push(`q:${currentQuarter(ev)}`);
  return out;
}

function spec(key: string, ev: FeedEvent): MarketSpec | null {
  const [kind, arg] = key.split(':');
  const L = Number(arg);
  const [H, A] = [ev.home.short, ev.away.short];
  switch (kind) {
    case 'ml': return { key, name: 'Moneyline (incl. overtime)', group: 'Main', order: 1, margin: 0.045, sels: [{ code: '1', label: ev.home.name }, { code: '2', label: ev.away.name }] };
    case 'sp': return { key, name: `Spread ${H} ${fmtLine(L, true)}`, group: 'Main', order: 2 + Math.abs(L) / 1000, line: L, margin: 0.045, sels: [{ code: 'h', label: `${H} ${fmtLine(L, true)}` }, { code: 'a', label: `${A} ${fmtLine(-L, true)}` }] };
    case 'tot': return { key, name: `Total points ${fmtLine(L)}`, group: 'Main', order: 3 + L / 100000, line: L, margin: 0.045, sels: [{ code: 'o', label: `Over ${fmtLine(L)}` }, { code: 'u', label: `Under ${fmtLine(L)}` }] };
    case 'q': return { key, name: `Quarter ${L} winner`, group: 'Quarters', order: 10 + L, margin: 0.06, sels: [{ code: '1', label: ev.home.name }, { code: 'X', label: 'Tie' }, { code: '2', label: ev.away.name }] };
  }
  return null;
}

function price(ev: FeedEvent, mem: Memory, specs: MarketSpec[]): Map<string, Record<string, Tally>> {
  const d = dist(ev, mem);
  const pre = mem.pre ?? prematch(ev);
  const out = new Map<string, Record<string, Tally>>();
  for (const s of specs) {
    const [kind, arg] = s.key.split(':');
    const L = Number(arg);
    if (kind === 'ml') {
      const p = phi(d.mMean / d.mSd);
      out.set(s.key, { '1': wl(p), '2': wl(1 - p) });
    } else if (kind === 'sp') {
      const p = phi((d.mMean + L) / d.mSd);
      out.set(s.key, { h: wl(p), a: wl(1 - p) });
    } else if (kind === 'tot') {
      const p = 1 - phi((L - d.tMean) / d.tSd);
      out.set(s.key, { o: wl(p), u: wl(1 - p) });
    } else if (kind === 'q') {
      const qi = L - 1;
      const cur = (ev.home.lines[qi] ?? 0) - (ev.away.lines[qi] ?? 0);
      const qIdx = currentQuarter(ev);
      const r = ev.status === 'SCHEDULED' || qIdx > ev.period ? 0.25 : clamp(remainingFraction(ev) - (4 - qIdx) * 0.25, 0, 0.25);
      const mean = cur + (Number(pre.mu) * r);
      const sd = Math.max(0.01, SD_MARGIN * Math.sqrt(r));
      const pTie = phi((0.5 - mean) / sd) - phi((-0.5 - mean) / sd);
      const pH = 1 - phi((0.5 - mean) / sd);
      out.set(s.key, { '1': wl(pH), X: wl(pTie), '2': wl(1 - pH - pTie) });
    }
  }
  return out;
}

function settle(key: string, ev: FeedEvent, _mem: Memory, final: boolean): Settled | null {
  const [kind, arg] = key.split(':');
  const L = Number(arg);
  const h = ev.home.score, a = ev.away.score;
  if (kind === 'q') {
    const done = final || ev.period > L || (ev.period === L && /^end|half/i.test(ev.clock));
    const qh = ev.home.lines[L - 1];
    const qa = ev.away.lines[L - 1];
    if (!done || qh === null || qh === undefined || qa === null || qa === undefined) return null;
    const r = qh > qa ? '1' : qa > qh ? '2' : 'X';
    return { '1': r === '1' ? 'WON' : 'LOST', X: r === 'X' ? 'WON' : 'LOST', '2': r === '2' ? 'WON' : 'LOST' };
  }
  if (!final) {
    if (kind === 'tot' && h + a > L) return ou(true);
    return null;
  }
  if (h === a) return null;
  if (kind === 'ml') return h > a ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' };
  if (kind === 'sp') return h - a + L > 0 ? { h: 'WON', a: 'LOST' } : { h: 'LOST', a: 'WON' };
  if (kind === 'tot') return ou(h + a > L);
  return null;
}

export const basketballModel: Model = { sport: 'basketball', prematch, keys, spec, price, settle };

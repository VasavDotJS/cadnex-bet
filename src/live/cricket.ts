/**
 * Cricket on real data: match winner for T20 and one-day matches. In a chase the price
 * follows runs needed, balls left and wickets in hand; in the first innings it follows
 * the projected total against a par score. Tests and unknown formats show scores only.
 */
import { Settled, Tally } from '../engine/sport';
import type { FeedEvent } from '../feed/types';
import { clamp, implied, MarketSpec, Memory, Model, phi, wl } from './model';

const FMT = {
  T20: { balls: 120, rpo: 8.4, par: 168, sd: 24 },
  ODI: { balls: 300, rpo: 5.8, par: 285, sd: 38 },
};

function prematch(ev: FeedEvent): Record<string, number | string> {
  const o = ev.odds;
  const p = o ? implied([o.home, o.away]) : null;
  return p ? { p: p[0], src: 'odds' } : { p: 0.52, src: 'default' };
}

function oversToBalls(o: number): number {
  const w = Math.floor(o);
  return w * 6 + Math.round((o - w) * 10);
}

/** P(home wins) from the live state, or null if the state can't be read. */
export function cricketProb(ev: FeedEvent, preP: number): number | null {
  const info = ev.extra.cricket;
  if (!info || (info.format !== 'T20' && info.format !== 'ODI')) return null;
  const f = FMT[info.format];
  if (ev.status === 'SCHEDULED') return preP;
  if (info.chase) {
    const { side, need, balls } = info.chase;
    const inn = [...info.innings].reverse().find((x) => x.side === side);
    const wLeft = 10 - (inn?.wkts ?? 0);
    // scoring speeds up at the death; wickets matter less when few balls remain
    const rpo = info.format === 'T20' ? (balls <= 36 ? 10 : balls <= 90 ? 8.6 : 7.9) : balls <= 60 ? 7.5 : balls <= 180 ? 5.8 : 5.2;
    const needW = Math.max(2, balls / (info.format === 'T20' ? 12 : 24));
    const resource = Math.pow(clamp(wLeft / needW, 0.05, 1), 0.6);
    const expected = (balls / 6) * rpo * resource;
    const sd = 4 + 1.6 * Math.sqrt(Math.max(1, expected));
    const pChase = need <= 0 ? 1 : balls <= 0 || wLeft <= 0 ? 0 : phi((expected - need + 0.5) / sd);
    return side === 0 ? pChase : 1 - pChase;
  }
  const first = info.innings[0];
  if (info.innings.length === 1 && first && first.overs !== undefined) {
    const used = oversToBalls(first.overs);
    const left = Math.max(0, f.balls - used);
    const wLeft = 10 - first.wkts;
    const proj = first.runs + (left / 6) * f.rpo * Math.pow(clamp(wLeft / 10, 0.05, 1), 0.45);
    const progress = used / f.balls;
    const pBatFirst = phi((proj - f.par) / (f.sd * (1 - 0.4 * progress)));
    // blend with pre-match view early in the innings
    const pHomeLive = first.side === 0 ? pBatFirst : 1 - pBatFirst;
    return clamp(preP * (1 - progress) + pHomeLive * progress, 0.02, 0.98);
  }
  return null;
}

function keys(ev: FeedEvent): string[] {
  if (ev.status !== 'SCHEDULED' && ev.status !== 'LIVE') return [];
  const fmt = ev.extra.cricket?.format;
  return fmt === 'T20' || fmt === 'ODI' ? ['mw'] : [];
}

function spec(key: string, ev: FeedEvent): MarketSpec | null {
  if (key !== 'mw') return null;
  return { key, name: 'Match winner', group: 'Main', order: 1, margin: 0.05, sels: [{ code: '1', label: ev.home.name }, { code: '2', label: ev.away.name }] };
}

function price(ev: FeedEvent, mem: Memory, specs: MarketSpec[]): Map<string, Record<string, Tally>> {
  const out = new Map<string, Record<string, Tally>>();
  const p = cricketProb(ev, Number((mem.pre ?? prematch(ev)).p));
  if (p === null) return out; // unreadable state → leave suspended
  for (const s of specs) if (s.key === 'mw') out.set('mw', { '1': wl(p), '2': wl(1 - p) });
  return out;
}

function settle(key: string, ev: FeedEvent, _mem: Memory, final: boolean): Settled | null {
  if (key !== 'mw' || !final) return null;
  if (ev.home.winner) return { '1': 'WON', '2': 'LOST' };
  if (ev.away.winner) return { '1': 'LOST', '2': 'WON' };
  return null; // tie, no result or draw → void
}

export const cricketModel: Model = { sport: 'cricket', prematch, keys, spec, price, settle };

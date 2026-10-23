/** Profile and wallet statistics derived from bets and the ledger. */
import type { BetRow, LedgerRow } from '../db/db';
import type { SportId } from '../data/types';
import { convertMinor, Minor, pow10 } from '../lib/money';
import { currency } from '../lib/currencies';

export interface Stats {
  settled: number;
  won: number;
  lost: number;
  winRate: number; // 0..1
  staked: Minor;
  returned: Minor;
  pl: Minor;
  roi: number;
  biggestWin: Minor;
  longestStreak: number;
  favouriteSport: SportId | null;
  plSeries: number[];
}

/** Everything is expressed in the wallet's current currency at demo rates. */
export function computeStats(bets: BetRow[], code: string, sinceMs = 0): Stats {
  const done = bets
    .filter((b) => b.status !== 'OPEN' && b.status !== 'PARTIALLY_CASHED_OUT' && (b.settledAt ?? 0) >= sinceMs)
    .sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0));
  let won = 0, lost = 0, streak = 0, longest = 0;
  let staked = 0n, returned = 0n, biggest = 0n;
  const sports: Record<string, number> = {};
  const series: number[] = [0];
  const scale = Number(pow10(currency(code).decimals));
  for (const b of done) {
    const st = convertMinor(BigInt(b.stakeMinor), b.currency, code);
    const ret = convertMinor(BigInt(b.returnMinor ?? '0') + (b.status === 'CASHED_OUT' ? 0n : BigInt(b.cashedOutMinor)), b.currency, code);
    staked += st;
    returned += ret;
    const profit = ret - st;
    if (b.status !== 'VOID') {
      if (profit > 0n) { won++; streak++; longest = Math.max(longest, streak); }
      else if (profit < 0n) { lost++; streak = 0; }
    }
    if (profit > biggest) biggest = profit;
    for (const l of b.legs) sports[l.sport] = (sports[l.sport] ?? 0) + 1;
    series.push(series[series.length - 1] + Number(profit) / scale);
  }
  for (const b of bets) if (b.status === 'OPEN' || b.status === 'PARTIALLY_CASHED_OUT') for (const l of b.legs) sports[l.sport] = (sports[l.sport] ?? 0) + 1;
  const pl = returned - staked;
  const fav = Object.entries(sports).sort((a, b) => b[1] - a[1])[0]?.[0] as SportId | undefined;
  return {
    settled: done.length, won, lost, winRate: won + lost ? won / (won + lost) : 0, staked, returned, pl,
    roi: staked > 0n ? Number((pl * 1_000_000n) / staked) / 1_000_000 : 0, biggestWin: biggest, longestStreak: longest, favouriteSport: fav ?? null,
    plSeries: series,
  };
}

/** Balance over time in the current currency, from the ledger (newest-first input). */
export function balanceSeries(ledger: LedgerRow[], code: string, days = 30, max = 48): number[] {
  const since = Date.now() - days * 86_400_000;
  const scale = Number(pow10(currency(code).decimals));
  const rows: LedgerRow[] = [];
  for (const r of ledger) {
    if (r.createdAt < since || r.currency !== code) break;
    rows.push(r);
    if (r.type === 'CURRENCY_CONVERT') break;
  }
  rows.reverse();
  let pts = rows.map((r) => Number(BigInt(r.balanceAfterMinor)) / scale);
  if (pts.length > max) {
    const step = pts.length / max;
    pts = Array.from({ length: max }, (_, i) => pts[Math.min(pts.length - 1, Math.round(i * step))]).concat(pts[pts.length - 1]);
  }
  if (pts.length === 1) pts = [pts[0], pts[0]];
  return pts;
}

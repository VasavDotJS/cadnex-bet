/**
 * Responsible-gaming limits as pure rules over a player's recent ledger. The app checks
 * them for instant feedback; the server checks them again before any bet or deposit.
 */
import type { LedgerRow } from '../db/db';
import { convertMinor, formatMoney, Minor } from '../lib/money';

export type Period = 'day' | 'week' | 'month';

export interface Limit {
  amountMinor: string;
  currency: string;
  period: Period;
  /** a raised or removed limit only applies after a cooling period */
  pending?: { amountMinor: string | null; effectiveAt: number };
}

export interface RgSettings {
  deposit?: Limit;
  loss?: Limit;
  stake?: Limit; // total staked per period
  maxBet?: { amountMinor: string; currency: string };
  reminderMinutes?: number; // 0 = off
  coolOffUntil?: number;
  excludedUntil?: number;
}

export const PERIOD_MS: Record<Period, number> = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 };
export const PERIOD_LABEL: Record<Period, string> = { day: 'day', week: 'week', month: '30 days' };
/** the longest period any limit looks back over */
export const LOOKBACK_MS = PERIOD_MS.month;

/** Limits as they stand now, with raised or removed limits applied once their wait is over. */
export function effectiveRg(raw: RgSettings | undefined, now: number): { rg: RgSettings; changed: boolean } {
  const rg: RgSettings = { ...(raw ?? {}) };
  let changed = false;
  for (const k of ['deposit', 'loss', 'stake'] as const) {
    const l = rg[k];
    if (l?.pending && l.pending.effectiveAt <= now) {
      if (l.pending.amountMinor === null) delete rg[k];
      else rg[k] = { ...l, amountMinor: l.pending.amountMinor, pending: undefined };
      changed = true;
    }
  }
  return { rg, changed };
}

function sumSince(rows: LedgerRow[], since: number, types: string[], code: string): Minor {
  let t = 0n;
  for (const r of rows) if (r.createdAt >= since && types.includes(r.type)) t += convertMinor(BigInt(r.amountMinor), r.currency, code);
  return t;
}

const fmtUntil = (t: number) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** Why a bet of `total` can't be placed now, or null if it can. */
export function betLimitError(rg: RgSettings, rows: LedgerRow[], total: Minor, code: string, now: number): string | null {
  if (rg.excludedUntil && rg.excludedUntil > now) return `You are self-excluded until ${new Date(rg.excludedUntil).toLocaleDateString()}.`;
  if (rg.coolOffUntil && rg.coolOffUntil > now) return `You are on a break until ${fmtUntil(rg.coolOffUntil)}.`;
  if (rg.maxBet) {
    const max = convertMinor(BigInt(rg.maxBet.amountMinor), rg.maxBet.currency, code);
    if (total > max) return `Your single-bet limit is ${formatMoney(max, code)}.`;
  }
  if (rg.stake) {
    const lim = convertMinor(BigInt(rg.stake.amountMinor), rg.stake.currency, code);
    const used = -sumSince(rows, now - PERIOD_MS[rg.stake.period], ['BET_PLACED'], code);
    if (used + total > lim) return `This would pass your stake limit of ${formatMoney(lim, code)} per ${PERIOD_LABEL[rg.stake.period]}. ${formatMoney(lim - used > 0n ? lim - used : 0n, code)} left.`;
  }
  if (rg.loss) {
    const lim = convertMinor(BigInt(rg.loss.amountMinor), rg.loss.currency, code);
    const net = sumSince(rows, now - PERIOD_MS[rg.loss.period], ['BET_PLACED', 'BET_WON', 'BET_REFUND', 'CASHOUT'], code);
    const lost = net < 0n ? -net : 0n;
    if (lost + total > lim) return `This stake could pass your loss limit of ${formatMoney(lim, code)} per ${PERIOD_LABEL[rg.loss.period]}.`;
  }
  return null;
}

/** Why adding `amount` to the balance isn't allowed now, or null if it is. */
export function depositLimitError(rg: RgSettings, rows: LedgerRow[], amount: Minor, code: string, now: number): string | null {
  if (rg.excludedUntil && rg.excludedUntil > now) return 'Deposits are blocked while you are self-excluded.';
  if (rg.coolOffUntil && rg.coolOffUntil > now) return 'Deposits are paused during your break.';
  if (rg.deposit) {
    const lim = convertMinor(BigInt(rg.deposit.amountMinor), rg.deposit.currency, code);
    const since = now - PERIOD_MS[rg.deposit.period];
    const used = sumSince(rows, since, ['DEPOSIT'], code);
    const adj = rows
      .filter((r) => r.createdAt >= since && r.type === 'DEMO_ADJUST' && BigInt(r.amountMinor) > 0n && r.note !== 'Starting demo balance')
      .reduce((a, r) => a + convertMinor(BigInt(r.amountMinor), r.currency, code), 0n);
    if (used + adj + amount > lim) return `This would pass your deposit limit of ${formatMoney(lim, code)} per ${PERIOD_LABEL[rg.deposit.period]}.`;
  }
  return null;
}

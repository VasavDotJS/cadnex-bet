/** Responsible-gaming limits. These are enforced by the services, not just shown. */
import { db, SettingsRow } from '../../db/db';
import { convertMinor, formatMoney, Minor } from '../../lib/money';

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

export class LimitError extends Error {}

const PERIOD_MS: Record<Period, number> = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 };
export const PERIOD_LABEL: Record<Period, string> = { day: 'day', week: 'week', month: '30 days' };

export async function getRg(userId: string): Promise<RgSettings> {
  const s = (await db.settings.get(userId)) as (SettingsRow & { rg?: RgSettings }) | undefined;
  const rg = s?.rg ?? {};
  // apply pending increases whose cooling period has passed
  let changed = false;
  for (const k of ['deposit', 'loss', 'stake'] as const) {
    const l = rg[k];
    if (l?.pending && l.pending.effectiveAt <= Date.now()) {
      if (l.pending.amountMinor === null) delete rg[k];
      else rg[k] = { ...l, amountMinor: l.pending.amountMinor, pending: undefined };
      changed = true;
    }
  }
  if (changed && s) await db.settings.put({ ...s, rg } as SettingsRow);
  return rg;
}

export async function saveRg(userId: string, rg: RgSettings): Promise<void> {
  const s = await db.settings.get(userId);
  if (!s) return;
  await db.settings.put({ ...s, rg } as SettingsRow);
}

/**
 * Set a limit. Lowering applies immediately; raising or removing waits 24 hours,
 * as real operators do, so a limit can't be undone in the heat of the moment.
 */
export async function setLimit(userId: string, kind: 'deposit' | 'loss' | 'stake', next: Limit | null): Promise<RgSettings> {
  const rg = await getRg(userId);
  const cur = rg[kind];
  if (!cur) {
    if (next) rg[kind] = next;
  } else {
    const curAmt = BigInt(cur.amountMinor);
    const nextAmt = next ? convertMinor(BigInt(next.amountMinor), next.currency, cur.currency) : null;
    const tighter = next && nextAmt !== null && nextAmt <= curAmt && PERIOD_MS[next.period] >= PERIOD_MS[cur.period];
    if (tighter) rg[kind] = next!;
    else rg[kind] = { ...cur, pending: { amountMinor: next ? convertMinor(BigInt(next.amountMinor), next.currency, cur.currency).toString() : null, effectiveAt: Date.now() + 86_400_000 } };
  }
  await saveRg(userId, rg);
  return rg;
}

async function sumSince(userId: string, since: number, types: string[], code: string): Promise<Minor> {
  const rows = await db.ledger.where('[userId+createdAt]').between([userId, since], [userId, Number.MAX_SAFE_INTEGER]).toArray();
  let t = 0n;
  for (const r of rows) if (types.includes(r.type)) t += convertMinor(BigInt(r.amountMinor), r.currency, code);
  return t;
}

/** Called inside bet placement. Throws LimitError when a limit would be breached. */
export async function checkLimits(userId: string, totalStake: Minor, code: string): Promise<void> {
  const rg = await getRg(userId);
  const now = Date.now();
  if (rg.excludedUntil && rg.excludedUntil > now) throw new LimitError(`You are self-excluded until ${new Date(rg.excludedUntil).toLocaleDateString()}.`);
  if (rg.coolOffUntil && rg.coolOffUntil > now) throw new LimitError(`You are on a break until ${new Date(rg.coolOffUntil).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`);
  if (rg.maxBet) {
    const max = convertMinor(BigInt(rg.maxBet.amountMinor), rg.maxBet.currency, code);
    if (totalStake > max) throw new LimitError(`Your single-bet limit is ${formatMoney(max, code)}.`);
  }
  if (rg.stake) {
    const lim = convertMinor(BigInt(rg.stake.amountMinor), rg.stake.currency, code);
    const used = -(await sumSince(userId, now - PERIOD_MS[rg.stake.period], ['BET_PLACED'], code));
    if (used + totalStake > lim) throw new LimitError(`This would pass your stake limit of ${formatMoney(lim, code)} per ${PERIOD_LABEL[rg.stake.period]}. ${formatMoney(lim - used > 0n ? lim - used : 0n, code)} left.`);
  }
  if (rg.loss) {
    const lim = convertMinor(BigInt(rg.loss.amountMinor), rg.loss.currency, code);
    const net = await sumSince(userId, now - PERIOD_MS[rg.loss.period], ['BET_PLACED', 'BET_WON', 'BET_REFUND', 'CASHOUT'], code);
    const lost = net < 0n ? -net : 0n;
    if (lost + totalStake > lim) throw new LimitError(`This stake could pass your loss limit of ${formatMoney(lim, code)} per ${PERIOD_LABEL[rg.loss.period]}.`);
  }
}

/** Called before deposits and balance top-ups. */
export async function checkDeposit(userId: string, amount: Minor, code: string): Promise<void> {
  const rg = await getRg(userId);
  const now = Date.now();
  if (rg.excludedUntil && rg.excludedUntil > now) throw new LimitError('Deposits are blocked while you are self-excluded.');
  if (rg.coolOffUntil && rg.coolOffUntil > now) throw new LimitError('Deposits are paused during your break.');
  if (rg.deposit) {
    const lim = convertMinor(BigInt(rg.deposit.amountMinor), rg.deposit.currency, code);
    const used = await sumSince(userId, now - PERIOD_MS[rg.deposit.period], ['DEPOSIT'], code);
    const adj = (await db.ledger.where('[userId+createdAt]').between([userId, now - PERIOD_MS[rg.deposit.period]], [userId, Number.MAX_SAFE_INTEGER]).toArray())
      .filter((r) => r.type === 'DEMO_ADJUST' && BigInt(r.amountMinor) > 0n && r.note !== 'Starting demo balance')
      .reduce((a, r) => a + convertMinor(BigInt(r.amountMinor), r.currency, code), 0n);
    if (used + adj + amount > lim) throw new LimitError(`This would pass your deposit limit of ${formatMoney(lim, code)} per ${PERIOD_LABEL[rg.deposit.period]}.`);
  }
}

/** Responsible-gaming limits. These are enforced by the services, not just shown. */
import { db, SettingsRow } from '../../db/db';
import { convertMinor, Minor } from '../../lib/money';

import { betLimitError, depositLimitError, effectiveRg, Limit, LOOKBACK_MS, Period, PERIOD_LABEL, PERIOD_MS, RgSettings } from '../../money/limits';

export { PERIOD_LABEL };
export type { Limit, Period, RgSettings };

export class LimitError extends Error {}


export async function getRg(userId: string): Promise<RgSettings> {
  const s = (await db.settings.get(userId)) as (SettingsRow & { rg?: RgSettings }) | undefined;
  const { rg, changed } = effectiveRg(s?.rg, Date.now());
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

async function recent(userId: string, now: number) {
  return db.ledger.where('[userId+createdAt]').between([userId, now - LOOKBACK_MS], [userId, Number.MAX_SAFE_INTEGER]).toArray();
}

/** Called inside bet placement. Throws LimitError when a limit would be breached (the server checks too). */
export async function checkLimits(userId: string, totalStake: Minor, code: string): Promise<void> {
  const now = Date.now();
  const err = betLimitError(await getRg(userId), await recent(userId, now), totalStake, code, now);
  if (err) throw new LimitError(err);
}

/** Called before deposits and balance top-ups (the server checks too). */
export async function checkDeposit(userId: string, amount: Minor, code: string): Promise<void> {
  const now = Date.now();
  const err = depositLimitError(await getRg(userId), await recent(userId, now), amount, code, now);
  if (err) throw new LimitError(err);
}

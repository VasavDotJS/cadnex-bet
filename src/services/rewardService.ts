/** Daily reward: a small virtual bonus once every 24 hours (checked by the server too). */
import { db } from '../db/db';
import { Minor } from '../lib/money';
import { DAILY_NOTE, DAY_MS, dailyAmount } from '../money/core';
import { walletService } from './walletService';

export { dailyAmount };

export async function lastDailyAt(userId: string): Promise<number> {
  const rows = await db.ledger.where('[userId+createdAt]').between([userId, Date.now() - DAY_MS], [userId, Number.MAX_SAFE_INTEGER]).toArray();
  const last = rows.filter((r) => r.type === 'BONUS' && r.note === DAILY_NOTE).sort((a, b) => b.createdAt - a.createdAt)[0];
  return last?.createdAt ?? 0;
}

export async function nextDailyAt(userId: string): Promise<number> {
  const last = await lastDailyAt(userId);
  return last ? last + DAY_MS : 0;
}

export async function claimDaily(userId: string): Promise<Minor> {
  const before = BigInt((await walletService.getWallet(userId)).balanceMinor);
  const w = await walletService.claimDaily(userId, await lastDailyAt(userId));
  return BigInt(w.balanceMinor) - before;
}

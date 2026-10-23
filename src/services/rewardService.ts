/** Daily reward: a small virtual bonus once every 24 hours. */
import { db } from '../db/db';
import { convertMinor, Minor, pow10 } from '../lib/money';
import { currency } from '../lib/currencies';
import { applyChange } from './walletService';

const NOTE = 'Daily reward';

export function dailyAmount(code: string): Minor {
  const raw = convertMinor(500n, 'USD', code); // ≈ 5 USD
  const d = currency(code).decimals;
  const n = Number(raw) / Number(pow10(d));
  if (n < 1) return raw;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  return BigInt(Math.max(1, Math.round(n / mag)) * mag) * pow10(d);
}

export async function nextDailyAt(userId: string): Promise<number> {
  const rows = await db.ledger.where('[userId+createdAt]').between([userId, Date.now() - 86_400_000], [userId, Number.MAX_SAFE_INTEGER]).toArray();
  const last = rows.filter((r) => r.type === 'BONUS' && r.note === NOTE).sort((a, b) => b.createdAt - a.createdAt)[0];
  return last ? last.createdAt + 86_400_000 : 0;
}

export async function claimDaily(userId: string): Promise<Minor> {
  return db.transaction('rw', [db.wallets, db.ledger], async () => {
    const next = await nextDailyAt(userId);
    if (next > Date.now()) throw new Error('Already claimed. Come back tomorrow.');
    const w = await db.wallets.get(userId);
    if (!w) throw new Error('Wallet not found.');
    const amt = dailyAmount(w.currency);
    await applyChange(userId, amt, 'BONUS', { note: NOTE });
    return amt;
  });
}

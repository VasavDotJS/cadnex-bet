/** Demo wallet. Every balance change is a transaction that writes an immutable ledger entry. */
import { db, LedgerRow, LedgerType, uid, WalletRow } from '../db/db';
import { currency } from '../lib/currencies';
import { convertMinor, formatMoney, fxRate, Minor, pow10, units } from '../lib/money';
import { stamp } from '../lib/time';

export class WalletError extends Error {}

export const MAX_UNITS = 1_000_000_000n;

export function maxBalance(code: string): Minor {
  return units(MAX_UNITS, code);
}

/** Apply a signed change inside an open transaction. */
export async function applyChange(
  userId: string,
  delta: Minor,
  type: LedgerType,
  opts: { refId?: string; note?: string; allowNegative?: boolean; currency?: string } = {},
): Promise<{ wallet: WalletRow; entry: LedgerRow }> {
  const w = await db.wallets.get(userId);
  if (!w) throw new WalletError('Wallet not found.');
  const cur = opts.currency ?? w.currency;
  if (cur !== w.currency) throw new WalletError(`This needs ${cur}, but your wallet is in ${w.currency}.`);
  const next = BigInt(w.balanceMinor) + delta;
  if (next < 0n && !opts.allowNegative) throw new WalletError('Insufficient balance.');
  if (next > maxBalance(w.currency)) throw new WalletError(`The demo balance is capped at ${formatMoney(maxBalance(w.currency), w.currency, { noDecimals: true })}.`);
  const wallet: WalletRow = { ...w, balanceMinor: next.toString(), updatedAt: Date.now() };
  const entry: LedgerRow = {
    id: uid('l_'), userId, type, amountMinor: delta.toString(), balanceAfterMinor: next.toString(), currency: w.currency,
    refId: opts.refId, note: opts.note, createdAt: stamp(),
  };
  await db.wallets.put(wallet);
  await db.ledger.add(entry);
  return { wallet, entry };
}

export interface LedgerFilter {
  type?: LedgerType | 'ALL';
  currency?: string;
  from?: number;
  to?: number;
  q?: string;
  limit?: number;
}

export const walletService = {
  async getWallet(userId: string): Promise<WalletRow> {
    const w = await db.wallets.get(userId);
    if (!w) throw new WalletError('Wallet not found.');
    return w;
  },

  async setBalance(userId: string, target: Minor): Promise<WalletRow> {
    return db.transaction('rw', [db.wallets, db.ledger], async () => {
      const w = await this.getWallet(userId);
      if (target < 0n) throw new WalletError('The balance cannot be negative.');
      const delta = target - BigInt(w.balanceMinor);
      if (delta === 0n) return w;
      return (await applyChange(userId, delta, 'DEMO_ADJUST', { note: 'Balance set' })).wallet;
    });
  },

  async adjust(userId: string, delta: Minor): Promise<WalletRow> {
    return db.transaction('rw', [db.wallets, db.ledger], async () => (await applyChange(userId, delta, 'DEMO_ADJUST', { note: delta > 0n ? 'Demo top-up' : 'Demo reduction' })).wallet);
  },

  async deposit(userId: string, amount: Minor, method: string): Promise<WalletRow> {
    if (amount <= 0n) throw new WalletError('Enter an amount above zero.');
    return db.transaction('rw', [db.wallets, db.ledger], async () => (await applyChange(userId, amount, 'DEPOSIT', { note: `Demo deposit via ${method}` })).wallet);
  },

  async withdraw(userId: string, amount: Minor, method: string): Promise<WalletRow> {
    if (amount <= 0n) throw new WalletError('Enter an amount above zero.');
    return db.transaction('rw', [db.wallets, db.ledger], async () => (await applyChange(userId, -amount, 'WITHDRAW', { note: `Demo withdrawal to ${method}` })).wallet);
  },

  /** Switch currency, either converting at the bundled demo rate or keeping the same number. */
  async changeCurrency(userId: string, to: string, mode: 'convert' | 'keep'): Promise<WalletRow> {
    return db.transaction('rw', [db.wallets, db.ledger], async () => {
      const w = await this.getWallet(userId);
      if (w.currency === to) return w;
      const bal = BigInt(w.balanceMinor);
      const df = currency(w.currency).decimals;
      const dt = currency(to).decimals;
      let next = mode === 'convert' ? convertMinor(bal, w.currency, to) : (bal * pow10(dt)) / pow10(df);
      if (next > maxBalance(to)) next = maxBalance(to);
      const rate = fxRate(w.currency, to);
      const note = mode === 'convert'
        ? `Converted ${formatMoney(bal, w.currency)} at 1 ${w.currency} = ${rate < 0.001 ? rate.toPrecision(4) : rate.toFixed(rate < 1 ? 6 : 4)} ${to}`
        : `Switched from ${w.currency}, kept the number`;
      const wallet: WalletRow = { ...w, currency: to, balanceMinor: next.toString(), updatedAt: Date.now() };
      await db.wallets.put(wallet);
      await db.ledger.add({
        id: uid('l_'), userId, type: 'CURRENCY_CONVERT', amountMinor: next.toString(), balanceAfterMinor: next.toString(), currency: to,
        note, createdAt: stamp(),
      });
      return wallet;
    });
  },

  async getLedger(userId: string, f: LedgerFilter = {}): Promise<LedgerRow[]> {
    let rows = await db.ledger.where('[userId+createdAt]').between([userId, f.from ?? 0], [userId, f.to ?? Number.MAX_SAFE_INTEGER]).reverse().toArray();
    if (f.type && f.type !== 'ALL') rows = rows.filter((r) => r.type === f.type);
    if (f.currency) rows = rows.filter((r) => r.currency === f.currency);
    if (f.q) {
      const q = f.q.toLowerCase();
      rows = rows.filter((r) => (r.note ?? '').toLowerCase().includes(q) || (r.refId ?? '').toLowerCase().includes(q) || r.type.toLowerCase().includes(q));
    }
    return f.limit ? rows.slice(0, f.limit) : rows;
  },
};

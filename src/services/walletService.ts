/**
 * Demo wallet. Every balance change writes an immutable ledger entry. For signed-in players
 * the server makes the change (see src/money); the device keeps the result.
 */
import { db, LedgerRow, LedgerType, uid, WalletRow } from '../db/db';
import { Minor } from '../lib/money';
import { stamp } from '../lib/time';
import { Ctx, MAX_UNITS, maxBalance, WalletError, walletOp, WalletOp } from '../money/core';
import { MoneyError, remoteMoney, serverMoney } from '../money/remote';

export { MAX_UNITS, maxBalance, WalletError };

export function localCtx(userId: string): Ctx {
  return { userId, now: Date.now(), id: uid, stamp };
}

/** Turn a server refusal into the error type the screens expect. */
export function asWalletError(e: unknown): never {
  if (e instanceof MoneyError) throw new WalletError(e.message, e.code);
  throw e;
}

/** Write a computed change to the device (local mode only). */
export async function commitLocal(change: { wallet: WalletRow; ledger: LedgerRow[]; bets?: import('../db/db').BetRow[] }): Promise<void> {
  await db.wallets.put(change.wallet);
  for (const l of change.ledger) await db.ledger.add(l);
  for (const b of change.bets ?? []) await db.bets.put(b);
}

/** Apply a signed change inside an open transaction (local mode). */
export async function applyChange(
  userId: string,
  delta: Minor,
  type: LedgerType,
  opts: { id?: string; refId?: string; note?: string; allowNegative?: boolean; currency?: string } = {},
): Promise<{ wallet: WalletRow; entry: LedgerRow }> {
  const w = await db.wallets.get(userId);
  if (!w) throw new WalletError('Wallet not found.');
  const cur = opts.currency ?? w.currency;
  if (cur !== w.currency) throw new WalletError(`This needs ${cur}, but your wallet is in ${w.currency}.`);
  const next = BigInt(w.balanceMinor) + delta;
  if (next < 0n && !opts.allowNegative) throw new WalletError('Insufficient balance.', 'INSUFFICIENT');
  if (next > maxBalance(w.currency)) throw new WalletError('The demo balance is capped.');
  const wallet: WalletRow = { ...w, balanceMinor: next.toString(), updatedAt: Date.now() };
  const entry: LedgerRow = { id: opts.id ?? uid('l_'), userId, type, amountMinor: delta.toString(), balanceAfterMinor: next.toString(), currency: w.currency, refId: opts.refId, note: opts.note, createdAt: stamp() };
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

/** Run a wallet operation on the server (signed in) or on the device. */
async function run(userId: string, op: WalletOp, lastDailyAt = 0): Promise<WalletRow> {
  if (remoteMoney()) {
    const r = await serverMoney('wallet', { op }).catch(asWalletError);
    if (r.wallet) return r.wallet;
    return walletService.getWallet(userId);
  }
  return db.transaction('rw', [db.wallets, db.ledger], async () => {
    const w = await walletService.getWallet(userId);
    const change = walletOp(localCtx(userId), w, op, lastDailyAt);
    if (!change.ledger.length && change.wallet.currency === w.currency) return w;
    await commitLocal(change);
    return change.wallet;
  });
}

export const walletService = {
  async getWallet(userId: string): Promise<WalletRow> {
    const w = await db.wallets.get(userId);
    if (!w) throw new WalletError('Wallet not found.');
    return w;
  },

  async setBalance(userId: string, target: Minor): Promise<WalletRow> {
    if (target < 0n) throw new WalletError('The balance cannot be negative.');
    return run(userId, { kind: 'set', target: target.toString() });
  },

  async adjust(userId: string, delta: Minor): Promise<WalletRow> {
    return run(userId, { kind: 'adjust', delta: delta.toString() });
  },

  async deposit(userId: string, amount: Minor, method: string): Promise<WalletRow> {
    if (amount <= 0n) throw new WalletError('Enter an amount above zero.');
    return run(userId, { kind: 'deposit', amount: amount.toString(), method });
  },

  async withdraw(userId: string, amount: Minor, method: string): Promise<WalletRow> {
    if (amount <= 0n) throw new WalletError('Enter an amount above zero.');
    return run(userId, { kind: 'withdraw', amount: amount.toString(), method });
  },

  /** Switch currency, either converting at the bundled demo rate or keeping the same number. */
  async changeCurrency(userId: string, to: string, mode: 'convert' | 'keep'): Promise<WalletRow> {
    return run(userId, { kind: 'currency', to, mode });
  },

  /** The once-a-day reward. */
  async claimDaily(userId: string, lastDailyAt: number): Promise<WalletRow> {
    return run(userId, { kind: 'daily' }, lastDailyAt);
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

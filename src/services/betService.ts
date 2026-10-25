/**
 * Placing, settling and cashing out bets. For signed-in players the server prices, checks
 * and records every bet and pays every return (see src/money); the device keeps the result.
 * Without a cloud connection (tests) the same rules run on the device.
 */
import { BetLeg, BetRow, db, uid } from '../db/db';
import { LegQuote } from '../lib/betting';
import { LegResult, Minor } from '../lib/money';
import { stamp } from '../lib/time';
import { BetError, cashOut as cashOutCore, maxPayout, minStake, NewBet, placeBets, settleBet, systemUnit, totalStake, WalletError } from '../money/core';
import { MoneyError, remoteMoney, serverMoney } from '../money/remote';
import { commitLocal } from './walletService';

export { BetError, maxPayout, minStake, systemUnit };
export type { NewBet };

export function shortRef(id: string): string {
  return id.replace(/^b_/, '').slice(0, 8).toUpperCase();
}

/** when each open bet was last sent to the server for settling */
const asked = new Map<string, number>();

const ctx = (userId: string) => ({ userId, now: Date.now(), id: uid, stamp });

/** Server refusals become the errors the screens already handle; moved prices travel along. */
export class OddsChangedError extends BetError {
  constructor(message: string, public prices: Record<string, number>) {
    super(message, 'ODDS_CHANGED');
  }
}
function asBetError(e: unknown): never {
  if (e instanceof MoneyError) {
    if (e.code === 'ODDS_CHANGED') throw new OddsChangedError(e.message, e.failure.prices ?? {});
    if (e.code === 'INSUFFICIENT' || e.code === 'WALLET') throw new WalletError(e.message, e.code);
    throw new BetError(e.message, e.code);
  }
  throw e;
}

/** What the server needs to know about each leg: which selection, at what price, seen when. */
function wireLeg(l: Omit<BetLeg, 'result'>) {
  return { selectionId: l.selectionId, eventId: l.eventId, marketKey: l.marketKey, code: l.code, odds: l.odds, label: l.label, marketName: l.marketName, live: l.live };
}

export const betService = {
  async place(userId: string, bets: NewBet[], limits?: (totalStake: Minor, currency: string) => Promise<void>): Promise<BetRow[]> {
    if (!bets.length) throw new BetError('Add a selection first.');
    if (remoteMoney()) {
      const w = await db.wallets.get(userId);
      if (limits && w) await limits(totalStake(bets), w.currency);
      const body = { bets: bets.map((b) => ({ type: b.type, systemType: b.systemType, stakeMinor: b.stakeMinor.toString(), bookingCode: b.bookingCode, legs: b.legs.map(wireLeg) })) };
      const r = await serverMoney('place', body).catch(asBetError);
      return r.bets;
    }
    return db.transaction('rw', [db.wallets, db.ledger, db.bets, db.settings], async () => {
      const w = await db.wallets.get(userId);
      if (!w) throw new WalletError('Wallet not found.');
      if (limits) await limits(totalStake(bets), w.currency);
      const change = placeBets(ctx(userId), w, bets);
      await commitLocal(change);
      return change.placed;
    });
  },

  async getBets(userId: string): Promise<BetRow[]> {
    return db.bets.where('[userId+placedAt]').between([userId, 0], [userId, Number.MAX_SAFE_INTEGER]).reverse().toArray();
  },

  /**
   * Update open bets from current selection results (only `userId`'s bets when given).
   * `resultOf(selectionId)` returns the selection's result or null if unknown.
   * Signed in, the device only spots bets that look decided and asks the server, which
   * settles them from its own copy of the match data.
   */
  async settle(resultOf: (leg: BetLeg) => LegResult | null, userId?: string): Promise<{ settled: BetRow[]; changed: number }> {
    const open = (await db.bets.where('status').anyOf('OPEN', 'PARTIALLY_CASHED_OUT').toArray()).filter((b) => !userId || b.userId === userId);
    const candidates = open.filter((b) => b.legs.some((l) => l.result === 'PENDING' && (() => { const r = resultOf(l); return !!r && r !== 'PENDING'; })()));
    if (!candidates.length) return { settled: [], changed: 0 };
    if (remoteMoney()) {
      // the server may be a few seconds behind this device's data: ask about each bet at most every 20 s
      const now = Date.now();
      const due = candidates.filter((b) => now - (asked.get(b.id) ?? 0) > 20_000);
      if (!due.length) return { settled: [], changed: 0 };
      for (const b of due) asked.set(b.id, now);
      const r = await serverMoney('settle', { betIds: due.map((b) => b.id) }).catch(asBetError);
      const done = new Set(r.settled ?? []);
      return { settled: r.bets.filter((b) => done.has(b.id)), changed: r.bets.length };
    }
    const settled: BetRow[] = [];
    let touched = 0;
    for (const bet of candidates) {
      await db.transaction('rw', [db.wallets, db.ledger, db.bets], async () => {
        const fresh = await db.bets.get(bet.id);
        if (!fresh) return;
        const w = (await db.wallets.get(fresh.userId)) ?? null;
        // already paid on another of this user's devices (the entry synced here): don't pay twice
        const paid = !!(await db.ledger.get(`l_settle_${fresh.id}`));
        const out = settleBet(ctx(fresh.userId), w, fresh, resultOf, paid);
        if (!out) return;
        touched++;
        if (out.ledger.length) await commitLocal(out);
        else await db.bets.put(out.bet);
        if (out.settled) settled.push(out.bet);
      });
    }
    return { settled, changed: touched };
  },

  async cashOut(userId: string, betId: string, fraction: number, quotes: (LegQuote | null)[], expected: Minor): Promise<{ bet: BetRow; paid: Minor }> {
    if (remoteMoney()) {
      const r = await serverMoney('cashout', { betId, fraction, expected: expected.toString() }).catch(asBetError);
      const bet = r.bets.find((b) => b.id === betId);
      if (!bet) throw new BetError('Bet not found.');
      return { bet, paid: BigInt(r.paid ?? '0') };
    }
    return db.transaction('rw', [db.wallets, db.ledger, db.bets], async () => {
      const bet = await db.bets.get(betId);
      if (!bet || bet.userId !== userId) throw new BetError('Bet not found.');
      const w = await db.wallets.get(userId);
      if (!w) throw new WalletError('Wallet not found.');
      const change = cashOutCore(ctx(userId), w, bet, fraction, quotes, expected);
      await commitLocal(change);
      return { bet: change.bet, paid: change.paid };
    });
  },
};

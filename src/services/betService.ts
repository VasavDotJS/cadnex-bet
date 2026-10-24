/** Placing, settling and cashing out bets. All money moves are atomic with ledger writes. */
import { BetLeg, BetRow, BetType, db, uid } from '../db/db';
import { cashOutValue, decide, LegQuote, partialCashOut, potentialReturn } from '../lib/betting';
import { convertMinor, formatMoney, LegResult, Minor, SYSTEM_TYPES, systemLines, usdToMinor } from '../lib/money';
import { applyChange, WalletError } from './walletService';

export class BetError extends Error {}

export interface NewBet {
  type: BetType;
  systemType?: string;
  legs: Omit<BetLeg, 'result'>[];
  /** total stake (for system bets: unit stake × lines) */
  stakeMinor: Minor;
  bookingCode?: string;
}

export function minStake(code: string): Minor {
  return usdToMinor('0.10', code);
}

export function maxPayout(code: string): Minor {
  return usdToMinor('1000000', code, 'down');
}

export function systemUnit(total: Minor, systemType: string, n: number): Minor {
  const t = SYSTEM_TYPES.find((x) => x.id === systemType);
  if (!t) return 0n;
  const lines = BigInt(systemLines(t, n).length);
  return lines ? total / lines : 0n;
}

export function shortRef(id: string): string {
  return id.replace(/^b_/, '').slice(0, 8).toUpperCase();
}

export const betService = {
  async place(userId: string, bets: NewBet[], limits?: (totalStake: Minor, currency: string) => Promise<void>): Promise<BetRow[]> {
    if (!bets.length) throw new BetError('Add a selection first.');
    return db.transaction('rw', [db.wallets, db.ledger, db.bets, db.settings], async () => {
      const w = await db.wallets.get(userId);
      if (!w) throw new WalletError('Wallet not found.');
      const cur = w.currency;
      const min = minStake(cur);
      const maxPay = maxPayout(cur);
      let total = 0n;
      const rows: BetRow[] = [];
      for (const b of bets) {
        if (b.stakeMinor < min) throw new BetError(`Minimum stake is ${formatMoney(min, cur)}.`);
        const legs: BetLeg[] = b.legs.map((l) => ({ ...l, result: 'PENDING' as LegResult }));
        let unit: Minor | undefined;
        if (b.type === 'SYSTEM') {
          unit = systemUnit(b.stakeMinor, b.systemType!, legs.length);
          if (unit < min) throw new BetError(`Minimum stake per line is ${formatMoney(min, cur)}.`);
        }
        const draft: BetRow = {
          id: uid('b_'), userId, type: b.type, systemType: b.systemType, stakeMinor: b.stakeMinor.toString(), activeStakeMinor: b.stakeMinor.toString(),
          unitStakeMinor: unit?.toString(), currency: cur, totalOdds: legs.reduce((a, l) => a * l.odds, 1), potentialReturnMinor: '0', status: 'OPEN', legs,
          placedAt: Date.now(), cashedOutMinor: '0', cashOuts: [], bookingCode: b.bookingCode,
        };
        if (b.type === 'SYSTEM') draft.stakeMinor = (unit! * BigInt(systemLines(SYSTEM_TYPES.find((t) => t.id === b.systemType)!, legs.length).length)).toString();
        draft.activeStakeMinor = draft.stakeMinor;
        const pot = potentialReturn(draft);
        if (pot > maxPay) throw new BetError(`Potential return is over the ${formatMoney(maxPay, cur, { noDecimals: true })} limit. Lower the stake.`);
        draft.potentialReturnMinor = pot.toString();
        total += BigInt(draft.stakeMinor);
        rows.push(draft);
      }
      if (BigInt(w.balanceMinor) < total) throw new WalletError('Insufficient balance.');
      if (limits) await limits(total, cur);
      for (const r of rows) {
        await db.bets.add(r);
        await applyChange(userId, -BigInt(r.stakeMinor), 'BET_PLACED', { refId: r.id, note: `${r.type === 'SINGLE' ? 'Single' : r.type === 'PARLAY' ? `${r.legs.length}-leg parlay` : `System ${r.systemType}`} · ${r.legs[0].home} v ${r.legs[0].away}${r.legs.length > 1 ? ' +' + (r.legs.length - 1) : ''}` });
      }
      return rows;
    });
  },

  async getBets(userId: string): Promise<BetRow[]> {
    return db.bets.where('[userId+placedAt]').between([userId, 0], [userId, Number.MAX_SAFE_INTEGER]).reverse().toArray();
  },

  /**
   * Update open bets from current selection results (only `userId`'s bets when given).
   * `resultOf(selectionId)` returns the selection's result or null if unknown.
   * Payouts use a ledger id derived from the bet, so two devices settling the same bet
   * produce one entry, not two.
   */
  async settle(resultOf: (leg: BetLeg) => LegResult | null, userId?: string): Promise<{ settled: BetRow[]; changed: number }> {
    const open = (await db.bets.where('status').anyOf('OPEN', 'PARTIALLY_CASHED_OUT').toArray()).filter((b) => !userId || b.userId === userId);
    const settled: BetRow[] = [];
    let touched = 0;
    for (const bet of open) {
      let changed = false;
      const legs = bet.legs.map((l) => {
        if (l.result !== 'PENDING') return l;
        const r = resultOf(l);
        if (r && r !== 'PENDING') { changed = true; return { ...l, result: r }; }
        return l;
      });
      if (!changed) continue;
      touched++;
      const next: BetRow = { ...bet, legs };
      next.potentialReturnMinor = potentialReturn(next).toString();
      const out = decide(next);
      await db.transaction('rw', [db.wallets, db.ledger, db.bets], async () => {
        const fresh = await db.bets.get(bet.id);
        if (!fresh || (fresh.status !== 'OPEN' && fresh.status !== 'PARTIALLY_CASHED_OUT')) return;
        if (out) {
          next.status = out.status;
          next.settledAt = Date.now();
          next.returnMinor = out.returnMinor.toString();
          // already paid on another of this user's devices (the entry synced here): don't pay twice
          const paidElsewhere = !!(await db.ledger.get(`l_settle_${bet.id}`));
          if (out.returnMinor > 0n && !paidElsewhere) {
            const w = await db.wallets.get(bet.userId);
            if (w) {
              const amt = convertMinor(out.returnMinor, bet.currency, w.currency);
              const note = `${out.status === 'WON' ? 'Winnings' : 'Refund'} · ${legs[0].home} v ${legs[0].away}${legs.length > 1 ? ' +' + (legs.length - 1) : ''}${w.currency !== bet.currency ? ` (converted from ${formatMoney(out.returnMinor, bet.currency)})` : ''}`;
              await applyChange(bet.userId, amt, out.status === 'WON' ? 'BET_WON' : 'BET_REFUND', { id: `l_settle_${bet.id}`, refId: bet.id, note });
            }
          }
          settled.push(next);
        }
        await db.bets.put(next);
      });
    }
    return { settled, changed: touched };
  },

  async cashOut(userId: string, betId: string, fraction: number, quotes: (LegQuote | null)[], expected: Minor): Promise<{ bet: BetRow; paid: Minor }> {
    return db.transaction('rw', [db.wallets, db.ledger, db.bets], async () => {
      const bet = await db.bets.get(betId);
      if (!bet || bet.userId !== userId) throw new BetError('Bet not found.');
      const value = cashOutValue(bet, quotes);
      if (value === null) throw new BetError('Cash out is unavailable right now.');
      // protect the customer: if the value moved down by more than 2% since they saw it, ask again
      if (value * 100n < expected * 98n) throw new BetError('The cash out value changed. Check the new amount and try again.');
      const full = fraction >= 0.999;
      const { paid, remainingStake } = full ? { paid: value, remainingStake: 0n } : partialCashOut(BigInt(bet.activeStakeMinor), value, fraction);
      if (paid <= 0n) throw new BetError('Cash out amount is too small.');
      const w = await db.wallets.get(userId);
      const amt = w ? convertMinor(paid, bet.currency, w.currency) : paid;
      await applyChange(userId, amt, 'CASHOUT', { refId: bet.id, note: `${full ? 'Cash out' : `Partial cash out (${Math.round(fraction * 100)}%)`} · ${bet.legs[0].home} v ${bet.legs[0].away}` });
      const next: BetRow = {
        ...bet,
        activeStakeMinor: remainingStake.toString(),
        cashedOutMinor: (BigInt(bet.cashedOutMinor) + paid).toString(),
        cashOuts: [...bet.cashOuts, { at: Date.now(), amountMinor: paid.toString(), fraction }],
        status: full ? 'CASHED_OUT' : 'PARTIALLY_CASHED_OUT',
      };
      if (full) {
        next.settledAt = Date.now();
        next.returnMinor = next.cashedOutMinor;
      }
      next.potentialReturnMinor = potentialReturn(next).toString();
      await db.bets.put(next);
      return { bet: next, paid };
    });
  },
};

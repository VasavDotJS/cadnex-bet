/** Pure bet maths: returns, outcomes and cash-out pricing. Covered by unit tests. */
import type { BetLeg, BetRow, BetStatus } from '../db/db';
import { comboReturn, legMultiplierE4, LegResult, Minor, ODDS_SCALE, SYSTEM_TYPES, systemReturn } from './money';

export const CASHOUT_MARGIN = 0.05;

export function multipliers(legs: Pick<BetLeg, 'result' | 'oddsE4'>[]): bigint[] {
  return legs.map((l) => legMultiplierE4(l.result, BigInt(l.oddsE4)));
}

/** Potential return of the stake still riding, using current leg results (pending legs at full odds). */
export function potentialReturn(bet: Pick<BetRow, 'type' | 'systemType' | 'legs' | 'activeStakeMinor' | 'stakeMinor' | 'unitStakeMinor'>): Minor {
  const mult = multipliers(bet.legs);
  const active = BigInt(bet.activeStakeMinor);
  if (bet.type === 'SYSTEM') {
    const type = SYSTEM_TYPES.find((t) => t.id === bet.systemType)!;
    const unit = BigInt(bet.unitStakeMinor ?? '0');
    return systemReturn(unit, type, mult);
  }
  if (bet.type === 'SINGLE') return comboReturn(active, [mult[0]]);
  return comboReturn(active, mult);
}

export interface Outcome {
  status: Exclude<BetStatus, 'OPEN' | 'PARTIALLY_CASHED_OUT' | 'CASHED_OUT'>;
  returnMinor: Minor;
}

/** Decide a bet if possible. Parlays lose as soon as one leg loses. */
export function decide(bet: Pick<BetRow, 'type' | 'systemType' | 'legs' | 'activeStakeMinor' | 'stakeMinor' | 'unitStakeMinor'>): Outcome | null {
  const pending = bet.legs.some((l) => l.result === 'PENDING');
  if (bet.type !== 'SYSTEM' && bet.legs.some((l) => l.result === 'LOST')) return { status: 'LOST', returnMinor: 0n };
  if (pending) return null;
  const ret = potentialReturn(bet);
  const staked = bet.type === 'SYSTEM' ? BigInt(bet.stakeMinor) : BigInt(bet.activeStakeMinor);
  const allVoid = bet.legs.every((l) => l.result === 'VOID' || l.result === 'PUSH');
  if (allVoid) return { status: 'VOID', returnMinor: ret };
  if (ret > staked) return { status: 'WON', returnMinor: ret };
  if (ret === staked) return { status: 'VOID', returnMinor: ret };
  return { status: 'LOST', returnMinor: ret };
}

export interface LegQuote {
  fair: number; // win-equivalent probability, 1 / fair odds
  available: boolean; // market open and selection priced
}

/**
 * Cash-out value: the fair value of the remaining bet less a margin.
 * value = potential return × Π(fair probability of pending legs) × (1 − margin)
 */
export function cashOutValue(bet: Pick<BetRow, 'type' | 'systemType' | 'legs' | 'activeStakeMinor' | 'stakeMinor' | 'unitStakeMinor' | 'status'>, quotes: (LegQuote | null)[]): Minor | null {
  if (bet.type === 'SYSTEM') return null;
  if (bet.status !== 'OPEN' && bet.status !== 'PARTIALLY_CASHED_OUT') return null;
  let p = 1;
  for (let i = 0; i < bet.legs.length; i++) {
    const leg = bet.legs[i];
    if (leg.result === 'LOST') return null;
    if (leg.result !== 'PENDING') continue;
    const q = quotes[i];
    if (!q || !q.available || q.fair <= 0) return null;
    p *= Math.min(1, q.fair);
  }
  const pot = potentialReturn(bet);
  const factor = BigInt(Math.floor(p * (1 - CASHOUT_MARGIN) * 1e9));
  let v = (pot * factor) / 1_000_000_000n;
  if (v >= pot) v = (pot * 99n) / 100n;
  return v > 0n ? v : null;
}

/** Split a bet for a partial cash out of `fraction` (0..1, 2 dp). Returns paid amount and remaining stake. */
export function partialCashOut(activeStake: Minor, value: Minor, fraction: number): { paid: Minor; remainingStake: Minor } {
  const f = BigInt(Math.round(Math.min(1, Math.max(0, fraction)) * 10000));
  const paid = (value * f) / 10000n;
  const remainingStake = activeStake - (activeStake * f) / 10000n;
  return { paid, remainingStake };
}

export function totalOddsE4(legs: Pick<BetLeg, 'oddsE4'>[]): bigint {
  let num = 1n;
  let den = 1n;
  for (const l of legs) {
    num *= BigInt(l.oddsE4);
    den *= ODDS_SCALE;
  }
  return (num * ODDS_SCALE) / den;
}

export type { LegResult };

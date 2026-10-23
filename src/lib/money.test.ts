import { describe, expect, it } from 'vitest';
import { asianResult, totalResult } from '../engine/sport';
import { cashOutValue, decide, partialCashOut, potentialReturn } from './betting';
import { comboReturn, convertMinor, formatMoney, legMultiplierE4, parseAmount, SYSTEM_TYPES, systemLines, systemReturn, toE4, units, usdToMinor } from './money';
import { formatOdds, roundOdds } from './odds';
import type { BetLeg } from '../db/db';

const leg = (odds: number, result: BetLeg['result'] = 'PENDING') => ({ oddsE4: toE4(odds).toString(), result }) as BetLeg;

describe('money parsing and formatting', () => {
  it('parses decimals exactly into minor units', () => {
    expect(parseAmount('1,234.56', 'USD')).toBe(123456n);
    expect(parseAmount('0.1', 'USD')).toBe(10n);
    expect(parseAmount('12', 'JPY')).toBe(12n);
    expect(parseAmount('1.5', 'JPY')).toBeNull();
    expect(parseAmount('1.234', 'KWD')).toBe(1234n);
    expect(parseAmount('0.00000001', 'BTC')).toBe(1n);
    expect(parseAmount('abc', 'USD')).toBeNull();
  });
  it('never loses precision on 0.1 + 0.2', () => {
    const a = parseAmount('0.1', 'USD')!;
    const b = parseAmount('0.2', 'USD')!;
    expect(a + b).toBe(parseAmount('0.3', 'USD'));
  });
  it('formats per currency decimals', () => {
    expect(formatMoney(123456n, 'USD')).toBe('$1,234.56');
    expect(formatMoney(3433300n, 'INR')).toBe('₹34,333.00');
    expect(formatMoney(5000n, 'JPY')).toBe('¥5,000');
    expect(formatMoney(1234n, 'KWD')).toBe('1.234 KD');
    expect(formatMoney(150000000n, 'BTC', { trim: true })).toBe('1.5 BTC');
    expect(formatMoney(-500n, 'EUR')).toBe('−€5.00');
  });
  it('handles balances beyond 2^53 for 8-decimal crypto', () => {
    const big = units(1_000_000_000n, 'BTC');
    expect(big).toBe(100_000_000_000_000_000n);
    expect(formatMoney(big, 'BTC', { trim: true })).toBe('1,000,000,000 BTC');
  });
});

describe('currency conversion', () => {
  it('converts with integer maths and floors', () => {
    expect(convertMinor(10000n, 'USD', 'INR')).toBe(842000n); // 100 USD → 8,420.00 INR
    expect(convertMinor(842000n, 'INR', 'USD')).toBe(10000n);
    expect(convertMinor(100n, 'USD', 'JPY')).toBe(151n);
  });
  it('derives stake limits per currency', () => {
    expect(usdToMinor('0.10', 'USD')).toBe(10n);
    expect(usdToMinor('0.10', 'JPY')).toBe(16n); // 15.1 rounded up
  });
});

describe('leg multipliers and parlays', () => {
  it('applies Asian handicap half results exactly', () => {
    expect(legMultiplierE4('HALF_WON', toE4(1.9))).toBe(14500n);
    expect(legMultiplierE4('HALF_LOST', toE4(1.9))).toBe(5000n);
    expect(legMultiplierE4('VOID', toE4(3.5))).toBe(10000n);
  });
  it('multiplies parlay odds and floors the return', () => {
    expect(comboReturn(1000n, [toE4(2.1), toE4(1.85), toE4(1.5)])).toBe(5827n); // 10.00 × 5.8275 = 58.275 → 58.27
  });
  it('treats void legs as 1.00 in a parlay', () => {
    const r = potentialReturn({ type: 'PARLAY', legs: [leg(2.0, 'WON'), leg(3.0, 'VOID'), leg(1.5, 'WON')], activeStakeMinor: '1000', stakeMinor: '1000' });
    expect(r).toBe(3000n);
  });
  it('settles a parlay as lost as soon as one leg loses', () => {
    const o = decide({ type: 'PARLAY', legs: [leg(2.0, 'LOST'), leg(3.0, 'PENDING')], activeStakeMinor: '1000', stakeMinor: '1000' });
    expect(o).toEqual({ status: 'LOST', returnMinor: 0n });
  });
  it('returns a half stake on a half-lost single', () => {
    const o = decide({ type: 'SINGLE', legs: [leg(1.9, 'HALF_LOST')], activeStakeMinor: '1000', stakeMinor: '1000' });
    expect(o).toEqual({ status: 'LOST', returnMinor: 500n });
  });
  it('refunds an all-void bet', () => {
    const o = decide({ type: 'PARLAY', legs: [leg(1.9, 'VOID'), leg(2.2, 'PUSH')], activeStakeMinor: '1000', stakeMinor: '1000' });
    expect(o).toEqual({ status: 'VOID', returnMinor: 1000n });
  });
});

describe('system bets', () => {
  const t = (id: string) => SYSTEM_TYPES.find((x) => x.id === id)!;
  it('has the right number of lines', () => {
    expect(systemLines(t('trixie'), 3).length).toBe(4);
    expect(systemLines(t('patent'), 3).length).toBe(7);
    expect(systemLines(t('yankee'), 4).length).toBe(11);
    expect(systemLines(t('lucky15'), 4).length).toBe(15);
    expect(systemLines(t('canadian'), 5).length).toBe(26);
    expect(systemLines(t('lucky31'), 5).length).toBe(31);
    expect(systemLines(t('heinz'), 6).length).toBe(57);
    expect(systemLines(t('lucky63'), 6).length).toBe(63);
    expect(systemLines(t('2/3'), 3).length).toBe(3);
    expect(systemLines(t('2/4'), 4).length).toBe(6);
    expect(systemLines(t('3/4'), 4).length).toBe(4);
  });
  it('pays a trixie with one loser as a single double', () => {
    const m = [toE4(2.0), toE4(3.0), 0n];
    expect(systemReturn(100n, t('trixie'), m)).toBe(600n);
  });
});

describe('asian handicap and totals settlement', () => {
  it('handles quarter lines', () => {
    expect(asianResult(0, -0.25)).toBe('HALF_LOST');
    expect(asianResult(1, -0.75)).toBe('HALF_WON');
    expect(asianResult(0, 0.25)).toBe('HALF_WON');
    expect(asianResult(-1, 0.75)).toBe('HALF_LOST');
    expect(asianResult(2, -1.5)).toBe('WON');
    expect(asianResult(1, -1)).toBe('PUSH');
    expect(asianResult(0, -0.5)).toBe('LOST');
  });
  it('settles totals', () => {
    expect(totalResult(3, 2.5, true)).toBe('WON');
    expect(totalResult(2, 2.5, true)).toBe('LOST');
    expect(totalResult(2, 2.25, true)).toBe('HALF_LOST');
  });
});

describe('cash out', () => {
  it('prices from fair probability less margin', () => {
    const bet = { type: 'SINGLE' as const, status: 'OPEN' as const, legs: [leg(2.0)], activeStakeMinor: '10000', stakeMinor: '10000' };
    // potential 200.00, fair p 0.6 → 120.00 × 0.95 = 114.00
    expect(cashOutValue(bet, [{ fair: 0.6, available: true }])).toBe(11400n);
  });
  it('is unavailable while a leg is suspended', () => {
    const bet = { type: 'PARLAY' as const, status: 'OPEN' as const, legs: [leg(2.0), leg(1.5, 'WON')], activeStakeMinor: '10000', stakeMinor: '10000' };
    expect(cashOutValue(bet, [{ fair: 0.5, available: false }, null])).toBeNull();
  });
  it('splits a partial cash out', () => {
    expect(partialCashOut(10000n, 11400n, 0.5)).toEqual({ paid: 5700n, remainingStake: 5000n });
  });
});

describe('odds formats', () => {
  it('converts between formats', () => {
    expect(formatOdds(2.5, 'fractional')).toBe('6/4'); // traditional bookmaker form
    expect(formatOdds(1.91, 'fractional')).toBe('10/11');
    expect(formatOdds(2.5, 'american')).toBe('+150');
    expect(formatOdds(1.5, 'american')).toBe('-200');
    expect(formatOdds(1.5, 'hongkong')).toBe('0.50');
    expect(formatOdds(1.5, 'indonesian')).toBe('-2.00');
    expect(formatOdds(2.5, 'malay')).toBe('-0.67');
  });
  it('rounds to a sensible ladder', () => {
    expect(roundOdds(1.234)).toBe(1.23);
    expect(roundOdds(5.12)).toBe(5.1);
    expect(roundOdds(13.3)).toBe(13.25);
  });
});

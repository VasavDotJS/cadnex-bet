import { describe, expect, it } from 'vitest';
import type { BetRow } from '../db/db';
import { computeWrapped } from './stats';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const H = 3_600_000;

let n = 0;
function bet(o: { at: number; status?: BetRow['status']; stake?: number; ret?: number; odds?: number; legs?: Partial<BetRow['legs'][number]>[]; type?: BetRow['type']; currency?: string }): BetRow {
  n++;
  const legs = (o.legs ?? [{}]).map((l, i) => ({
    selectionId: `e${n}${i}|1x2|1`, eventId: `e${n}${i}`, marketKey: '1x2', code: '1', sport: 'football' as const, leagueId: 'eng.1',
    home: 'Arsenal', away: 'Chelsea', marketName: 'Match result', label: 'Arsenal', odds: 2, oddsE4: '20000', result: 'PENDING' as const,
    startTime: o.at, live: false, ...l,
  }));
  const status = o.status ?? 'OPEN';
  return {
    id: `b${n}`, userId: 'u', type: o.type ?? (legs.length > 1 ? 'PARLAY' : 'SINGLE'), stakeMinor: String(o.stake ?? 1000), activeStakeMinor: String(o.stake ?? 1000),
    currency: o.currency ?? 'USD', totalOdds: o.odds ?? 2, potentialReturnMinor: String((o.stake ?? 1000) * (o.odds ?? 2)), status, legs,
    placedAt: o.at, settledAt: status === 'OPEN' ? undefined : o.at + H, returnMinor: o.ret !== undefined ? String(o.ret) : undefined,
    cashedOutMinor: '0', cashOuts: [],
  } as BetRow;
}

describe('wrapped', () => {
  it('counts the period, results, net and the biggest win', () => {
    const bets = [
      bet({ at: NOW - 2 * H, status: 'WON', stake: 1000, ret: 5000, odds: 5 }),
      bet({ at: NOW - 30 * H, status: 'LOST', stake: 2000, ret: 0 }),
      bet({ at: NOW - 50 * H, status: 'WON', stake: 1000, ret: 1800, odds: 1.8 }),
      bet({ at: NOW - 10 * 24 * H, status: 'WON', stake: 1000, ret: 9000, odds: 9 }), // outside the week
    ];
    const w = computeWrapped(bets, 'week', 'USD', NOW);
    expect(w.placed).toBe(3);
    expect([w.won, w.lost]).toEqual([2, 1]);
    expect(w.winRate).toBeCloseTo(2 / 3);
    expect(w.net).toBe(6800n - 4000n);
    expect(w.biggestWin?.profit).toBe(4000n);
    expect(w.longestOdds?.odds).toBe(5);
    const m = computeWrapped(bets, 'month', 'USD', NOW);
    expect(m.placed).toBe(4);
  });

  it('finds the favourite team and the loyalist', () => {
    const bets = [0, 1, 2, 3].map((i) => bet({ at: NOW - i * H, legs: [{ label: 'Barcelona', home: 'Barcelona', away: 'Real Madrid' }] }));
    const w = computeWrapped(bets, 'week', 'USD', NOW);
    expect(w.team).toEqual({ name: 'Barcelona', n: 4 });
    expect(w.persona.id).toBe('loyalist');
  });

  it('spots live wires, mavericks and architects', () => {
    const live = [0, 1, 2].map((i) => bet({ at: NOW - i * H, legs: [{ live: true, label: 'X', home: `H${i}`, away: `A${i}` }] }));
    expect(computeWrapped(live, 'week', 'USD', NOW).persona.id).toBe('livewire');
    const dogs = [0, 1, 2].map((i) => bet({ at: NOW - i * H, legs: [{ odds: 4.5, label: 'X', home: `H${i}`, away: `A${i}` }] }));
    expect(computeWrapped(dogs, 'week', 'USD', NOW).persona.id).toBe('maverick');
    const parlays = [0, 1, 2].map((i) => bet({ at: NOW - i * H, legs: [{ label: 'X', home: `H${i}`, away: `A${i}` }, { label: 'Y', home: `P${i}`, away: `Q${i}` }] }));
    expect(computeWrapped(parlays, 'week', 'USD', NOW).persona.id).toBe('architect');
  });

  it('converts other currencies into the wallet currency', () => {
    const w = computeWrapped([bet({ at: NOW - H, status: 'LOST', stake: 84200, ret: 0, currency: 'INR' })], 'week', 'USD', NOW);
    expect(w.staked).toBeGreaterThan(900n);
    expect(w.staked).toBeLessThan(1100n);
  });

  it('notices a parlay lost by a single leg', () => {
    const b = bet({ at: NOW - H, status: 'LOST', ret: 0, legs: [{ result: 'WON' }, { result: 'WON', label: 'B' }, { result: 'LOST', label: 'C' }] });
    expect(computeWrapped([b], 'week', 'USD', NOW).closeCall?.legs).toBe(3);
  });

  it('is calm about an empty week', () => {
    const w = computeWrapped([], 'week', 'USD', NOW);
    expect(w.placed).toBe(0);
    expect(w.persona.id).toBe('allrounder');
    expect(w.winRate).toBeNull();
  });
});

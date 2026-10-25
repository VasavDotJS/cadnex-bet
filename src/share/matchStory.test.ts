import { describe, expect, it } from 'vitest';
import type { EventPublic } from '../engine/types';
import { matchStoryFrom } from './matchStory';

const now = Date.UTC(2026, 9, 25, 12);
const ev = (o: Partial<EventPublic>): EventPublic =>
  ({
    id: 'eng.1~1~x', sport: 'football', leagueId: 'eng.1', leagueName: 'Premier League',
    home: { id: 'a', name: 'Arsenal', short: 'ARS', colors: ['EF0107', 'FFFFFF'] },
    away: { id: 'c', name: 'Chelsea', short: 'CHE', colors: ['#FFFFFF', '#034694'] },
    startTime: now + 90 * 60_000, status: 'SCHEDULED', venue: 'Emirates Stadium', round: '', detail: '', clock: '', period: '',
    score: [0, 0], lines: [], stats: [], incidents: [], momentum: 0, momentumHistory: [], pressure: [0, 0], progress: 0,
    markets: [
      { id: 'o', eventId: 'x', key: 'ou', name: 'Total goals', group: 'goals', status: 'OPEN', order: 2, selections: [] },
      { id: 'm', eventId: 'x', key: '1x2', name: 'Match result', group: 'main', status: 'OPEN', order: 0, selections: [
        { id: '1', code: '1', label: 'Arsenal', odds: 1.85 }, { id: 'X', code: 'X', label: 'Draw', odds: 3.6 }, { id: '2', code: '2', label: 'Chelsea', odds: 4.2 }] },
    ],
    ...o,
  }) as unknown as EventPublic;
const f = (o: number) => o.toFixed(2);

describe('match stories', () => {
  it('builds a matchday poster before kick-off', () => {
    const m = matchStoryFrom(ev({}), f, 'https://cadnex.vercel.app/#/event/x', now);
    expect(m.phase).toBe('PRE');
    expect(m.score).toBeNull();
    expect(m.countdown).toBe('in 1h 30m');
    expect(m.odds.map((o) => o.odds)).toEqual(['1.85', '3.60', '4.20']);
    expect(m.home.color).toBe('#EF0107');
    expect(m.away.ink).toBe('#0B0B0D'); // dark text on a white crest
  });

  it('lists scorers and red cards while live', () => {
    const m = matchStoryFrom(ev({ status: 'LIVE', clock: "74'", score: [2, 1], incidents: [
      { id: '1', at: 0, clock: "12'", kind: 'goal', side: 0, text: 'Goal — B. Saka' },
      { id: '2', at: 0, clock: "30'", kind: 'yellow', side: 1, text: 'Yellow card — E. Fernández' },
      { id: '3', at: 0, clock: "71'", kind: 'red', side: 1, text: 'Red card — M. Caicedo' },
    ] } as Partial<EventPublic>), f, 'https://x.app/#/event/x', now);
    expect(m.phase).toBe('LIVE');
    expect(m.score).toEqual(['2', '1']);
    expect(m.scorers).toEqual([
      { side: 0, clock: "12'", red: false, who: 'B. Saka' },
      { side: 1, clock: "71'", red: true, who: 'M. Caicedo' },
    ]);
  });

  it('crowns the winner at full time and drops the prices', () => {
    const m = matchStoryFrom(ev({ status: 'FINISHED', score: [0, 2] }), f, 'https://x.app/#/event/x', now);
    expect(m.phase).toBe('FT');
    expect(m.winner).toBe(1);
    expect(m.odds).toEqual([]);
    expect(m.clock).toBe('FULL TIME');
  });
});

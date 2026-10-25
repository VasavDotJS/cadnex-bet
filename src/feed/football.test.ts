import { describe, expect, it } from 'vitest';
import { FOOTBALL, FOOTBALL_BY_LID, LEAGUES } from '../data/leagues';
import { soccerEvent } from '../live/fixtures';
import { normalizeFootballDay } from './server';
import { parseEventKey } from './types';

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const team = (id: string, name: string, abbr: string): [string, string, string, string] => [id, name, abbr, '123456'];
const match = (id: string, lid: string) => ({
  ...soccerEvent({ id, start: NOW + 3_600_000, state: 'pre', home: team('1', 'Home FC', 'HOM'), away: team('2', 'Away FC', 'AWY') }),
  uid: `s:600~l:${lid}~e:${id}`,
});

describe('all-competitions football scoreboard', () => {
  it('sorts each match into its league and skips competitions we don’t price', () => {
    const events = normalizeFootballDay({ events: [match('1', '740'), match('2', '8316'), match('3', '775'), match('4', '5499'), match('5', '700')] });
    expect(events.map((e) => [e.id, e.leagueName]).sort()).toEqual([
      ['eng.1~5~20261025', 'Premier League'],
      ['esp.1~1~20261025', 'LaLiga'],
      ['ind.1~2~20261025', 'Indian Super League'],
      ['uefa.champions~3~20261025', 'UEFA Champions League'],
    ]);
  });

  it('copes with junk', () => {
    expect(normalizeFootballDay(null)).toEqual([]);
    expect(normalizeFootballDay({ events: [{ uid: 'nonsense' }, null, 7] })).toEqual([]);
  });

  it('every football league has a unique ESPN id and makes valid event keys', () => {
    expect(FOOTBALL.length).toBeGreaterThanOrEqual(40);
    expect(FOOTBALL_BY_LID.size).toBe(FOOTBALL.length);
    expect(new Set(LEAGUES.map((l) => l.id)).size).toBe(LEAGUES.length);
    for (const l of FOOTBALL) expect(parseEventKey(`${l.id}~401879254~20261025`)).not.toBeNull();
    for (const want of ['esp.1', 'ind.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'eng.1', 'ita.1', 'ger.1', 'fra.1']) expect(FOOTBALL.some((l) => l.id === want)).toBe(true);
  });
});

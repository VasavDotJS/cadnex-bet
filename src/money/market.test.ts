import { describe, expect, it } from 'vitest';
import { LEAGUES } from '../data/leagues';
import { normalizeScoreboard } from '../feed/espn';
import { LiveEngine } from '../live/engine';
import { goal, nbaEvent, soccerEvent } from '../live/fixtures';
import { isPlaceholderName } from '../lib/placeholder';
import { prepare, quote, result } from './market';

const EPL = LEAGUES.find((l) => l.id === 'eng.1')!;
const NBA = LEAGUES.find((l) => l.id === 'nba')!;
const ARS: [string, string, string, string] = ['359', 'Arsenal', 'ARS', 'ef0107'];
const CHE: [string, string, string, string] = ['363', 'Chelsea', 'CHE', '034694'];
const NOW = Date.UTC(2026, 9, 23, 18, 0, 0);
const ODDS = { provider: { name: 'DraftKings' }, details: 'ARS -0.5', overUnder: 2.5, homeTeamOdds: { moneyLine: -150 }, awayTeamOdds: { moneyLine: 400 }, drawOdds: { moneyLine: 280 } };

/** Every price the engine offers must be the price the server quotes for the same data. */
function agrees(ev: ReturnType<typeof normalizeScoreboard>[number]) {
  const engine = new LiveEngine();
  engine.lastOk = NOW;
  engine.apply(ev, NOW);
  const markets = engine.items.get(ev.id)!.markets.filter((m) => m.status !== 'SETTLED' && m.status !== 'VOID' && !m.closed);
  const p = prepare(ev, NOW)!;
  let n = 0;
  for (const m of markets) for (const s of m.selections) {
    if (s.locked || !(s.odds > 1)) continue;
    const q = quote(p, m.key, s.code);
    expect([m.key, s.code, q.odds]).toEqual([m.key, s.code, s.odds]);
    expect(q.fair).toBeCloseTo(s.fair, 6);
    n++;
  }
  return n;
}

describe('server pricing matches the live engine', () => {
  it('prices a pre-match football fixture identically', () => {
    const ev = normalizeScoreboard(EPL, { events: [soccerEvent({ id: '701', start: NOW + 3_600_000, state: 'pre', home: ARS, away: CHE, odds: ODDS })] })[0];
    expect(agrees(ev)).toBeGreaterThan(10);
  });

  it('prices a live football match identically', () => {
    const ev = normalizeScoreboard(EPL, { events: [soccerEvent({ id: '700', start: NOW - 70 * 60_000, state: 'in', clock: "67'", period: 2, home: ARS, away: CHE, score: [1, 0], details: [goal('359', "23'", 'Bukayo Saka')], odds: ODDS })] })[0];
    expect(agrees(ev)).toBeGreaterThan(10);
  });

  it('prices a live NBA game identically', () => {
    const ev = normalizeScoreboard(NBA, { events: [nbaEvent({ id: '401', start: NOW - 3_600_000, state: 'in', period: 3, clock: '4:12', q: [[28, 30, 20], [25, 27, 18]], odds: { details: 'BOS -3.5', overUnder: 224.5 } })] })[0];
    expect(agrees(ev)).toBeGreaterThan(3);
  });

  it('closes betting at kick-off and once a match is over', () => {
    const soon = normalizeScoreboard(EPL, { events: [soccerEvent({ id: '702', start: NOW + 10_000, state: 'pre', home: ARS, away: CHE, odds: ODDS })] })[0];
    expect(quote(prepare(soon, NOW)!, '1x2', '1').available).toBe(false);
    const done = normalizeScoreboard(EPL, { events: [soccerEvent({ id: '703', start: NOW - 3 * 3_600_000, state: 'post', home: ARS, away: CHE, score: [2, 1], details: [goal('359', "10'", 'A'), goal('363', "20'", 'B'), goal('359', "80'", 'C')] })] })[0];
    const p = prepare(done, NOW)!;
    expect(quote(p, '1x2', '1').available).toBe(false);
    expect(result(p, '1x2', '1')).toBe('WON');
    expect(result(p, '1x2', 'X')).toBe('LOST');
    expect(result(p, 'btts', 'y')).toBe('WON');
    expect(result(p, 'ou:2.5', 'o')).toBe('WON');
    expect(result(p, 'no-such-market', 'x')).toBe('VOID');
  });

  it('takes no bets while a side is still "TBD"', () => {
    const ev = normalizeScoreboard(EPL, { events: [soccerEvent({ id: '705', start: NOW + 3_600_000, state: 'pre', home: ARS, away: ['0', 'TBD', 'TBD', '333333'], odds: ODDS })] })[0];
    expect(quote(prepare(ev, NOW)!, '1x2', '1').available).toBe(false);
    const engine = new LiveEngine();
    engine.lastOk = NOW;
    engine.apply(ev, NOW);
    expect(engine.items.get(ev.id)!.markets).toHaveLength(0);
    for (const n of ['TBD', 'tba', 'Qualifier', 'Winner of R16 match', '', '  ']) expect(isPlaceholderName(n)).toBe(true);
    for (const n of ['Paula Badosa', 'Tbilisi FC', 'Byers', 'Unknownia']) expect(isPlaceholderName(n)).toBe(false);
  });

  it('leaves undecided markets open while a match is live', () => {
    const ev = normalizeScoreboard(EPL, { events: [soccerEvent({ id: '704', start: NOW - 30 * 60_000, state: 'in', clock: "30'", period: 1, home: ARS, away: CHE, score: [3, 0], details: [goal('359', "5'", 'A'), goal('359', "10'", 'B'), goal('359', "20'", 'C')], odds: ODDS })] })[0];
    const p = prepare(ev, NOW)!;
    expect(result(p, '1x2', '1')).toBeNull();
    expect(result(p, 'ou:2.5', 'o')).toBe('WON'); // already certain
    expect(quote(p, 'ou:2.5', 'o').available).toBe(false);
  });
});

describe('cup ties without bookmaker odds', () => {
  const CDR = LEAGUES.find((l) => l.id === 'esp.copa_del_rey')!;
  const tie = (homeTier?: number, awayTier?: number) => {
    const ev = normalizeScoreboard(CDR, { events: [soccerEvent({ id: '950', start: NOW + 3 * 86_400_000, state: 'pre', home: ['86', 'Real Madrid', 'RMA', 'ffffff'], away: ['3842', 'CD Tenerife', 'TEN', '0033aa'] })] })[0];
    if (homeTier) ev.home = { ...ev.home, tier: homeTier };
    if (awayTier) ev.away = { ...ev.away, tier: awayTier };
    return prepare(ev, NOW)!;
  };
  it('prices a top-flight side as a clear favourite over a lower-division one', () => {
    const p = tie(1, 2);
    expect(p.mem.pre?.src).toBe('tier');
    expect(quote(p, '1x2', '1').odds).toBeLessThan(1.6);
    expect(quote(p, '1x2', '2').odds).toBeGreaterThan(4.5);
    const bigger = tie(1, 3);
    expect(quote(bigger, '1x2', '1').odds).toBeLessThan(quote(p, '1x2', '1').odds);
  });
  it('keeps a lower-division home side the underdog', () => {
    const ev = tie(2, 1);
    expect(quote(ev, '1x2', '1').odds).toBeGreaterThan(quote(ev, '1x2', '2').odds);
  });
});

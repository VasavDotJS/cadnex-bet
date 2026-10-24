import { describe, expect, it } from 'vitest';
import { LEAGUES } from '../data/leagues';
import { normalizeCricketHeader, normalizeScoreboard, normalizeTennis, parseMinute, toDecimal } from '../feed/espn';
import type { FeedEvent } from '../feed/types';
import { cricketProb } from './cricket';
import { LiveEngine } from './engine';
import { card, cricketHeader, goal, nbaEvent, soccerEvent, tennisPayload } from './fixtures';
import { footballModel, regulationScore, solveLambdas } from './football';
import { setsState } from './tennis';

const EPL = LEAGUES.find((l) => l.id === 'eng.1')!;
const NBA = LEAGUES.find((l) => l.id === 'nba')!;
const ATP = LEAGUES.find((l) => l.id === 'atp')!;
const ARS: [string, string, string, string] = ['359', 'Arsenal', 'ARS', 'ef0107'];
const CHE: [string, string, string, string] = ['363', 'Chelsea', 'CHE', '034694'];
const NOW = Date.UTC(2026, 9, 23, 18, 0, 0);

function epl(o: Parameters<typeof soccerEvent>[0]): FeedEvent {
  return normalizeScoreboard(EPL, { events: [soccerEvent(o)] })[0];
}

describe('ESPN normalisers', () => {
  it('reads a live football match with goals, cards, stats and odds', () => {
    const ev = epl({
      id: '700', start: NOW - 70 * 60_000, state: 'in', clock: "67'", period: 2, home: ARS, away: CHE, score: [1, 0],
      details: [goal('359', "23'", 'Bukayo Saka'), card('363', "41'", 'Moisés Caicedo')],
      stats: [{ possessionPct: '58.2', totalShots: '11', shotsOnTarget: '5', wonCorners: '6' }, { possessionPct: '41.8', totalShots: '6', shotsOnTarget: '2', wonCorners: '3' }],
      odds: { provider: { name: 'DraftKings' }, details: 'ARS -0.5', overUnder: 2.5, homeTeamOdds: { moneyLine: -150 }, awayTeamOdds: { moneyLine: 400 }, drawOdds: { moneyLine: 280 } },
    });
    expect(ev.id).toBe('eng.1~700~20261023');
    expect(ev.status).toBe('LIVE');
    expect(ev.clock).toBe("67'");
    expect(ev.home.name).toBe('Arsenal');
    expect(ev.home.colors[0]).toBe('#ef0107');
    expect(ev.home.score).toBe(1);
    expect(ev.home.stats).toMatchObject({ possession: 58.2, shots: 11, sot: 5, corners: 6 });
    expect(ev.incidents.map((i) => [i.kind, i.side, i.minute])).toEqual([['goal', 0, 23], ['yellow', 1, 41]]);
    expect(ev.odds?.home).toBeCloseTo(1.6667, 3);
    expect(ev.odds?.draw).toBeCloseTo(3.8, 3);
    expect(ev.odds?.total).toBe(2.5);
  });

  it('reads the newer odds layout and status names', () => {
    const ev = epl({ id: '701', start: NOW + 3_600_000, state: 'pre', home: ARS, away: CHE, odds: { moneyline: { home: { close: { odds: '+120' } }, away: { close: { odds: '+210' } }, draw: { close: { odds: '+250' } } }, total: { over: { close: { line: 'o2.5' } } } } });
    expect(ev.status).toBe('SCHEDULED');
    expect(ev.odds).toMatchObject({ home: 2.2, away: 3.1, draw: 3.5, total: 2.5 });
    const pp = epl({ id: '702', start: NOW, state: 'post', name: 'STATUS_POSTPONED', detail: 'Postponed', home: ARS, away: CHE });
    expect(pp.status).toBe('POSTPONED');
  });

  it('parses clocks and odds formats', () => {
    expect(parseMinute("90'+4'")).toEqual({ minute: 94, extraTime: false });
    expect(parseMinute("105'")).toEqual({ minute: 105, extraTime: true });
    expect(toDecimal('-200')).toBe(1.5);
    expect(toDecimal('EVEN')).toBe(2);
    expect(toDecimal(undefined)).toBeUndefined();
  });

  it('reads NBA quarters and a spread written as "ABBR -x"', () => {
    const ev = normalizeScoreboard(NBA, { events: [nbaEvent({ id: '401', start: NOW, state: 'in', period: 3, clock: '4:12', q: [[28, 30, 20], [25, 27, 18]], odds: { details: 'BOS -3.5', overUnder: 224.5 } })] })[0];
    expect(ev.clock).toBe('Q3 4:12');
    expect(ev.home.score).toBe(78);
    expect(ev.home.lines).toEqual([28, 30, 20]);
    expect(ev.odds?.spreadHome).toBe(3.5); // Boston are favourites away, so the Lakers get +3.5
    expect(ev.odds?.total).toBe(224.5);
  });

  it('reads tennis singles only, with sets and retirements', () => {
    const list = normalizeTennis(ATP, tennisPayload(NOW));
    expect(list.map((e) => e.espnId)).toEqual(['t1', 't2', 't3']);
    expect(list[0].leagueName).toBe('Paris Masters');
    expect(setsState(list[0])).toMatchObject({ sets: [1, 0], cur: [2, 3] });
    expect(setsState(list[1]).sets).toEqual([2, 1]);
    expect(list[2].extra.retired).toBe(true);
  });

  it('reads cricket from the header feed, including a chase', () => {
    const { events } = normalizeCricketHeader(cricketHeader(NOW));
    expect(events).toHaveLength(2);
    const live = events[0];
    expect(live.leagueId).toBe('cricket-23694');
    expect(live.extra.cricket?.format).toBe('T20');
    expect(live.extra.cricket?.chase).toEqual({ side: 1, need: 24, balls: 18 });
    expect(live.home.scoreText).toBe('186/7 (20 ov)');
    expect(events[1].home.winner).toBe(true);
  });
});

describe('pricing from real state', () => {
  it('reproduces the market 1X2 from solved goal rates', () => {
    const { lh, la } = solveLambdas(0.55, 0.2);
    expect(lh).toBeGreaterThan(la);
    const ev = epl({ id: '710', start: NOW + 3_600_000, state: 'pre', home: ARS, away: CHE, odds: { homeTeamOdds: { moneyLine: -150 }, awayTeamOdds: { moneyLine: 400 }, drawOdds: { moneyLine: 280 } } });
    const mem = { goals: [], lastScore: [0, 0] as [number, number], history: [], momentum: 0, recent: [], derived: [], seq: 0, pre: footballModel.prematch(ev) };
    const spec = footballModel.spec('1x2', ev)!;
    const t = footballModel.price(ev, mem, [spec]).get('1x2')!;
    expect(t['1'].w).toBeGreaterThan(0.5);
    expect(t['2'].w).toBeLessThan(0.3);
  });

  it('makes the leader a heavy favourite late on', () => {
    const ev = epl({ id: '711', start: NOW - 95 * 60_000, state: 'in', clock: "88'", period: 2, home: ARS, away: CHE, score: [2, 0] });
    const mem = { goals: [0, 0] as (0 | 1)[], lastScore: [2, 0] as [number, number], history: [], momentum: 0, recent: [], derived: [], seq: 0, pre: { lh: 1.4, la: 1.2, src: 'default' } };
    const t = footballModel.price(ev, mem, [footballModel.spec('1x2', ev)!]).get('1x2')!;
    expect(t['1'].w).toBeGreaterThan(0.97);
  });

  it('prices a cricket chase from runs, balls and wickets', () => {
    const { events } = normalizeCricketHeader(cricketHeader(NOW));
    const p = cricketProb(events[0], 0.5)!;
    expect(p).toBeLessThan(0.5); // India (away) need 24 off 18 with 6 wickets: slight favourites
    const easier = { ...events[0], extra: { ...events[0].extra, cricket: { ...events[0].extra.cricket!, chase: { side: 1 as const, need: 4, balls: 18 } } } };
    expect(cricketProb(easier, 0.5)!).toBeLessThan(p);
  });
});

describe('settlement on real results', () => {
  it('uses the 90-minute score after extra time', () => {
    const ev = epl({
      id: '720', start: NOW - 3 * 3_600_000, state: 'post', name: 'STATUS_FINAL_AET', detail: 'AET', home: ARS, away: CHE, score: [2, 1],
      details: [goal('359', "30'", 'Saka'), goal('363', "90'+2'", 'Palmer'), goal('359', "112'", 'Havertz')],
    });
    expect(ev.extra.aet).toBe(true);
    expect(regulationScore(ev)).toEqual([1, 1]);
    const mem = { goals: [0, 1] as (0 | 1)[], lastScore: [2, 1] as [number, number], history: [], momentum: 0, recent: [], derived: [], seq: 0 };
    expect(footballModel.settle('1x2', ev, mem, true)).toMatchObject({ X: 'WON', '1': 'LOST' });
  });

  it('follows a match from kick-off to full time and settles every market', () => {
    const e = new LiveEngine();
    e.lastOk = NOW;
    const pre = epl({ id: '730', start: NOW + 10 * 60_000, state: 'pre', home: ARS, away: CHE, odds: { homeTeamOdds: { moneyLine: -120 }, awayTeamOdds: { moneyLine: 300 }, drawOdds: { moneyLine: 260 } } });
    e.ingest([pre], NOW);
    const it = e.items.get(pre.id)!;
    expect(it.markets.find((m) => m.key === '1x2')!.status).toBe('OPEN');
    // goal at 12' by the home side
    const t1 = NOW + 25 * 60_000;
    e.lastOk = t1;
    e.ingest([epl({ id: '730', start: pre.startTime, state: 'in', clock: "12'", period: 1, home: ARS, away: CHE, score: [0, 0] })], t1);
    e.ingest([epl({ id: '730', start: pre.startTime, state: 'in', clock: "13'", period: 1, home: ARS, away: CHE, score: [1, 0], details: [goal('359', "12'", 'Saka')] })], t1 + 15_000);
    expect(it.mem.goals).toEqual([0]);
    expect(it.markets.find((m) => m.key === 'ng:1')!.status).toBe('SETTLED');
    expect(it.markets.find((m) => m.key === 'ng:1')!.selections.find((s) => s.code === '1')!.result).toBe('WON');
    // markets pause right after the goal, then reopen
    expect(it.markets.find((m) => m.key === '1x2')!.status).toBe('SUSPENDED');
    e.tick(t1 + 40_000);
    expect(it.markets.find((m) => m.key === '1x2')!.status).toBe('OPEN');
    // stale data pauses live markets
    e.tick(t1 + 200_000);
    expect(it.markets.find((m) => m.key === '1x2')!.status).toBe('SUSPENDED');
    // full time 2–1
    const t2 = NOW + 2 * 3_600_000;
    e.lastOk = t2;
    e.ingest([epl({ id: '730', start: pre.startTime, state: 'post', home: ARS, away: CHE, score: [2, 1], details: [goal('359', "12'", 'Saka'), goal('363', "50'", 'Palmer'), goal('359', "80'", 'Rice')] })], t2);
    const res = (key: string, code: string) => it.markets.find((m) => m.key === key)!.selections.find((s) => s.code === code)!.result;
    expect(res('1x2', '1')).toBe('WON');
    expect(res('btts', 'y')).toBe('WON');
    expect(res('cs', '2-1')).toBe('WON');
    expect(it.markets.every((m) => m.status === 'SETTLED' || m.status === 'VOID')).toBe(true);
  });

  it('voids everything when a match is postponed', () => {
    const e = new LiveEngine();
    e.lastOk = NOW;
    const pre = epl({ id: '740', start: NOW + 3_600_000, state: 'pre', home: ARS, away: CHE });
    e.ingest([pre], NOW);
    e.ingest([epl({ id: '740', start: pre.startTime, state: 'post', name: 'STATUS_POSTPONED', detail: 'Postponed', home: ARS, away: CHE })], NOW + 60_000);
    expect(e.items.get(pre.id)!.markets.every((m) => m.status === 'VOID')).toBe(true);
  });

  it('closes pre-match betting at kick-off even if the feed is late', () => {
    const e = new LiveEngine();
    e.lastOk = NOW;
    const pre = epl({ id: '750', start: NOW + 20_000, state: 'pre', home: ARS, away: CHE });
    e.ingest([pre], NOW);
    expect(e.items.get(pre.id)!.markets[0].status).toBe('SUSPENDED');
  });

  it('settles tennis on sets and voids on retirement', () => {
    const e = new LiveEngine();
    e.lastOk = NOW;
    const list = normalizeTennis(ATP, tennisPayload(NOW));
    // first see the matches live so markets exist
    for (const ev of list) e.ingest([{ ...ev, status: 'LIVE', extra: { ...ev.extra, retired: false } }], NOW);
    e.ingest(list, NOW + 60_000);
    const won = e.items.get(list[1].id)!;
    expect(won.markets.find((m) => m.key === 'mw')!.selections.find((s) => s.code === '1')!.result).toBe('WON');
    const ret = e.items.get(list[2].id)!;
    expect(ret.markets.find((m) => m.key === 'mw')!.status).toBe('VOID');
  });

  it('settles cricket on the winner flag', () => {
    const e = new LiveEngine();
    e.lastOk = NOW;
    const { events } = normalizeCricketHeader(cricketHeader(NOW));
    const done = events[1];
    e.ingest([{ ...done, status: 'LIVE', home: { ...done.home, winner: undefined } }], NOW);
    e.ingest([done], NOW + 60_000);
    expect(e.items.get(done.id)!.markets.find((m) => m.key === 'mw')!.selections.find((s) => s.code === '1')!.result).toBe('WON');
  });
});

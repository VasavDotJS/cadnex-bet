/**
 * ESPN-shaped sample payloads for tests and offline development. They follow the public
 * site API's structure (events → competitions → competitors, status.type.state, details,
 * odds, linescores) with times relative to `now`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function soccerTeam(id: string, name: string, abbr: string, color: string) {
  return { id, displayName: name, shortDisplayName: name, abbreviation: abbr, color, alternateColor: 'ffffff' };
}

export function soccerEvent(o: {
  id: string; start: number; state: 'pre' | 'in' | 'post'; name?: string; clock?: string; period?: number; detail?: string;
  home: [string, string, string, string]; away: [string, string, string, string]; score?: [number, number];
  details?: any[]; odds?: any; stats?: [Record<string, string>, Record<string, string>]; records?: [string, string];
}) {
  const statName = o.name ?? (o.state === 'pre' ? 'STATUS_SCHEDULED' : o.state === 'in' ? (o.period === 2 ? 'STATUS_SECOND_HALF' : 'STATUS_FIRST_HALF') : 'STATUS_FULL_TIME');
  const status = {
    clock: 0, displayClock: o.clock ?? "0'", period: o.period ?? 0,
    type: { id: '1', name: statName, state: o.state, completed: o.state === 'post', description: o.state, detail: o.detail ?? (o.state === 'post' ? 'FT' : o.clock ?? ''), shortDetail: o.detail ?? (o.state === 'post' ? 'FT' : o.clock ?? '') },
  };
  const side = (t: [string, string, string, string], homeAway: string, score: number, i: number) => ({
    id: t[0], homeAway, score: String(score), team: soccerTeam(...t),
    statistics: o.stats ? Object.entries(o.stats[i]).map(([name, displayValue]) => ({ name, displayValue })) : [],
    records: o.records ? [{ summary: o.records[i] }] : [],
    form: 'WDWLW',
  });
  return {
    id: o.id, date: iso(o.start), name: `${o.away[1]} at ${o.home[1]}`, status,
    competitions: [{
      id: o.id, date: iso(o.start), venue: { fullName: `${o.home[1]} Stadium` }, status,
      competitors: [side(o.home, 'home', o.score?.[0] ?? 0, 0), side(o.away, 'away', o.score?.[1] ?? 0, 1)],
      details: o.details ?? [], odds: o.odds ? [o.odds] : [],
    }],
  };
}

export function goal(teamId: string, minute: string, player: string, opts: { pen?: boolean; og?: boolean } = {}) {
  return {
    type: { id: '70', text: opts.og ? 'Own Goal' : opts.pen ? 'Penalty - Scored' : 'Goal' },
    clock: { value: 0, displayValue: minute }, team: { id: teamId }, scoreValue: 1, scoringPlay: true,
    redCard: false, yellowCard: false, penaltyKick: !!opts.pen, ownGoal: !!opts.og,
    athletesInvolved: [{ displayName: player }],
  };
}

export function card(teamId: string, minute: string, player: string, red = false) {
  return {
    type: { id: red ? '93' : '94', text: red ? 'Red Card' : 'Yellow Card' }, clock: { value: 0, displayValue: minute }, team: { id: teamId },
    scoringPlay: false, redCard: red, yellowCard: !red, athletesInvolved: [{ displayName: player }],
  };
}

export function nbaEvent(o: { id: string; start: number; state: 'pre' | 'in' | 'post'; period?: number; clock?: string; detail?: string; q?: [number[], number[]]; odds?: any }) {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const status = { displayClock: o.clock ?? '0:00', period: o.period ?? 0, type: { name: o.state === 'post' ? 'STATUS_FINAL' : o.state === 'in' ? 'STATUS_IN_PROGRESS' : 'STATUS_SCHEDULED', state: o.state, completed: o.state === 'post', shortDetail: o.detail ?? '' } };
  const team = (id: string, name: string, abbr: string, color: string, homeAway: string, q: number[]) => ({
    id, homeAway, score: String(sum(q)), team: { id, displayName: name, abbreviation: abbr, color, alternateColor: 'ffffff' }, linescores: q.map((v) => ({ value: v })), records: [{ summary: homeAway === 'home' ? '3-1' : '2-2' }],
  });
  return {
    id: o.id, date: iso(o.start), name: 'Boston Celtics at Los Angeles Lakers', status,
    competitions: [{ id: o.id, date: iso(o.start), status, venue: { fullName: 'Crypto.com Arena' },
      competitors: [team('13', 'Los Angeles Lakers', 'LAL', '552583', 'home', o.q?.[0] ?? []), team('2', 'Boston Celtics', 'BOS', '007a33', 'away', o.q?.[1] ?? [])],
      odds: o.odds ? [o.odds] : [] }],
  };
}

export function tennisPayload(now: number) {
  const ath = (name: string, rank?: number) => ({ displayName: name, shortName: name, flag: { alt: 'ITA' }, ...(rank ? { rank } : {}) });
  const match = (id: string, state: 'pre' | 'in' | 'post', a: [string, number], b: [string, number], sets: [number, number][], extra: any = {}) => ({
    id, date: iso(now - 3_600_000), status: { type: { name: state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED', state, completed: state === 'post', shortDetail: extra.detail ?? '', detail: extra.detail ?? '' } },
    round: { displayName: 'Quarterfinal' }, venue: { court: 'Court Central' },
    competitors: [
      { id: `${id}a`, order: 1, winner: extra.winner === 0, athlete: ath(a[0], a[1]), linescores: sets.map((s) => ({ value: s[0] })) },
      { id: `${id}b`, order: 2, winner: extra.winner === 1, athlete: ath(b[0], b[1]), linescores: sets.map((s) => ({ value: s[1] })) },
    ],
  });
  return {
    events: [{
      id: '713', name: 'Paris Masters',
      groupings: [
        { grouping: { slug: 'mens-singles', displayName: "Men's Singles" }, competitions: [
          match('t1', 'in', ['Jannik Sinner', 1], ['Tommy Paul', 12], [[6, 4], [2, 3]]),
          match('t2', 'post', ['Carlos Alcaraz', 2], ['Holger Rune', 11], [[6, 3], [4, 6], [7, 6]], { winner: 0 }),
          match('t3', 'post', ['Ben Shelton', 6], ['Casper Ruud', 13], [[3, 2]], { detail: 'Retired' }),
        ] },
        { grouping: { slug: 'mens-doubles', displayName: "Men's Doubles" }, competitions: [
          { id: 'd1', status: { type: { state: 'in' } }, competitors: [{ id: 'x', team: { displayName: 'A / B' } }, { id: 'y', team: { displayName: 'C / D' } }] },
        ] },
      ],
    }],
  };
}

export function cricketHeader(now: number) {
  return {
    sports: [{ leagues: [{
      id: '23694', name: 'India tour of Australia T20I Series', abbreviation: 'IND v AUS',
      events: [{
        id: '9001', date: iso(now - 2 * 3_600_000), name: '2nd T20I',
        status: 'in', summary: 'India need 24 runs in 18 balls',
        fullStatus: { type: { state: 'in', detail: 'India need 24 runs in 18 balls', shortDetail: 'Live' } },
        competitors: [
          { id: '6', displayName: 'Australia', abbreviation: 'AUS', homeAway: 'home', score: '186/7 (20 ov)', color: 'ffcd00' },
          { id: '1', displayName: 'India', abbreviation: 'IND', homeAway: 'away', score: '163/4 (17 ov)', color: '1c4da1' },
        ],
      }, {
        id: '9002', date: iso(now - 30 * 3_600_000), name: '1st T20I', status: 'post', summary: 'Australia won by 12 runs',
        fullStatus: { type: { state: 'post', detail: 'Australia won by 12 runs' } },
        competitors: [
          { id: '6', displayName: 'Australia', abbreviation: 'AUS', homeAway: 'home', score: '190/5 (20 ov)', winner: true },
          { id: '1', displayName: 'India', abbreviation: 'IND', homeAway: 'away', score: '178/8 (20 ov)', winner: false },
        ],
      }],
    }] }],
  };
}

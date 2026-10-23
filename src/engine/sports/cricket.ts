/**
 * T20 cricket, ball by ball. The outcome distribution shifts by phase (powerplay, middle,
 * death), batter quality, wickets in hand and, for the chasing side, the required rate.
 * A tie goes to a super over.
 */
import type { CricketTeam } from '../../data/types';
import { Rng, chance, clamp, normal, weighted } from '../../lib/rng';
import { Emit, MarketDef, Settled, SportModule, View, fmtLine, line, ou } from '../sport';
import type { Side } from '../types';

interface CT { name: string; short: string; bat: number; bowl: number; players: { name: string; w: number }[]; bowlers: string[] }

interface Innings {
  side: Side;
  runs: number;
  wkts: number;
  balls: number;
  fours: number;
  sixes: number;
  extras: number;
  striker: number;
  non: number;
  next: number;
  curOver: number;
  overRuns: number[];
  bowler: string;
  dismissals: string[]; // method per wicket in order
}

interface Bat { r: number; b: number; out: boolean }

export interface CricketState {
  t: [CT, CT];
  ipl: boolean;
  batFirst: Side;
  phase: 'PRE' | 'LIVE' | 'BREAK' | 'FT';
  inns: Innings[];
  bat: Record<string, Bat>;
  target: number | null;
  acc: number;
  wait: number;
  winner: Side | null;
  superOver: boolean;
  note: string;
  m: number;
  mh: number[];
  latent: { form: [number, number]; pitch: number };
  said: string[];
}

export interface CricketFinal {
  winner: Side | null;
  inns: { side: Side; runs: number; wkts: number; balls: number; sixes: number; overRuns: number[]; dismissals: string[] }[];
  bat: Record<string, Bat>;
  sixes: number;
}

const BALL = 30;
const OVER_GAP = 40;
const INNINGS_BREAK = 480;

export function createCricket(home: CricketTeam, away: CricketTeam, ipl: boolean): CricketState {
  const lite = (x: CricketTeam): CT => ({ name: x.name, short: x.short, bat: x.bat, bowl: x.bowl, players: x.players.map((p) => ({ ...p })), bowlers: [...x.bowlers] });
  return {
    t: [lite(home), lite(away)], ipl, batFirst: 0, phase: 'PRE', inns: [], bat: {}, target: null, acc: 0, wait: 0,
    winner: null, superOver: false, note: '', m: 0, mh: [], latent: { form: [0, 0], pitch: 0 }, said: [],
  };
}

function newInnings(s: CricketState, side: Side, rng: Rng): Innings {
  const bowlers = s.t[1 - side].bowlers;
  for (const p of s.t[side].players) s.bat[`${side}:${p.name}`] = { r: 0, b: 0, out: false };
  return { side, runs: 0, wkts: 0, balls: 0, fours: 0, sixes: 0, extras: 0, striker: 0, non: 1, next: 2, curOver: 0, overRuns: [], bowler: bowlers[Math.floor(rng.next() * bowlers.length)], dismissals: [] };
}

const overStr = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

function clockLabel(s: CricketState): string {
  const inn = s.inns[s.inns.length - 1];
  if (s.phase === 'PRE') return 'Toss';
  if (s.phase === 'FT') return 'Result';
  if (s.phase === 'BREAK') return 'Innings break';
  return inn ? `${overStr(inn.balls)} ov` : '';
}

const T = {
  six: ['{b} launches it over long-on for SIX', '{b} clears the ropes at deep midwicket. Six!', 'Maximum! {b} picks the slower ball and sends it into the stands', '{b} steps out and lofts it straight for six'],
  four: ['{b} drives through the covers for four', '{b} pulls hard, races away to the fence', 'Four! {b} threads the gap at point'],
  wkt: {
    Caught: ['Taken in the deep! {b} goes for {r}','{b} holes out to long-off, gone for {r}', '{b} edges behind. {bw} strikes, {b} departs for {r}', 'Skied and caught! {b} out for {r}'],
    Bowled: ['Bowled him! {bw} knocks back the off stump, {b} gone for {r}', '{b} misses a full one and is bowled for {r}'],
    LBW: ['Plumb! {b} trapped LBW by {bw} for {r}', '{b} given out LBW. The review is lost'],
    'Run out': ['Direct hit! {b} is run out for {r}', 'Mix-up in the middle and {b} is run out for {r}'],
    Stumped: ['Stumped! {b} beaten in flight by {bw}, out for {r}'],
  } as Record<string, string[]>,
  fifty: ['FIFTY for {b} off {balls} balls', '{b} raises the bat: a {balls}-ball fifty'],
};

// outcome order: dot, 1, 2, 3, 4, 6, wicket
const OUTCOMES = ['0', '1', '2', '3', '4', '6', 'W'];
const PHASE_P = [
  [0.4, 0.3, 0.06, 0.005, 0.14, 0.045, 0.05],
  [0.34, 0.4, 0.08, 0.005, 0.085, 0.045, 0.045],
  [0.3, 0.32, 0.08, 0.005, 0.12, 0.1, 0.075],
];
const pbuf = new Float64Array(7);

function ballOutcome(s: CricketState, inn: Innings, rng: Rng, live: boolean): string {
  const over = Math.floor(inn.balls / 6);
  const team = s.t[inn.side];
  const opp = s.t[1 - inn.side];
  const batter = team.players[inn.striker];
  const q = (batter?.w ?? 30) / 100;
  const base = PHASE_P[over < 6 ? 0 : over < 15 ? 1 : 2];
  let a = (team.bat - opp.bowl) / 40 + (q - 0.75) * 0.9;
  if (s.ipl) a += 0.12;
  if (live) a += s.latent.form[inn.side] + s.latent.pitch;
  // wickets in hand: conserve when many are down
  if (10 - inn.wkts <= 3 && over < 17) a -= 0.25;
  // chase: required-rate pressure
  if (s.target !== null && s.inns.length === 2 && inn === s.inns[1]) {
    const need = s.target - inn.runs;
    const ballsLeft = 120 - inn.balls;
    const rrr = (need / Math.max(1, ballsLeft)) * 6;
    const crr = inn.balls ? (inn.runs / inn.balls) * 6 : 8;
    a += clamp((rrr - Math.max(crr, 8)) / 6, -0.4, 0.8);
  }
  a += 0.2 * s.m * (inn.side === 0 ? 1 : -1);
  const tail = clamp(1.6 - q * 1.1, 0.6, 1.5);
  pbuf[0] = base[0] * Math.exp(-0.35 * a) * (q < 0.4 ? 1.3 : 1);
  pbuf[1] = base[1];
  pbuf[2] = base[2];
  pbuf[3] = base[3];
  pbuf[4] = base[4] * Math.exp(0.55 * a) * (0.45 + 0.75 * q);
  pbuf[5] = base[5] * Math.exp(0.7 * a) * (0.35 + 0.85 * q);
  pbuf[6] = base[6] * Math.exp(0.45 * a) * tail;
  let total = 0;
  for (let i = 0; i < 7; i++) total += pbuf[i];
  let x = rng.next() * total;
  for (let i = 0; i < 7; i++) {
    x -= pbuf[i];
    if (x <= 0) return OUTCOMES[i];
  }
  return '0';
}

function rotate(inn: Innings): void {
  const x = inn.striker;
  inn.striker = inn.non;
  inn.non = x;
}

function endInnings(s: CricketState, emit: Emit | null, rng: Rng): void {
  const inn = s.inns[s.inns.length - 1];
  const team = s.t[inn.side];
  if (s.inns.length === 1) {
    s.target = inn.runs + 1;
    s.phase = 'BREAK';
    s.wait = INNINGS_BREAK;
    emit?.incident('period', `Innings over: ${team.short} ${inn.runs}/${inn.wkts} (${overStr(inn.balls)}). ${s.t[1 - inn.side].short} need ${s.target} to win`, { clock: 'Innings break', major: true });
    emit?.key();
    return;
  }
  const first = s.inns[0];
  const chase = s.inns[1];
  if (chase.runs >= s.target!) {
    s.winner = chase.side;
    s.note = `${s.t[chase.side].name} win by ${10 - chase.wkts} wicket${10 - chase.wkts === 1 ? '' : 's'}`;
  } else if (chase.runs < s.target! - 1) {
    s.winner = first.side;
    const by = first.runs - chase.runs;
    s.note = `${s.t[first.side].name} win by ${by} run${by === 1 ? '' : 's'}`;
  } else {
    // tie → super over
    s.superOver = true;
    let w: Side | null = null;
    for (let k = 0; k < 4 && w === null; k++) {
      const a = superOver(s, chase.side, rng);
      const b = superOver(s, first.side, rng);
      if (a !== b) w = a > b ? chase.side : first.side;
    }
    s.winner = w ?? (chance(rng, 0.5) ? 0 : 1);
    s.note = `Scores level! ${s.t[s.winner].name} win the super over`;
  }
  s.phase = 'FT';
  emit?.incident('end', s.note, { side: s.winner ?? undefined, clock: 'Result', major: true });
}

function superOver(s: CricketState, side: Side, rng: Rng): number {
  const team = s.t[side];
  let runs = 0;
  let w = 0;
  for (let b = 0; b < 6 && w < 2; b++) {
    const q = team.players[b % 3].w / 100;
    const r = rng.next();
    if (r < 0.09) w++;
    else if (r < 0.09 + 0.2 * q) runs += 6;
    else if (r < 0.09 + 0.2 * q + 0.22) runs += 4;
    else if (r < 0.75) runs += 1 + (rng.next() < 0.3 ? 1 : 0);
  }
  return runs;
}

function ball(s: CricketState, rng: Rng, emit: Emit | null, live: boolean): void {
  const inn = s.inns[s.inns.length - 1];
  const team = s.t[inn.side];
  // extras
  if (chance(rng, 0.038)) {
    const nb = chance(rng, 0.15);
    inn.runs += 1;
    inn.extras += 1;
    inn.curOver += 1;
    if (!nb) return; // wide: re-bowl
  }
  const o = ballOutcome(s, inn, rng, live);
  const name = team.players[inn.striker].name;
  const b = s.bat[`${inn.side}:${name}`];
  inn.balls++;
  b.b++;
  if (o === 'W') {
    const how = weighted(rng, ['Caught', 'Bowled', 'LBW', 'Run out', 'Stumped'], (k) => ({ Caught: 60, Bowled: 18, LBW: 12, 'Run out': 7, Stumped: 3 })[k]!);
    b.out = true;
    inn.wkts++;
    inn.dismissals.push(how);
    s.m = clamp(s.m + (inn.side === 0 ? -0.3 : 0.3), -1, 1);
    if (emit) {
      emit.incident('wicket', `WICKET — ${line(rng, T.wkt[how], { b: name, r: b.r, bw: inn.bowler }, s.said)}. ${team.short} ${inn.runs}/${inn.wkts}`, { side: (1 - inn.side) as Side, clock: clockLabel(s), major: true });
      emit.key();
    }
    if (inn.wkts < 10) inn.striker = inn.next++;
  } else {
    const r = Number(o);
    inn.runs += r;
    inn.curOver += r;
    b.r += r;
    if (r === 4) inn.fours++;
    if (r === 6) inn.sixes++;
    if (r >= 4) s.m = clamp(s.m + (inn.side === 0 ? 0.06 : -0.06), -1, 1);
    if (emit && r === 6 && chance(rng, 0.7)) emit.incident('six', line(rng, T.six, { b: name }, s.said), { side: inn.side, clock: clockLabel(s) });
    else if (emit && r === 4 && chance(rng, 0.15)) emit.incident('four', line(rng, T.four, { b: name }, s.said), { side: inn.side, clock: clockLabel(s) });
    if (emit && b.r >= 50 && b.r - r < 50) emit.incident('milestone', line(rng, T.fifty, { b: name, balls: b.b }, s.said), { side: inn.side, clock: clockLabel(s) });
    if (r % 2 === 1) rotate(inn);
  }
  s.m = clamp(s.m * 0.985 + 0.03 * normal(rng), -1, 1);

  const chaseDone = s.target !== null && s.inns.length === 2 && inn.runs >= s.target;
  if (inn.wkts >= 10 || inn.balls >= 120 || chaseDone) {
    inn.overRuns.push(inn.curOver);
    endInnings(s, emit, rng);
    return;
  }
  if (inn.balls % 6 === 0) {
    inn.overRuns.push(inn.curOver);
    inn.curOver = 0;
    rotate(inn);
    const bowlers = s.t[1 - inn.side].bowlers.filter((x) => x !== inn.bowler);
    inn.bowler = bowlers[Math.floor(rng.next() * bowlers.length)] ?? inn.bowler;
    s.wait += OVER_GAP;
    if (inn.overRuns.length % 2 === 0) {
      s.mh.push(s.m);
      if (s.mh.length > 40) s.mh.shift();
    }
  }
}

function stepC(s: CricketState, dt: number, rng: Rng, emit: Emit | null, live: boolean): void {
  if (s.phase === 'PRE') {
    s.batFirst = chance(rng, 0.5) ? 0 : 1;
    s.inns.push(newInnings(s, s.batFirst, rng));
    s.phase = 'LIVE';
    emit?.incident('info', `${s.t[s.batFirst === 0 ? 1 : 0].name} win the toss and bowl first`, { clock: '0.0 ov' });
  }
  s.acc += dt;
  let guard = 0;
  while (s.phase !== 'FT' && guard++ < 100000) {
    if (s.wait > 0) {
      const use = Math.min(s.wait, s.acc);
      s.wait -= use;
      s.acc -= use;
      if (s.wait > 0) return;
    }
    if (s.phase === 'BREAK') {
      const side = (1 - s.inns[0].side) as Side;
      s.inns.push(newInnings(s, side, rng));
      s.phase = 'LIVE';
      emit?.incident('period', `${s.t[side].name} begin the chase of ${s.target}`, { clock: '0.0 ov' });
      emit?.key();
      continue;
    }
    if (s.acc < BALL) return;
    s.acc -= BALL;
    ball(s, rng, emit, live);
  }
}

// ── markets ──
type CDef = MarketDef<CricketState, CricketFinal>;
const live = (s: CricketState) => s.phase !== 'FT';
const METHODS = ['Caught', 'Bowled', 'LBW', 'Run out', 'Stumped'];

function expected1st(s: CricketState): number {
  const avg = (s.t[0].bat + s.t[1].bat) / 2 - (s.t[0].bowl + s.t[1].bowl) / 2;
  return (s.ipl ? 178 : 165) + avg * 1.6;
}

function marketKeys(s: CricketState): string[] {
  if (s.phase === 'FT') return [];
  const keys = ['mw'];
  const c = Math.round(expected1st(s) / 5) * 5 + 0.5;
  if (s.inns.length <= 1) keys.push(`i1:${c - 15}`, `i1:${c}`, `i1:${c + 15}`);
  const sx = s.ipl ? 15.5 : 12.5;
  keys.push(`six:${sx - 3}`, `six:${sx}`, `six:${sx + 3}`);
  const inn = s.inns[s.inns.length - 1];
  if (inn && s.phase === 'LIVE') {
    const nextOver = inn.balls % 6 === 0 ? inn.balls / 6 + 1 : Math.floor(inn.balls / 6) + 2;
    if (nextOver <= 20) {
      const L = nextOver > 15 ? 10.5 : nextOver <= 6 ? 8.5 : 7.5;
      keys.push(`ov:${s.inns.length}:${nextOver}:${L}`);
    }
    if (inn.wkts < 10) keys.push(`mod:${s.inns.length}:${inn.wkts + 1}`);
  }
  for (const i of [0, 1] as Side[]) {
    const hasBatted = s.inns.some((x) => x.side === i);
    if (!hasBatted) keys.push(`tb:${i}`);
  }
  return keys;
}

function def(key: string, s: CricketState): CDef | null {
  const parts = key.split(':');
  const kind = parts[0];
  switch (kind) {
    case 'mw':
      return {
        key, name: 'Match winner (incl. super over)', group: 'Main', order: 1, margin: 0.045,
        sels: [{ code: '1', label: s.t[0].name }, { code: '2', label: s.t[1].name }], open: live,
        settle: (f) => ({ '1': f.winner === 0 ? 'WON' : 'LOST', '2': f.winner === 1 ? 'WON' : 'LOST' }),
      };
    case 'i1': {
      const L = Number(parts[1]);
      return {
        key, name: `1st innings runs ${fmtLine(L)}`, group: 'Runs', order: 10 + L / 1000, line: L, margin: 0.06,
        sels: [{ code: 'o', label: `Over ${fmtLine(L)}` }, { code: 'u', label: `Under ${fmtLine(L)}` }],
        open: (st) => st.inns.length <= 1 && st.phase !== 'BREAK' && st.phase !== 'FT',
        settle: (f) => ou((f.inns[0]?.runs ?? 0) > L),
        early: (st) => (st.inns[0] && st.inns[0].runs > L ? ou(true) : st.inns.length > 1 || st.phase === 'BREAK' ? ou((st.inns[0]?.runs ?? 0) > L) : null),
      };
    }
    case 'six': {
      const L = Number(parts[1]);
      const total = (st: CricketState) => st.inns.reduce((a, x) => a + x.sixes, 0);
      return {
        key, name: `Total match sixes ${fmtLine(L)}`, group: 'Runs', order: 20 + L / 1000, line: L, margin: 0.07,
        sels: [{ code: 'o', label: `Over ${fmtLine(L)}` }, { code: 'u', label: `Under ${fmtLine(L)}` }], open: live,
        settle: (f) => ou(f.sixes > L),
        early: (st) => (total(st) > L ? ou(true) : null),
      };
    }
    case 'ov': {
      const innNo = Number(parts[1]);
      const over = Number(parts[2]);
      const L = Number(parts[3]);
      const sels = [{ code: 'o', label: `Over ${fmtLine(L)}` }, { code: 'u', label: `Under ${fmtLine(L)}` }];
      const resolve = (overRuns: number[] | undefined, complete: boolean): Settled | null => {
        if (!overRuns) return null;
        if (overRuns.length >= over) return ou(overRuns[over - 1] > L);
        return complete ? { o: 'VOID', u: 'VOID' } : null;
      };
      return {
        key, name: `Innings ${innNo}, over ${over} runs ${fmtLine(L)}`, group: 'Over by over', order: 30, line: L, margin: 0.07, sels,
        open: (st) => {
          const inn = st.inns[innNo - 1];
          return st.phase === 'LIVE' && !!inn && st.inns.length === innNo && inn.balls <= (over - 1) * 6 && inn.overRuns.length < over;
        },
        settle: (f) => resolve(f.inns[innNo - 1]?.overRuns, true) ?? { o: 'VOID', u: 'VOID' },
        early: (st) => {
          const inn = st.inns[innNo - 1];
          if (!inn) return null;
          const done = st.inns.length > innNo || st.phase === 'FT' || st.phase === 'BREAK';
          return resolve(inn.overRuns, done);
        },
      };
    }
    case 'mod': {
      const innNo = Number(parts[1]);
      const wkt = Number(parts[2]);
      const sels = [...METHODS.map((m) => ({ code: m, label: m === 'Stumped' ? 'Stumped / other' : m })), { code: 'none', label: 'No further wicket' }];
      const resolve = (d: string[] | undefined, done: boolean): Settled | null => {
        const how = d?.[wkt - 1];
        if (!how && !done) return null;
        const r: Settled = {};
        for (const x of sels) r[x.code] = (how ? x.code === how : x.code === 'none') ? 'WON' : 'LOST';
        return r;
      };
      return {
        key, name: `Innings ${innNo}: wicket ${wkt} method`, group: 'Wickets', order: 40, margin: 0.12, sels,
        open: (st) => st.phase === 'LIVE' && st.inns.length === innNo && st.inns[innNo - 1].wkts === wkt - 1,
        settle: (f) => resolve(f.inns[innNo - 1]?.dismissals, true)!,
        early: (st) => {
          const inn = st.inns[innNo - 1];
          if (!inn) return null;
          return resolve(inn.dismissals, st.inns.length > innNo || st.phase !== 'LIVE');
        },
      };
    }
    case 'tb': {
      const side = Number(parts[1]) as Side;
      const team = s.t[side];
      const cands = team.players.slice(0, 7);
      const sels = cands.map((p) => ({ code: p.name, label: p.name }));
      return {
        key, name: `Top batter: ${team.short}`, group: 'Players', order: 50 + side, margin: 0.15, sels,
        open: (st) => live(st) && !st.inns.some((x) => x.side === side),
        settle: (f) => {
          // ties broken by fewer balls faced, then batting order
          let best = '';
          let br = -1;
          let bb = Infinity;
          for (const p of team.players) {
            const b = f.bat[`${side}:${p.name}`];
            if (!b) continue;
            if (b.r > br || (b.r === br && b.b < bb)) { best = p.name; br = b.r; bb = b.b; }
          }
          const r: Settled = {};
          for (const x of sels) r[x.code] = x.code === best ? 'WON' : 'LOST';
          return r;
        },
      };
    }
  }
  return null;
}

export const cricket: SportModule<CricketState, CricketFinal> = {
  sport: 'cricket',
  nominal: 2 * 124 * BALL + 40 * OVER_GAP + INNINGS_BREAK,
  kickoff(s, rng, emit) {
    s.latent = { form: [normal(rng, 0, 0.12), normal(rng, 0, 0.12)], pitch: normal(rng, 0, 0.1) };
    emit.incident('start', `${s.t[0].name} v ${s.t[1].name}. The toss is next`, { clock: 'Toss' });
  },
  clone(s) {
    const bat: Record<string, Bat> = {};
    for (const k in s.bat) bat[k] = { ...s.bat[k] };
    return {
      ...s, inns: s.inns.map((x) => ({ ...x, overRuns: [...x.overRuns], dismissals: [...x.dismissals] })), bat, mh: [...s.mh], said: [],
      latent: { form: [s.latent.form[0], s.latent.form[1]], pitch: s.latent.pitch },
    };
  },
  neutral(s) {
    const c = cricket.clone(s);
    c.latent = { form: [0, 0], pitch: 0 };
    return c;
  },
  step(s, dt, rng, emit) {
    stepC(s, dt, rng, emit, emit !== null);
  },
  finished: (s) => s.phase === 'FT',
  final: (s) => ({
    winner: s.winner,
    inns: s.inns.map((x) => ({ side: x.side, runs: x.runs, wkts: x.wkts, balls: x.balls, sixes: x.sixes, overRuns: [...x.overRuns], dismissals: [...x.dismissals] })),
    bat: s.bat,
    sixes: s.inns.reduce((a, x) => a + x.sixes, 0),
  }),
  view(s): View {
    const byside = (i: Side) => s.inns.find((x) => x.side === i);
    const txt = (i: Side) => {
      const x = byside(i);
      return x ? `${x.runs}/${x.wkts}` : 'Yet to bat';
    };
    const lines = s.inns.map((x) => ({ label: `${s.t[x.side].short} overs`, home: x.side === 0 ? overStr(x.balls) : '', away: x.side === 1 ? overStr(x.balls) : '' }));
    const inn = s.inns[s.inns.length - 1];
    const rr = (x?: Innings) => (x && x.balls ? (x.runs / x.balls) * 6 : 0);
    const stats = [
      { key: 'rr', label: 'Run rate', home: rr(byside(0)), away: rr(byside(1)), fmt: 'dec2' as const },
      { key: 'fours', label: 'Fours', home: byside(0)?.fours ?? 0, away: byside(1)?.fours ?? 0 },
      { key: 'sixes', label: 'Sixes', home: byside(0)?.sixes ?? 0, away: byside(1)?.sixes ?? 0 },
      { key: 'extras', label: 'Extras', home: byside(0)?.extras ?? 0, away: byside(1)?.extras ?? 0 },
    ];
    if (s.target !== null && inn && s.inns.length === 2 && s.phase === 'LIVE') {
      const need = s.target - inn.runs;
      const left = 120 - inn.balls;
      lines.push({ label: 'Need', home: inn.side === 0 ? `${need} off ${left}` : '', away: inn.side === 1 ? `${need} off ${left}` : '' });
    }
    if (inn && s.phase === 'LIVE') {
      const team = s.t[inn.side];
      const st = team.players[inn.striker];
      const ns = team.players[inn.non];
      if (st) {
        const b = s.bat[`${inn.side}:${st.name}`];
        lines.push({ label: 'Striker', home: inn.side === 0 ? `${st.name} ${b.r}*` : '', away: inn.side === 1 ? `${st.name} ${b.r}*` : '' });
      }
      if (ns) {
        const b = s.bat[`${inn.side}:${ns.name}`];
        lines.push({ label: 'Non-striker', home: inn.side === 0 ? `${ns.name} ${b.r}` : '', away: inn.side === 1 ? `${ns.name} ${b.r}` : '' });
      }
    }
    const totalBalls = s.inns.reduce((a, x) => a + x.balls, 0);
    return {
      clock: clockLabel(s),
      period: s.phase === 'PRE' ? 'Pre-match' : s.phase === 'FT' ? s.note : s.phase === 'BREAK' ? 'Innings break' : `${s.t[inn.side].short} batting`,
      score: [byside(0)?.runs ?? 0, byside(1)?.runs ?? 0],
      scoreText: [txt(0), txt(1)],
      lines,
      stats,
      momentum: s.m,
      pressure: clamp(0.3 + Math.abs(s.m) * 0.6, 0, 1),
      serving: inn && s.phase === 'LIVE' ? inn.side : undefined,
      progress: s.phase === 'FT' ? 1 : clamp(totalBalls / 240, 0, 0.98),
    };
  },
  marketKeys,
  def,
  winner: (f) => f.winner,
  history: (s) => [...s.mh, s.m],
};

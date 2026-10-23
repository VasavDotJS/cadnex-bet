/**
 * Football: shots arrive as a time-varying Poisson process; each shot carries an xG drawn
 * from a realistic mixture and becomes a goal with that probability. Rates respond to
 * ratings, home advantage, hidden form, momentum, game state and red cards.
 * Pricing is analytic (Poisson grid over the remaining match), using only public information.
 */
import type { FootballTeam } from '../../data/types';
import type { LegResult } from '../../lib/money';
import { Rng, chance, clamp, normal, poisson, weighted } from '../../lib/rng';
import {
  Emit, MarketDef, Settled, SportModule, Tally, View, addResult, asianResult, emptyTally, fmtLine, line, ou, poissonCdf, poissonPmf, sideWin,
} from '../sport';
import type { Side } from '../types';

interface FTeam {
  name: string;
  short: string;
  attack: number;
  defence: number;
  midfield: number;
  home: number;
  gk: string;
  players: { name: string; w: number }[];
}

interface Goal { side: Side; min: number; label: string; player: string | null; pen?: boolean; og?: boolean }

export interface FootballState {
  t: [FTeam, FTeam];
  neutralVenue: boolean;
  phase: 'PRE' | 'H1' | 'HT' | 'H2' | 'FT';
  sec: number; // seconds into the current phase
  acc: number;
  add1: number | null;
  add2: number | null;
  score: [number, number];
  ht: [number, number] | null;
  goals: Goal[];
  st: {
    poss: [number, number]; shots: [number, number]; sot: [number, number]; xg: [number, number];
    corners: [number, number]; fouls: [number, number]; yellow: [number, number]; red: [number, number];
    offsides: [number, number]; saves: [number, number];
  };
  booked: Record<string, number>;
  m: number; // momentum, + favours home
  mh: number[];
  mAcc: number;
  mCount: number;
  recent: number; // decaying recent-attack indicator
  latent: { form: [number, number]; tempo: number; ref: number; fatigue: [number, number] };
  said: string[];
}

export interface FootballFinal {
  score: [number, number];
  ht: [number, number];
  corners: [number, number];
  cards: [number, number];
  goals: Goal[];
}

const UNIT = 10; // seconds per simulation unit
const HT_BREAK = 180;
const XG_PER_SHOT = 0.105;

export function createFootball(home: FootballTeam, away: FootballTeam, neutralVenue = false): FootballState {
  const lite = (x: FootballTeam): FTeam => ({
    name: x.name, short: x.short, attack: x.attack, defence: x.defence, midfield: x.midfield, home: x.home, gk: x.gk,
    players: x.players.map((p) => ({ name: p.name, w: p.w })),
  });
  return {
    t: [lite(home), lite(away)],
    neutralVenue,
    phase: 'PRE', sec: 0, acc: 0, add1: null, add2: null,
    score: [0, 0], ht: null, goals: [],
    st: {
      poss: [0, 0], shots: [0, 0], sot: [0, 0], xg: [0, 0], corners: [0, 0], fouls: [0, 0], yellow: [0, 0], red: [0, 0], offsides: [0, 0], saves: [0, 0],
    },
    booked: {},
    m: 0, mh: [], mAcc: 0, mCount: 0, recent: 0,
    latent: { form: [0, 0], tempo: 0, ref: 1, fatigue: [0, 0] },
    said: [],
  };
}

// ── rates ──

/** Expected goals over 90 minutes for side i, before in-match modifiers. */
function baseLambda(s: FootballState, i: Side): number {
  const me = s.t[i];
  const op = s.t[1 - i];
  const homeBoost = s.neutralVenue ? 1 : i === 0 ? 1 + 0.08 + me.home * 0.12 : 0.94;
  const base = 1.0 * Math.exp((me.attack - op.defence) / 36 + (me.midfield - op.midfield) / 90);
  return base * homeBoost;
}

function minuteOf(s: FootballState): number {
  if (s.phase === 'H1') return s.sec / 60;
  if (s.phase === 'H2') return 45 + s.sec / 60;
  if (s.phase === 'HT') return 45;
  return s.phase === 'FT' ? 90 : 0;
}

function goalRatePerMin(s: FootballState, i: Side, minute: number, score: [number, number], useLatent: boolean, mom: number): number {
  const j = (1 - i) as Side;
  let r = baseLambda(s, i) / 90;
  r *= 0.84 + 0.32 * Math.min(1, minute / 90);
  const diff = score[i] - score[j];
  if (diff > 0) r *= 0.9 - 0.05 * Math.min(diff, 2);
  else if (diff < 0) r *= 1.04 + 0.28 * clamp((minute - 55) / 35, 0, 1) * Math.min(-diff, 2) * 0.6;
  r *= Math.pow(0.68, s.st.red[i]) * Math.pow(1.18, s.st.red[j]);
  r *= Math.exp(0.32 * mom * (i === 0 ? 1 : -1));
  if (useLatent) {
    r *= Math.exp(s.latent.form[i] + s.latent.tempo);
    if (minute > 65) r *= 1 + s.latent.fatigue[j] * ((minute - 65) / 25) * 0.25;
  }
  return r;
}

// ── commentary ──

const T = {
  goal: [
    "{player} finishes low into the far corner",
    "{player} rises highest and powers a header past {gk}",
    "{player} curls it beyond {gk} from the edge of the box",
    "{player} taps in at the back post after a sweeping move",
    "{player} smashes it into the roof of the net",
    "{player} keeps his composure one-on-one and slots it home",
    "{player} pounces on the rebound to score",
    "{player} drills a first-time shot through a crowded box",
    "{player} chips {gk} with a lovely dinked finish",
    "{player} turns sharply and fires into the bottom corner",
  ],
  pen: ["{player} sends {gk} the wrong way from the spot", "{player} rolls the penalty into the corner, cool as you like", "{player} blasts the penalty down the middle"],
  penMiss: ["{gk} guesses right and saves {player}'s penalty", "{player} drags the penalty wide", "{player} hits the post from the spot"],
  penAward: ["Penalty to {team}! The referee points to the spot", "{team} win a penalty after a clumsy challenge in the box"],
  var: ["VAR rules out the {team} goal for offside", "Goal disallowed after a VAR review: handball in the build-up", "The {team} celebrations are cut short. VAR spots a foul earlier in the move"],
  big: ["Huge chance! {player} somehow puts it over the bar", "{gk} with a superb reflex save to deny {player}", "{player} is clean through but drags it wide", "{player} hits the woodwork!"],
  yellow: ["{player} is booked for a late challenge", "Yellow card for {player} after pulling back a runner", "{player} goes into the book for dissent", "{player} cautioned for a cynical foul"],
  second: ["Second yellow for {player}! {team} are down to ten", "{player} sees a second yellow and is sent off"],
  red: ["Straight red for {player}! A dangerous lunge and {team} are down to ten", "{player} is sent off after a VAR review of a reckless tackle"],
};

const crecent = (s: FootballState) => s.said;

function clockLabel(s: FootballState): string {
  if (s.phase === 'PRE') return "0'";
  if (s.phase === 'HT') return 'HT';
  if (s.phase === 'FT') return 'FT';
  const base = s.phase === 'H1' ? 0 : 45;
  const m = Math.floor(s.sec / 60) + 1;
  if (m > 45) return `${base + 45}+${m - 45}'`;
  return `${base + m}'`;
}

function pickScorer(rng: Rng, team: FTeam): string {
  return weighted(rng, team.players, (p) => p.w).name;
}

// ── simulation step ──

function unit(s: FootballState, rng: Rng, emit: Emit | null, live: boolean): void {
  const minute = minuteOf(s);
  const du = UNIT / 60;

  // momentum: Ornstein–Uhlenbeck drift with shocks
  s.m = clamp(s.m - 0.09 * s.m * du + 0.13 * Math.sqrt(du) * normal(rng), -1, 1);
  s.recent *= 0.93;

  // possession share
  const lead = s.score[0] - s.score[1];
  let poss = 0.5 + (s.t[0].midfield - s.t[1].midfield) / 160 + s.m * 0.06 - clamp(lead, -2, 2) * 0.025;
  poss += (s.st.red[1] - s.st.red[0]) * 0.05;
  poss = clamp(poss, 0.28, 0.72);
  s.st.poss[0] += poss;
  s.st.poss[1] += 1 - poss;

  const tempo = live ? Math.exp(s.latent.tempo) : 1;
  const refK = live ? s.latent.ref : 1;

  for (const i of [0, 1] as Side[]) {
    const j = (1 - i) as Side;
    const gRate = goalRatePerMin(s, i, minute, s.score, live, s.m);
    const shotRate = gRate / XG_PER_SHOT;
    // open-play shot
    if (chance(rng, shotRate * du)) shot(s, rng, emit, i, false);
    // penalty
    if (chance(rng, 0.0016 * refK * (1 + Math.max(0, s.m * (i === 0 ? 1 : -1))) * du)) {
      s.st.fouls[j]++;
      const team = s.t[i];
      if (emit) emit.incident('penalty', line(rng, T.penAward, { team: team.name }, crecent(s)), { side: i, clock: clockLabel(s) });
      emit?.key();
      shot(s, rng, emit, i, true);
    }
    // corners
    if (chance(rng, (5.0 / 90) * (gRate / (baseLambda(s, i) / 90)) * du)) s.st.corners[i]++;
    // fouls and cards
    if (chance(rng, (11.5 / 90) * tempo * du)) {
      s.st.fouls[j]++;
      if (chance(rng, 0.128 * refK * (minute > 70 ? 1.25 : 1))) card(s, rng, emit, j, false);
      else if (chance(rng, 0.0035 * refK)) card(s, rng, emit, j, true);
    }
    if (chance(rng, (2.1 / 90) * du)) s.st.offsides[i]++;
  }

  // momentum history every 3 minutes
  s.mAcc += s.m;
  s.mCount++;
  if (s.mCount >= 18) {
    s.mh.push(s.mAcc / s.mCount);
    if (s.mh.length > 40) s.mh.shift();
    s.mAcc = 0;
    s.mCount = 0;
  }
}

function shot(s: FootballState, rng: Rng, emit: Emit | null, i: Side, pen: boolean): void {
  const team = s.t[i];
  const opp = s.t[1 - i];
  s.st.shots[i]++;
  s.recent += 1;
  let xg: number;
  if (pen) xg = 0.78;
  else {
    const r = rng.next();
    xg = r < 0.7 ? 0.02 + rng.next() * 0.06 : r < 0.92 ? 0.08 + rng.next() * 0.17 : 0.3 + rng.next() * 0.32;
  }
  s.st.xg[i] += xg;
  const scored = chance(rng, xg);
  const player = pen ? weighted(rng, team.players.slice(0, 2), (p) => p.w).name : pickScorer(rng, team);
  if (scored) {
    s.st.sot[i]++;
    // VAR check on open play goals
    if (!pen && chance(rng, 0.035)) {
      if (emit) emit.incident('nogoal', line(rng, T.var, { team: team.name }, crecent(s)), { side: i, clock: clockLabel(s) });
      emit?.key();
      s.st.offsides[i]++;
      return;
    }
    s.score[i]++;
    const min = Math.min(Math.ceil(minuteOf(s)), s.phase === 'H1' ? 45 : 90) || 1;
    s.goals.push({ side: i, min, label: clockLabel(s), player, pen });
    s.m = clamp(s.m + (i === 0 ? 0.22 : -0.22), -1, 1);
    if (emit) {
      const txt = line(rng, pen ? T.pen : T.goal, { player, gk: opp.gk }, crecent(s));
      emit.incident('goal', `GOAL — ${txt}. ${s.t[0].short} ${s.score[0]}–${s.score[1]} ${s.t[1].short}`, { side: i, major: true, clock: clockLabel(s) });
      emit.key();
    }
    return;
  }
  const onTarget = pen ? chance(rng, 0.55) : chance(rng, 0.31);
  if (onTarget) {
    s.st.sot[i]++;
    s.st.saves[1 - i]++;
  }
  if (emit && (xg >= 0.3 || pen)) {
    emit.incident(pen ? 'save' : 'chance', line(rng, pen ? T.penMiss : T.big, { player, gk: opp.gk }, crecent(s)), { side: i, clock: clockLabel(s) });
    if (pen) emit.key();
  }
}

function card(s: FootballState, rng: Rng, emit: Emit | null, side: Side, straight: boolean): void {
  const team = s.t[side];
  const player = weighted(rng, team.players, (p) => 10 - Math.min(9, p.w) + 2).name;
  const k = `${side}:${player}`;
  if (straight) {
    if ((s.booked[k] ?? 0) >= 2) return;
    s.booked[k] = 2;
    s.st.red[side]++;
    if (emit) emit.incident('red', line(rng, T.red, { player, team: team.name }, crecent(s)), { side, clock: clockLabel(s), major: true });
    emit?.key();
    return;
  }
  const n = (s.booked[k] ?? 0) + 1;
  if (n > 2) return;
  s.booked[k] = n;
  s.st.yellow[side]++;
  if (n === 2) {
    s.st.red[side]++;
    if (emit) emit.incident('red', line(rng, T.second, { player, team: team.name }, crecent(s)), { side, clock: clockLabel(s), major: true });
    emit?.key();
  } else if (emit) emit.incident('yellow', line(rng, T.yellow, { player }, crecent(s)), { side, clock: clockLabel(s) });
}

function step(s: FootballState, dt: number, rng: Rng, emit: Emit | null, live: boolean): void {
  s.acc += dt;
  while (s.acc >= UNIT && s.phase !== 'FT') {
    s.acc -= UNIT;
    if (s.phase === 'PRE') { s.phase = 'H1'; s.sec = 0; continue; }
    if (s.phase === 'HT') {
      s.sec += UNIT;
      if (s.sec >= HT_BREAK) {
        s.phase = 'H2';
        s.sec = 0;
        emit?.incident('period', 'Second half under way', { clock: "46'" });
        emit?.key();
      }
      continue;
    }
    unit(s, rng, emit, live);
    s.sec += UNIT;
    const halfLen = 45 * 60;
    if (s.phase === 'H1') {
      if (s.add1 === null && s.sec >= halfLen - 60) {
        s.add1 = clamp(1 + poisson(rng, 1.1) + Math.floor(s.goals.length / 2), 1, 6);
        emit?.incident('info', `${s.add1} minute${s.add1 > 1 ? 's' : ''} of added time`, { clock: "45'" });
      }
      if (s.add1 !== null && s.sec >= halfLen + s.add1 * 60) {
        s.phase = 'HT';
        s.sec = 0;
        s.ht = [s.score[0], s.score[1]];
        emit?.incident('period', `Half-time: ${s.t[0].short} ${s.score[0]}–${s.score[1]} ${s.t[1].short}`, { clock: 'HT' });
        emit?.key();
      }
    } else if (s.phase === 'H2') {
      if (s.add2 === null && s.sec >= halfLen - 60) {
        const extra = s.st.red[0] + s.st.red[1] + Math.floor((s.st.yellow[0] + s.st.yellow[1]) / 4);
        s.add2 = clamp(2 + poisson(rng, 2.2) + extra, 2, 10);
        emit?.incident('info', `${s.add2} minutes of added time`, { clock: "90'" });
      }
      if (s.add2 !== null && s.sec >= halfLen + s.add2 * 60) {
        s.phase = 'FT';
        emit?.incident('end', `Full-time: ${s.t[0].name} ${s.score[0]}–${s.score[1]} ${s.t[1].name}`, { clock: 'FT', major: true });
      }
    }
  }
}

// ── markets ──

type FDef = MarketDef<FootballState, FootballFinal>;
const live = (s: FootballState) => s.phase !== 'FT';
const firstHalfOpen = (s: FootballState) => s.phase === 'PRE' || s.phase === 'H1';
const totalGoals = (f: { score: [number, number] }) => f.score[0] + f.score[1];
const winnerOf = (sc: [number, number]): Side | null => (sc[0] > sc[1] ? 0 : sc[1] > sc[0] ? 1 : null);

const CS_LIST: [number, number][] = [];
for (let h = 0; h <= 4; h++) for (let a = 0; a <= 4; a++) CS_LIST.push([h, a]);

function def(key: string, s: FootballState): FDef | null {
  const [H, A] = [s.t[0].short, s.t[1].short];
  const [kind, arg] = key.split(':');
  const L = arg !== undefined ? Number(arg) : undefined;
  switch (kind) {
    case '1x2':
      return {
        key, name: 'Match result', group: 'Main', order: 1, margin: 0.05,
        sels: [{ code: '1', label: s.t[0].name }, { code: 'X', label: 'Draw' }, { code: '2', label: s.t[1].name }],
        open: live, settle: (f) => sideWin(winnerOf(f.score), ['1', '2', 'X']),
      };
    case 'dc':
      return {
        key, name: 'Double chance', group: 'Main', order: 2, margin: 0.05,
        sels: [{ code: '1X', label: `${H} or draw` }, { code: '12', label: `${H} or ${A}` }, { code: 'X2', label: `Draw or ${A}` }],
        open: live,
        settle: (f) => {
          const w = winnerOf(f.score);
          return { '1X': w !== 1 ? 'WON' : 'LOST', '12': w !== null ? 'WON' : 'LOST', X2: w !== 0 ? 'WON' : 'LOST' };
        },
      };
    case 'dnb':
      return {
        key, name: 'Draw no bet', group: 'Main', order: 3, margin: 0.05,
        sels: [{ code: '1', label: s.t[0].name }, { code: '2', label: s.t[1].name }],
        open: live,
        settle: (f) => {
          const w = winnerOf(f.score);
          if (w === null) return { '1': 'VOID', '2': 'VOID' };
          return sideWin(w, ['1', '2']);
        },
      };
    case 'ou':
      return {
        key, name: `Total goals ${fmtLine(L!)}`, group: 'Goals', order: 10 + L!, line: L, margin: 0.06,
        sels: [{ code: 'o', label: `Over ${fmtLine(L!)}` }, { code: 'u', label: `Under ${fmtLine(L!)}` }],
        open: live,
        settle: (f) => ou(totalGoals(f) > L!),
        early: (st) => (totalGoals(st) > L! ? ou(true) : null),
      };
    case 'ah':
      return {
        key, name: `Asian handicap ${H} ${fmtLine(L!, true)}`, group: 'Handicap', order: 30 + L!, line: L, margin: 0.05,
        sels: [{ code: 'h', label: `${H} ${fmtLine(L!, true)}` }, { code: 'a', label: `${A} ${fmtLine(-L!, true)}` }],
        open: live,
        settle: (f) => ({ h: asianResult(f.score[0] - f.score[1], L!), a: asianResult(f.score[1] - f.score[0], -L!) }),
      };
    case 'eh':
      return {
        key, name: `European handicap ${H} ${fmtLine(L!, true).replace('.0', '')}`, group: 'Handicap', order: 50 + L!, line: L, margin: 0.07,
        sels: [{ code: '1', label: `${H} (${L! > 0 ? '+' : ''}${L})` }, { code: 'X', label: `Draw (${L! > 0 ? '+' : ''}${L})` }, { code: '2', label: `${A} (${-L! > 0 ? '+' : ''}${-L!})` }],
        open: live,
        settle: (f) => {
          const d = f.score[0] + L! - f.score[1];
          return { '1': d > 0 ? 'WON' : 'LOST', X: d === 0 ? 'WON' : 'LOST', '2': d < 0 ? 'WON' : 'LOST' };
        },
      };
    case 'btts':
      return {
        key, name: 'Both teams to score', group: 'Goals', order: 5, margin: 0.07,
        sels: [{ code: 'y', label: 'Yes' }, { code: 'n', label: 'No' }],
        open: live,
        settle: (f) => (f.score[0] > 0 && f.score[1] > 0 ? { y: 'WON', n: 'LOST' } : { y: 'LOST', n: 'WON' }),
        early: (st) => (st.score[0] > 0 && st.score[1] > 0 ? { y: 'WON', n: 'LOST' } : null),
      };
    case 'cs':
      return {
        key, name: 'Correct score', group: 'Specials', order: 60, margin: 0.18,
        sels: [
          ...CS_LIST.map(([h, a]) => ({ code: `${h}-${a}`, label: `${h}–${a}` })),
          { code: 'oh', label: `Other ${H} win` }, { code: 'od', label: 'Other draw' }, { code: 'oa', label: `Other ${A} win` },
        ],
        open: live,
        settle: (f) => {
          const r: Settled = {};
          const [h, a] = f.score;
          const listed = h <= 4 && a <= 4;
          for (const [x, y] of CS_LIST) r[`${x}-${y}`] = x === h && y === a ? 'WON' : 'LOST';
          r.oh = !listed && h > a ? 'WON' : 'LOST';
          r.od = !listed && h === a ? 'WON' : 'LOST';
          r.oa = !listed && a > h ? 'WON' : 'LOST';
          return r;
        },
      };
    case 'htft': {
      const lab = (c: string) => (c === '1' ? H : c === '2' ? A : 'Draw');
      const codes = ['1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2'];
      return {
        key, name: 'Half-time / full-time', group: 'Halves', order: 70, margin: 0.15,
        sels: codes.map((c) => ({ code: c, label: `${lab(c[0])} / ${lab(c[2])}` })),
        open: firstHalfOpen,
        settle: (f) => {
          const c = (sc: [number, number]) => (sc[0] > sc[1] ? '1' : sc[1] > sc[0] ? '2' : 'X');
          const win = `${c(f.ht)}/${c(f.score)}`;
          const r: Settled = {};
          for (const k of codes) r[k] = k === win ? 'WON' : 'LOST';
          return r;
        },
      };
    }
    case 'h1x2':
      return {
        key, name: '1st half result', group: 'Halves', order: 71, margin: 0.06,
        sels: [{ code: '1', label: s.t[0].name }, { code: 'X', label: 'Draw' }, { code: '2', label: s.t[1].name }],
        open: firstHalfOpen,
        settle: (f) => sideWin(winnerOf(f.ht), ['1', '2', 'X']),
        early: (st) => (st.ht ? sideWin(winnerOf(st.ht), ['1', '2', 'X']) : null),
      };
    case 'hou':
      return {
        key, name: `1st half goals ${fmtLine(L!)}`, group: 'Halves', order: 72 + L!, line: L, margin: 0.07,
        sels: [{ code: 'o', label: `Over ${fmtLine(L!)}` }, { code: 'u', label: `Under ${fmtLine(L!)}` }],
        open: firstHalfOpen,
        settle: (f) => ou(f.ht[0] + f.ht[1] > L!),
        early: (st) => {
          if (st.ht) return ou(st.ht[0] + st.ht[1] > L!);
          return st.score[0] + st.score[1] > L! ? ou(true) : null;
        },
      };
    case 'cor':
      return {
        key, name: `Total corners ${fmtLine(L!)}`, group: 'Corners & cards', order: 80 + L!, line: L, margin: 0.08,
        sels: [{ code: 'o', label: `Over ${fmtLine(L!)}` }, { code: 'u', label: `Under ${fmtLine(L!)}` }],
        open: live,
        settle: (f) => ou(f.corners[0] + f.corners[1] > L!),
        early: (st) => (st.st.corners[0] + st.st.corners[1] > L! ? ou(true) : null),
      };
    case 'crd':
      return {
        key, name: `Total cards ${fmtLine(L!)}`, group: 'Corners & cards', order: 90 + L!, line: L, margin: 0.08,
        sels: [{ code: 'o', label: `Over ${fmtLine(L!)}` }, { code: 'u', label: `Under ${fmtLine(L!)}` }],
        open: live,
        settle: (f) => ou(f.cards[0] + f.cards[1] > L!),
        early: (st) => (cards(st, 0) + cards(st, 1) > L! ? ou(true) : null),
      };
    case 'ng': {
      const n = L!;
      return {
        key, name: `Goal ${n}: next to score`, group: 'Main', order: 4, line: n, margin: 0.06,
        sels: [{ code: '1', label: s.t[0].name }, { code: 'none', label: 'No goal' }, { code: '2', label: s.t[1].name }],
        open: (st) => live(st) && st.goals.length === n - 1,
        settle: (f) => {
          const g = f.goals[n - 1];
          return { '1': g?.side === 0 ? 'WON' : 'LOST', none: !g ? 'WON' : 'LOST', '2': g?.side === 1 ? 'WON' : 'LOST' };
        },
        early: (st) => {
          const g = st.goals[n - 1];
          if (!g) return null;
          return { '1': g.side === 0 ? 'WON' : 'LOST', none: 'LOST', '2': g.side === 1 ? 'WON' : 'LOST' };
        },
      };
    }
    case 'ags':
    case 'fgs': {
      const first = kind === 'fgs';
      const sels = scorerPool(s).map((p) => ({ code: `${p.side}:${p.name}`, label: `${p.name} · ${s.t[p.side].short}` }));
      if (first) sels.push({ code: 'none', label: 'No goalscorer' });
      return {
        key, name: first ? 'First goalscorer' : 'Anytime goalscorer', group: 'Players', order: first ? 101 : 100, margin: 0.16,
        sels,
        open: (st) => live(st) && (!first || st.goals.length === 0),
        settle: (f) => {
          const r: Settled = {};
          for (const sel of sels) {
            if (sel.code === 'none') { r.none = f.goals.length === 0 ? 'WON' : 'LOST'; continue; }
            const hit = first
              ? f.goals[0] && `${f.goals[0].side}:${f.goals[0].player}` === sel.code
              : f.goals.some((g) => `${g.side}:${g.player}` === sel.code);
            r[sel.code] = hit ? 'WON' : 'LOST';
          }
          return r;
        },
        early: first
          ? (st) => {
              if (!st.goals.length) return null;
              const r: Settled = {};
              for (const sel of sels) r[sel.code] = sel.code !== 'none' && `${st.goals[0].side}:${st.goals[0].player}` === sel.code ? 'WON' : 'LOST';
              return r;
            }
          : undefined,
      };
    }
    case 'wm': {
      const codes = ['h1', 'h2', 'h3', 'd', 'a1', 'a2', 'a3'];
      const labels = [`${H} by 1`, `${H} by 2`, `${H} by 3+`, 'Draw', `${A} by 1`, `${A} by 2`, `${A} by 3+`];
      return {
        key, name: 'Winning margin', group: 'Specials', order: 61, margin: 0.12,
        sels: codes.map((c, i) => ({ code: c, label: labels[i] })),
        open: live,
        settle: (f) => {
          const d = f.score[0] - f.score[1];
          const win = d === 0 ? 'd' : `${d > 0 ? 'h' : 'a'}${Math.min(3, Math.abs(d))}`;
          const r: Settled = {};
          for (const c of codes) r[c] = c === win ? 'WON' : 'LOST';
          return r;
        },
      };
    }
    case 'oe':
      return {
        key, name: 'Total goals odd/even', group: 'Goals', order: 20, margin: 0.05,
        sels: [{ code: 'odd', label: 'Odd' }, { code: 'even', label: 'Even' }],
        open: live,
        settle: (f) => (totalGoals(f) % 2 === 1 ? { odd: 'WON', even: 'LOST' } : { odd: 'LOST', even: 'WON' }),
      };
  }
  return null;
}

function cards(s: FootballState, i: Side): number {
  return s.st.yellow[i] + s.st.red[i];
}

function scorerPool(s: FootballState): { side: Side; name: string; w: number }[] {
  const out: { side: Side; name: string; w: number }[] = [];
  for (const i of [0, 1] as Side[]) {
    const ps = [...s.t[i].players].sort((a, b) => b.w - a.w).slice(0, 5);
    for (const p of ps) out.push({ side: i, name: p.name, w: p.w });
  }
  return out;
}

function marketKeys(s: FootballState): string[] {
  if (s.phase === 'FT') return [];
  const keys = ['1x2', 'dc', 'dnb', 'btts', 'cs', 'wm', 'oe', 'ags'];
  keys.push(`ng:${s.goals.length + 1}`);
  if (s.goals.length === 0) keys.push('fgs');
  const total = s.score[0] + s.score[1];
  for (let l = 0.5; l <= Math.max(5.5, total + 2.5); l += 1) if (l > total) keys.push(`ou:${l}`);
  const diff = s.score[0] - s.score[1];
  // AH lines centred near the expected final margin
  const expDiff = diff + (remainingLambda(s, 0).total - remainingLambda(s, 1).total);
  const centre = Math.round(-expDiff * 4) / 4;
  for (let d = -0.5; d <= 0.5; d += 0.25) keys.push(`ah:${(centre + d).toFixed(2).replace(/\.?0+$/, '') || '0'}`);
  keys.push('eh:-1', 'eh:1');
  if (firstHalfOpen(s)) {
    keys.push('htft', 'h1x2', 'hou:0.5', 'hou:1.5');
  }
  const cor = s.st.corners[0] + s.st.corners[1];
  for (const l of [7.5, 8.5, 9.5, 10.5, 11.5]) if (l > cor) keys.push(`cor:${l}`);
  const cds = cards(s, 0) + cards(s, 1);
  for (const l of [2.5, 3.5, 4.5, 5.5]) if (l > cds) keys.push(`crd:${l}`);
  return keys;
}

// ── analytic pricing ──

interface Remaining { h1: number; h2: number; total: number }

/** Expected remaining goals for side i, split by half, from public information only. */
function remainingLambda(s: FootballState, i: Side): Remaining {
  const minute = minuteOf(s);
  const add1 = s.add1 ?? 2.2;
  const add2 = s.add2 ?? 4.6;
  let h1 = 0;
  let h2 = 0;
  const mom = s.m * 0.5; // the market sees momentum, partially
  const decay = (k: number) => Math.exp(-k / 12); // momentum fades over ~12 minutes
  if (s.phase === 'PRE' || s.phase === 'H1') {
    const end = 45 + add1;
    for (let m = minute; m < end; m += 1) h1 += goalRatePerMin(s, i, Math.min(m, 45), s.score, false, mom * decay(m - minute)) * Math.min(1, end - m);
  }
  if (s.phase !== 'FT') {
    const start = s.phase === 'H2' ? minute : 45;
    const end = 90 + add2;
    for (let m = start; m < end; m += 1) h2 += goalRatePerMin(s, i, Math.min(m, 90), s.score, false, mom * decay(m - minute)) * Math.min(1, end - m);
  }
  return { h1, h2, total: h1 + h2 };
}

function scorePrice(s: FootballState, defs: FDef[]): Map<string, Record<string, Tally>> {
  const out = new Map<string, Record<string, Tally>>();
  const rh = remainingLambda(s, 0);
  const ra = remainingLambda(s, 1);
  const MAX = 7;
  const ph1 = poissonPmf(rh.h1, MAX), pa1 = poissonPmf(ra.h1, MAX);
  const ph2 = poissonPmf(rh.h2, MAX), pa2 = poissonPmf(ra.h2, MAX);

  const gridDefs: FDef[] = [];
  const special: FDef[] = [];
  for (const d of defs) {
    const k = d.key.split(':')[0];
    if (['cor', 'crd', 'ags', 'fgs', 'ng'].includes(k)) special.push(d);
    else gridDefs.push(d);
  }
  const tallies = new Map<string, Record<string, Tally>>();
  for (const d of gridDefs) {
    const t: Record<string, Tally> = {};
    for (const sel of d.sels) t[sel.code] = emptyTally();
    tallies.set(d.key, t);
  }
  const inFirst = s.phase === 'PRE' || s.phase === 'H1';
  const fixedHt = s.ht ?? [s.score[0], s.score[1]];
  const fin: FootballFinal = { score: [0, 0], ht: [0, 0], corners: [0, 0], cards: [0, 0], goals: [] };
  const h1Range = inFirst ? MAX : 0;
  for (let x1 = 0; x1 <= h1Range; x1++) {
    for (let y1 = 0; y1 <= h1Range; y1++) {
      const p1 = inFirst ? ph1[x1] * pa1[y1] : 1;
      if (p1 < 1e-7) continue;
      for (let x2 = 0; x2 <= MAX; x2++) {
        for (let y2 = 0; y2 <= MAX; y2++) {
          const p = p1 * ph2[x2] * pa2[y2];
          if (p < 1e-8) continue;
          fin.ht = inFirst ? [s.score[0] + x1, s.score[1] + y1] : [fixedHt[0], fixedHt[1]];
          fin.score = [fin.ht[0] + (inFirst ? 0 : s.score[0] - fixedHt[0]) + x2, fin.ht[1] + (inFirst ? 0 : s.score[1] - fixedHt[1]) + y2];
          for (const d of gridDefs) {
            const res = d.settle(fin);
            const t = tallies.get(d.key)!;
            for (const code in res) addResult(t[code], res[code], p);
          }
        }
      }
    }
  }
  for (const [k, v] of tallies) out.set(k, v);

  // Poisson-priced specials
  const minute = minuteOf(s);
  const remainFrac = s.phase === 'FT' ? 0 : Math.max(0, (95 - minute) / 95);
  const lamH = rh.total, lamA = ra.total, lam = lamH + lamA;
  for (const d of special) {
    const k = d.key.split(':')[0];
    const t: Record<string, Tally> = {};
    const two = (pOver: number) => {
      t.o = { ...emptyTally(), w: pOver, l: 1 - pOver };
      t.u = { ...emptyTally(), w: 1 - pOver, l: pOver };
    };
    if (k === 'cor') {
      const cur = s.st.corners[0] + s.st.corners[1];
      const rem = (10.2 * remainFrac) * Math.exp(0.15 * Math.abs(s.m));
      two(1 - poissonCdf(Math.floor(d.line!) - cur, rem));
    } else if (k === 'crd') {
      const cur = cards(s, 0) + cards(s, 1);
      const rem = 4.1 * remainFrac * (minute > 60 ? 1.15 : 1);
      two(1 - poissonCdf(Math.floor(d.line!) - cur, rem));
    } else if (k === 'ng') {
      const pAny = 1 - Math.exp(-lam);
      const pH = lam > 0 ? (lamH / lam) * pAny : 0;
      const pA = lam > 0 ? (lamA / lam) * pAny : 0;
      t['1'] = { ...emptyTally(), w: pH, l: 1 - pH };
      t['2'] = { ...emptyTally(), w: pA, l: 1 - pA };
      t.none = { ...emptyTally(), w: 1 - pAny, l: pAny };
    } else if (k === 'ags' || k === 'fgs') {
      const pool = scorerPool(s);
      const totalW: [number, number] = [0, 0];
      for (const i of [0, 1] as Side[]) totalW[i] = s.t[i].players.reduce((a, p) => a + p.w, 0);
      const pAny = 1 - Math.exp(-lam);
      for (const p of pool) {
        const share = p.w / totalW[p.side];
        const lamTeam = p.side === 0 ? lamH : lamA;
        let pw: number;
        if (k === 'ags') {
          const already = s.goals.some((g) => g.side === p.side && g.player === p.name);
          pw = already ? 1 : 1 - Math.exp(-lamTeam * share * 0.92);
        } else pw = lam > 0 ? (lamTeam / lam) * pAny * share * 0.92 : 0;
        t[`${p.side}:${p.name}`] = { ...emptyTally(), w: pw, l: 1 - pw };
      }
      if (k === 'fgs') t.none = { ...emptyTally(), w: 1 - pAny, l: pAny };
    }
    out.set(d.key, t);
  }
  return out;
}

// ── module ──

export const football: SportModule<FootballState, FootballFinal> = {
  sport: 'football',
  nominal: 96 * 60 + HT_BREAK,
  kickoff(s, rng, emit) {
    s.latent = {
      form: [normal(rng, 0, 0.17), normal(rng, 0, 0.17)],
      tempo: normal(rng, 0, 0.1),
      ref: Math.exp(normal(rng, 0, 0.25)),
      fatigue: [Math.max(0, normal(rng, 0.3, 0.3)), Math.max(0, normal(rng, 0.3, 0.3))],
    };
    s.m = normal(rng, 0, 0.15);
    emit.incident('start', `Kick-off: ${s.t[0].name} v ${s.t[1].name}`, { clock: "1'" });
  },
  clone(s) {
    return {
      ...s, t: s.t, score: [...s.score] as [number, number], ht: s.ht ? ([...s.ht] as [number, number]) : null, goals: [...s.goals],
      st: {
        poss: [...s.st.poss] as [number, number], shots: [...s.st.shots] as [number, number], sot: [...s.st.sot] as [number, number], xg: [...s.st.xg] as [number, number],
        corners: [...s.st.corners] as [number, number], fouls: [...s.st.fouls] as [number, number], yellow: [...s.st.yellow] as [number, number], red: [...s.st.red] as [number, number],
        offsides: [...s.st.offsides] as [number, number], saves: [...s.st.saves] as [number, number],
      },
      booked: { ...s.booked }, mh: [...s.mh], said: [...s.said], latent: { ...s.latent },
    };
  },
  neutral(s) {
    const c = football.clone(s);
    c.latent = { form: [0, 0], tempo: 0, ref: 1, fatigue: [0, 0] };
    return c;
  },
  step(s, dt, rng, emit) {
    step(s, dt, rng, emit, true);
  },
  finished: (s) => s.phase === 'FT',
  final(s) {
    return {
      score: [...s.score] as [number, number],
      ht: (s.ht ?? [...s.score]) as [number, number],
      corners: [...s.st.corners] as [number, number],
      cards: [cards(s, 0), cards(s, 1)],
      goals: [...s.goals],
    };
  },
  view(s): View {
    const st = s.st;
    const totalPoss = st.poss[0] + st.poss[1] || 1;
    const minute = minuteOf(s);
    return {
      clock: clockLabel(s),
      period: s.phase === 'PRE' ? 'Pre-match' : s.phase === 'H1' ? '1st half' : s.phase === 'HT' ? 'Half-time' : s.phase === 'H2' ? '2nd half' : 'Full-time',
      score: [...s.score] as [number, number],
      lines: s.ht ? [{ label: 'HT', home: String(s.ht[0]), away: String(s.ht[1]) }] : [],
      stats: [
        { key: 'poss', label: 'Possession', home: (st.poss[0] / totalPoss) * 100 || 50, away: (st.poss[1] / totalPoss) * 100 || 50, fmt: 'pct' },
        { key: 'xg', label: 'Expected goals', home: st.xg[0], away: st.xg[1], fmt: 'dec2' },
        { key: 'shots', label: 'Shots', home: st.shots[0], away: st.shots[1] },
        { key: 'sot', label: 'On target', home: st.sot[0], away: st.sot[1] },
        { key: 'corners', label: 'Corners', home: st.corners[0], away: st.corners[1] },
        { key: 'fouls', label: 'Fouls', home: st.fouls[0], away: st.fouls[1] },
        { key: 'yellow', label: 'Yellow cards', home: st.yellow[0], away: st.yellow[1] },
        { key: 'red', label: 'Red cards', home: st.red[0], away: st.red[1] },
        { key: 'offsides', label: 'Offsides', home: st.offsides[0], away: st.offsides[1] },
        { key: 'saves', label: 'Saves', home: st.saves[0], away: st.saves[1] },
      ],
      momentum: s.m,
      pressure: clamp(0.25 + 0.55 * Math.abs(s.m) + s.recent * 0.08, 0, 1),
      progress: s.phase === 'FT' ? 1 : clamp(minute / 95, 0, 1),
    };
  },
  marketKeys,
  def,
  price: scorePrice,
  winner: (f) => winnerOf(f.score),
  history: (s) => [...s.mh, s.mCount ? s.mAcc / s.mCount : s.m],
};

export type { LegResult };

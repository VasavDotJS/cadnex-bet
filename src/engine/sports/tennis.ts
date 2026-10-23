/**
 * Tennis: a point-by-point Markov model. Each point is won by the server with a probability
 * built from serve vs return quality, hidden form and momentum. Games, deuce/advantage,
 * sets and tiebreaks follow the rules; a rare retirement voids unsettled markets.
 */
import type { TennisPlayer } from '../../data/types';
import { Rng, chance, clamp, normal } from '../../lib/rng';
import { Emit, MarketDef, Settled, SportModule, View, allVoid, asianResult, fmtLine, line, ou } from '../sport';
import type { Side } from '../types';

interface TP { name: string; short: string; serve: number; ret: number }

export interface TennisState {
  p: [TP, TP];
  wta: boolean;
  phase: 'PRE' | 'LIVE' | 'FT';
  sets: [number, number][]; // completed
  g: [number, number];
  pts: [number, number];
  tb: boolean;
  server: Side;
  tbFirstServer: Side;
  acc: number;
  wait: number; // seconds until next point
  setsWon: [number, number];
  st: { aces: [number, number]; dfs: [number, number]; bpWon: [number, number]; bpFaced: [number, number]; ptsWon: [number, number]; srvWon: [number, number]; srvPlayed: [number, number] };
  hadTb: boolean;
  retired: Side | null;
  gamesSeq: Side[]; // winner of each game across the match
  m: number;
  mh: number[];
  latent: { form: [number, number]; retire: number };
  said: string[];
}

export interface TennisFinal {
  sets: [number, number][];
  setsWon: [number, number];
  games: [number, number];
  hadTb: boolean;
  retired: Side | null;
  gamesSeq: Side[];
}

const POINT = 32;
const CHANGEOVER = 70;
const SET_BREAK = 120;

export function createTennis(a: TennisPlayer, b: TennisPlayer): TennisState {
  const lite = (x: TennisPlayer): TP => ({ name: x.name, short: x.short, serve: x.serve, ret: x.ret });
  return {
    p: [lite(a), lite(b)], wta: a.tour === 'WTA', phase: 'PRE', sets: [], g: [0, 0], pts: [0, 0], tb: false, server: 0, tbFirstServer: 0,
    acc: 0, wait: 0, setsWon: [0, 0],
    st: { aces: [0, 0], dfs: [0, 0], bpWon: [0, 0], bpFaced: [0, 0], ptsWon: [0, 0], srvWon: [0, 0], srvPlayed: [0, 0] },
    hadTb: false, retired: null, gamesSeq: [], m: 0, mh: [], latent: { form: [0, 0], retire: 0 }, said: [],
  };
}

function serveProb(s: TennisState, live: boolean): number {
  const i = s.server;
  const j = (1 - i) as Side;
  let p = (s.wta ? 0.565 : 0.64) + (s.p[i].serve - s.p[j].ret) * 0.0055;
  p += 0.025 * s.m * (i === 0 ? 1 : -1);
  if (live) p += s.latent.form[i] - s.latent.form[j];
  return clamp(p, 0.42, 0.82);
}

const PT = ['0', '15', '30', '40'];
function pointLabel(s: TennisState): [string, string] {
  if (s.tb) return [String(s.pts[0]), String(s.pts[1])];
  const [a, b] = s.pts;
  if (a >= 3 && b >= 3) {
    if (a === b) return ['40', '40'];
    return a > b ? ['AD', '40'] : ['40', 'AD'];
  }
  return [PT[Math.min(a, 3)], PT[Math.min(b, 3)]];
}

function clockLabel(s: TennisState): string {
  if (s.phase === 'PRE') return 'Pre-match';
  if (s.phase === 'FT') return s.retired !== null ? 'Ret.' : 'Final';
  return `S${s.sets.length + 1} ${s.g[0]}–${s.g[1]}`;
}

const T = {
  brk: ['{p} breaks! {a}–{b} in the set', 'Break of serve: {p} converts and leads {a}–{b}', '{p} rips a return winner to break for {a}–{b}'],
  brkBack: ['{p} breaks straight back, {a}–{b}', 'Immediate response: {p} breaks back'],
  set: ['{p} takes the set {a}–{b}', 'Set {p}, {a}–{b}', '{p} closes out the set {a}–{b}'],
  tb: ['Tiebreak! Nothing to separate them at 6–6', "It's going to a tiebreak"],
  ace: ['Ace from {p} down the T', '{p} with an ace out wide'],
};

function winGame(s: TennisState, w: Side, emit: Emit | null, rng: Rng): void {
  const brk = !s.tb && w !== s.server;
  s.g[w]++;
  s.gamesSeq.push(w);
  if (brk) {
    s.st.bpWon[w]++;
    s.m = clamp(s.m + (w === 0 ? 0.3 : -0.3), -1, 1);
    if (emit) {
      const lastWasBreakAgainst = s.gamesSeq.length >= 2 && s.gamesSeq[s.gamesSeq.length - 2] !== w;
      emit.incident('break', line(rng, lastWasBreakAgainst && chance(rng, 0.4) ? T.brkBack : T.brk, { p: s.p[w].short, a: s.g[w], b: s.g[1 - w] }, s.said), { side: w, clock: clockLabel(s), major: true });
      emit.key();
    }
  }
  s.pts = [0, 0];
  const [a, b] = s.g;
  const setOver = s.tb || (a >= 6 && a - b >= 2) || (b >= 6 && b - a >= 2);
  if (setOver) {
    s.sets.push([a, b]);
    s.setsWon[w]++;
    if (emit) {
      emit.incident('set', line(rng, T.set, { p: s.p[w].short, a: s.g[w], b: s.g[1 - w] }, s.said), { side: w, clock: `S${s.sets.length}`, major: true });
      emit.key();
    }
    // after a tiebreak the player who received first in it serves first
    if (s.tb) s.server = (1 - s.tbFirstServer) as Side;
    else s.server = (1 - s.server) as Side;
    s.g = [0, 0];
    s.tb = false;
    s.wait += SET_BREAK;
    if (s.setsWon[w] === 2) {
      s.phase = 'FT';
      emit?.incident('end', `Game, set and match ${s.p[w].name}: ${s.sets.map((x) => `${x[w]}–${x[1 - w]}`).join(', ')}`, { side: w, clock: 'Final', major: true });
    }
    return;
  }
  if (a === 6 && b === 6) {
    s.tb = true;
    s.hadTb = true;
    s.server = (1 - s.server) as Side;
    s.tbFirstServer = s.server;
    if (emit) { emit.incident('tiebreak', line(rng, T.tb, {}, s.said), { clock: clockLabel(s) }); emit.key(); }
    return;
  }
  s.server = (1 - s.server) as Side;
  if ((a + b) % 2 === 1) s.wait += CHANGEOVER;
}

function point(s: TennisState, rng: Rng, emit: Emit | null, live: boolean): void {
  const i = s.server;
  const j = (1 - i) as Side;
  // break point bookkeeping
  const isBp = !s.tb && s.pts[j] >= 3 && s.pts[j] > s.pts[i];
  if (isBp) s.st.bpFaced[i]++;
  const p = serveProb(s, live);
  const srvWins = chance(rng, p);
  const w = srvWins ? i : j;
  s.st.srvPlayed[i]++;
  if (srvWins) {
    s.st.srvWon[i]++;
    if (chance(rng, s.wta ? 0.05 : 0.11)) {
      s.st.aces[i]++;
      if (emit && chance(rng, 0.12)) emit.incident('info', line(rng, T.ace, { p: s.p[i].short }, s.said), { side: i, clock: clockLabel(s) });
    }
  } else if (chance(rng, 0.06)) s.st.dfs[i]++;
  s.st.ptsWon[w]++;
  s.pts[w]++;
  s.m = clamp(s.m * 0.97 + 0.04 * normal(rng), -1, 1);

  // tiebreak serve rotation: after first point, then every two points
  if (s.tb) {
    const n = s.pts[0] + s.pts[1];
    const [a, b] = s.pts;
    if ((a >= 7 || b >= 7) && Math.abs(a - b) >= 2) {
      winGame(s, a > b ? 0 : 1, emit, rng);
      return;
    }
    if (n % 2 === 1) s.server = (1 - s.server) as Side;
    return;
  }
  const [a, b] = s.pts;
  if ((a >= 4 || b >= 4) && Math.abs(a - b) >= 2) winGame(s, a > b ? 0 : 1, emit, rng);
}

function stepT(s: TennisState, dt: number, rng: Rng, emit: Emit | null, live: boolean): void {
  if (s.phase === 'PRE') {
    s.phase = 'LIVE';
    s.server = chance(rng, 0.5) ? 0 : 1;
  }
  s.acc += dt;
  let guard = 0;
  while (s.phase === 'LIVE' && guard++ < 100000) {
    if (s.wait > 0) {
      const use = Math.min(s.wait, s.acc);
      s.wait -= use;
      s.acc -= use;
      if (s.wait > 0) return;
    }
    if (s.acc < POINT) return;
    s.acc -= POINT;
    point(s, rng, emit, live);
    // retirement: hidden, rare, rises late in long matches
    if (live && s.phase === 'LIVE' && chance(rng, s.latent.retire)) {
      const who: Side = chance(rng, 0.5) ? 0 : 1;
      s.retired = who;
      s.phase = 'FT';
      emit?.incident('retire', `${s.p[who].name} retires injured. ${s.p[1 - who].name} advances`, { side: who, clock: 'Ret.', major: true });
    }
    if ((s.st.ptsWon[0] + s.st.ptsWon[1]) % 5 === 0) {
      s.mh.push(s.m);
      if (s.mh.length > 40) s.mh.shift();
    }
  }
}

// ── markets ──
type TDef = MarketDef<TennisState, TennisFinal>;
const live = (s: TennisState) => s.phase !== 'FT';
const voidIfRetired = (f: TennisFinal, sels: { code: string }[], r: () => Settled): Settled => (f.retired !== null ? allVoid(sels as never) : r());
const totalGames = (f: TennisFinal) => f.games[0] + f.games[1];

function marketKeys(s: TennisState): string[] {
  if (s.phase === 'FT') return [];
  const keys = ['mw', 'sb', 'tb'];
  const setNo = s.sets.length + 1;
  keys.push(`sw:${setNo}`);
  if (s.phase === 'LIVE') keys.push(`ng:${s.gamesSeq.length + 1}`);
  const gap = (s.p[0].serve + s.p[0].ret - s.p[1].serve - s.p[1].ret) / 6;
  const c = Math.round(-gap) + 0.5;
  keys.push(`gh:${c - 2}`, `gh:${c}`, `gh:${c + 2}`);
  for (const L of [20.5, 22.5, 24.5]) keys.push(`tg:${L}`);
  return keys;
}

function def(key: string, s: TennisState): TDef | null {
  const [kind, arg] = key.split(':');
  const [A, B] = [s.p[0].short, s.p[1].short];
  const twoWay = [{ code: '1', label: s.p[0].name }, { code: '2', label: s.p[1].name }];
  switch (kind) {
    case 'mw':
      return {
        key, name: 'Match winner', group: 'Main', order: 1, margin: 0.045, sels: twoWay, open: live,
        // a retirement after the first set completes still pays the advancing player
        settle: (f) => {
          if (f.retired !== null && f.sets.length === 0) return { '1': 'VOID', '2': 'VOID' };
          const w: Side = f.retired !== null ? ((1 - f.retired) as Side) : f.setsWon[0] === 2 ? 0 : 1;
          return { '1': w === 0 ? 'WON' : 'LOST', '2': w === 1 ? 'WON' : 'LOST' };
        },
      };
    case 'sb': {
      const sels = [{ code: '2-0', label: `${A} 2–0` }, { code: '2-1', label: `${A} 2–1` }, { code: '1-2', label: `${B} 2–1` }, { code: '0-2', label: `${B} 2–0` }];
      return {
        key, name: 'Set betting', group: 'Main', order: 2, margin: 0.08, sels, open: live,
        settle: (f) => voidIfRetired(f, sels, () => {
          const k = `${f.setsWon[0]}-${f.setsWon[1]}`;
          const r: Settled = {};
          for (const x of sels) r[x.code] = x.code === k ? 'WON' : 'LOST';
          return r;
        }),
      };
    }
    case 'gh': {
      const L = Number(arg);
      const sels = [{ code: 'h', label: `${A} ${fmtLine(L, true)}` }, { code: 'a', label: `${B} ${fmtLine(-L, true)}` }];
      return {
        key, name: `Game handicap ${A} ${fmtLine(L, true)}`, group: 'Games', order: 10 + L / 100, line: L, margin: 0.05, sels, open: live,
        settle: (f) => voidIfRetired(f, sels, () => ({ h: asianResult(f.games[0] - f.games[1], L), a: asianResult(f.games[1] - f.games[0], -L) })),
      };
    }
    case 'tg': {
      const L = Number(arg);
      const sels = [{ code: 'o', label: `Over ${fmtLine(L)}` }, { code: 'u', label: `Under ${fmtLine(L)}` }];
      return {
        key, name: `Total games ${fmtLine(L)}`, group: 'Games', order: 20 + L / 100, line: L, margin: 0.05, sels, open: live,
        settle: (f) => voidIfRetired(f, sels, () => ou(totalGames(f) > L)),
        early: (st) => {
          const g = st.sets.reduce((a, x) => a + x[0] + x[1], 0) + st.g[0] + st.g[1];
          return g > L ? ou(true) : null;
        },
      };
    }
    case 'sw': {
      const n = Number(arg);
      return {
        key, name: `Set ${n} winner`, group: 'Sets', order: 30 + n, margin: 0.05, sels: twoWay,
        open: (st) => live(st) && st.sets.length === n - 1,
        settle: (f) => {
          const set = f.sets[n - 1];
          if (!set) return { '1': 'VOID', '2': 'VOID' };
          return set[0] > set[1] ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' };
        },
        early: (st) => {
          const set = st.sets[n - 1];
          if (!set) return null;
          return set[0] > set[1] ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' };
        },
      };
    }
    case 'ng': {
      const n = Number(arg);
      return {
        key, name: `Game ${n} winner`, group: 'Games', order: 5, line: n, margin: 0.06, sels: twoWay,
        open: (st) => live(st) && st.gamesSeq.length === n - 1,
        settle: (f) => {
          const w = f.gamesSeq[n - 1];
          if (w === undefined) return { '1': 'VOID', '2': 'VOID' };
          return w === 0 ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' };
        },
        early: (st) => {
          const w = st.gamesSeq[n - 1];
          if (w === undefined) return null;
          return w === 0 ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' };
        },
      };
    }
    case 'tb': {
      const sels = [{ code: 'y', label: 'Yes' }, { code: 'n', label: 'No' }];
      return {
        key, name: 'Tiebreak in match', group: 'Sets', order: 40, margin: 0.07, sels, open: live,
        settle: (f) => (f.hadTb ? { y: 'WON', n: 'LOST' } : f.retired !== null ? allVoid(sels) : { y: 'LOST', n: 'WON' }),
        early: (st) => (st.hadTb ? { y: 'WON', n: 'LOST' } : null),
      };
    }
  }
  return null;
}

export const tennis: SportModule<TennisState, TennisFinal> = {
  sport: 'tennis',
  nominal: 175 * POINT + 12 * CHANGEOVER + 2 * SET_BREAK,
  kickoff(s, rng, emit) {
    s.latent = { form: [normal(rng, 0, 0.022), normal(rng, 0, 0.022)], retire: chance(rng, 0.04) ? 0.004 : 0.00002 };
    emit.incident('start', `${s.p[0].name} v ${s.p[1].name}. Players are ready`, { clock: 'S1 0–0' });
  },
  clone(s) {
    const c2 = (x: [number, number]) => [x[0], x[1]] as [number, number];
    return {
      ...s, sets: s.sets.map(c2), g: c2(s.g), pts: c2(s.pts), setsWon: c2(s.setsWon), gamesSeq: [...s.gamesSeq], mh: [...s.mh], said: [],
      st: { aces: c2(s.st.aces), dfs: c2(s.st.dfs), bpWon: c2(s.st.bpWon), bpFaced: c2(s.st.bpFaced), ptsWon: c2(s.st.ptsWon), srvWon: c2(s.st.srvWon), srvPlayed: c2(s.st.srvPlayed) },
      latent: { form: c2(s.latent.form), retire: s.latent.retire },
    };
  },
  neutral(s) {
    const c = tennis.clone(s);
    c.latent = { form: [0, 0], retire: 0 };
    return c;
  },
  step(s, dt, rng, emit) {
    stepT(s, dt, rng, emit, emit !== null);
  },
  finished: (s) => s.phase === 'FT',
  final(s) {
    const games: [number, number] = [0, 0];
    for (const x of s.sets) { games[0] += x[0]; games[1] += x[1]; }
    games[0] += s.g[0];
    games[1] += s.g[1];
    return { sets: s.sets.map((x) => [x[0], x[1]] as [number, number]), setsWon: [s.setsWon[0], s.setsWon[1]], games, hadTb: s.hadTb, retired: s.retired, gamesSeq: [...s.gamesSeq] };
  },
  view(s): View {
    const st = s.st;
    const pl = pointLabel(s);
    const lines = s.sets.map((x, i) => ({ label: `Set ${i + 1}`, home: String(x[0]), away: String(x[1]) }));
    if (s.phase === 'LIVE') {
      lines.push({ label: `Set ${s.sets.length + 1}`, home: String(s.g[0]), away: String(s.g[1]) });
      lines.push({ label: s.tb ? 'Tiebreak' : 'Game', home: pl[0], away: pl[1] });
    }
    const pctSrv = (i: Side) => (st.srvPlayed[i] ? (st.srvWon[i] / st.srvPlayed[i]) * 100 : 0);
    const played = s.sets.length + (s.g[0] + s.g[1]) / 12;
    return {
      clock: clockLabel(s),
      period: s.phase === 'PRE' ? 'Pre-match' : s.phase === 'FT' ? (s.retired !== null ? 'Retired' : 'Final') : s.tb ? 'Tiebreak' : `Set ${s.sets.length + 1}`,
      score: [s.setsWon[0], s.setsWon[1]],
      lines,
      stats: [
        { key: 'aces', label: 'Aces', home: st.aces[0], away: st.aces[1] },
        { key: 'dfs', label: 'Double faults', home: st.dfs[0], away: st.dfs[1] },
        { key: 'srv', label: 'Service points won', home: pctSrv(0), away: pctSrv(1), fmt: 'pct' },
        { key: 'bp', label: 'Breaks', home: st.bpWon[0], away: st.bpWon[1] },
        { key: 'pts', label: 'Total points won', home: st.ptsWon[0], away: st.ptsWon[1] },
      ],
      momentum: s.m,
      pressure: clamp(0.3 + Math.abs(s.m) * 0.6, 0, 1),
      serving: s.phase === 'LIVE' ? s.server : undefined,
      progress: s.phase === 'FT' ? 1 : clamp(played / 2.6, 0, 0.97),
    };
  },
  marketKeys,
  def,
  winner: (f) => (f.retired !== null ? ((1 - f.retired) as Side) : f.setsWon[0] === 2 ? 0 : 1),
  voided: (f) => f.retired !== null,
  history: (s) => [...s.mh],
};

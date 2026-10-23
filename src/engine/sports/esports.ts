/**
 * Esports, best of three.
 * CS2 / Valorant: round by round with an economy model (pistol rounds, eco after losses,
 * loss bonus), side advantage, overtime and momentum.
 * League of Legends: minute by minute with kills, gold, dragons, barons and a gold-led ending.
 */
import type { EsportsGame, EsportsTeam } from '../../data/types';
import { Rng, chance, clamp, normal, poisson, sigmoid, weighted } from '../../lib/rng';
import { Emit, MarketDef, Settled, SportModule, View, fmtLine, line, ou } from '../sport';
import type { Side } from '../types';

interface ET { name: string; short: string; rating: number; players: { name: string; w: number }[] }
interface MapResult { name: string; winner: Side; rounds: [number, number]; kills: [number, number] }

export interface EsportsState {
  t: [ET, ET];
  game: EsportsGame;
  maps: string[];
  phase: 'PRE' | 'LIVE' | 'BREAK' | 'FT';
  acc: number;
  wait: number;
  mapIdx: number;
  mapsWon: [number, number];
  results: MapResult[];
  rounds: [number, number];
  econ: [number, number];
  defender: Side; // CT / defenders this half
  streak: { side: Side; n: number };
  minute: number;
  kills: [number, number];
  gold: number; // + favours home
  dragons: [number, number];
  barons: [number, number];
  towers: [number, number];
  m: number;
  mh: number[];
  latent: { form: [number, number]; mapForm: [number, number] };
  said: string[];
}

export interface EsportsFinal {
  mapsWon: [number, number];
  results: MapResult[];
  winner: Side;
}

const ROUND: Record<string, number> = { cs2: 112, valorant: 100 };
const MAP_BREAK = 240;

export function createEsports(home: EsportsTeam, away: EsportsTeam, maps: string[]): EsportsState {
  const lite = (x: EsportsTeam): ET => ({ name: x.name, short: x.short, rating: x.rating, players: x.players.map((p) => ({ ...p })) });
  return {
    t: [lite(home), lite(away)], game: home.game, maps, phase: 'PRE', acc: 0, wait: 0, mapIdx: 0, mapsWon: [0, 0], results: [],
    rounds: [0, 0], econ: [0.5, 0.5], defender: 0, streak: { side: 0, n: 0 },
    minute: 0, kills: [0, 0], gold: 0, dragons: [0, 0], barons: [0, 0], towers: [0, 0],
    m: 0, mh: [], latent: { form: [0, 0], mapForm: [0, 0] }, said: [],
  };
}

const roundBased = (s: EsportsState) => s.game !== 'lol';

function clockLabel(s: EsportsState): string {
  if (s.phase === 'PRE') return 'Pre-match';
  if (s.phase === 'FT') return 'Final';
  if (s.phase === 'BREAK') return `Map ${s.mapIdx + 1} next`;
  if (roundBased(s)) return `M${s.mapIdx + 1} R${s.rounds[0] + s.rounds[1] + 1}`;
  return `G${s.mapIdx + 1} ${s.minute}:00`;
}

const T = {
  ace: ['ACE! {p} wipes out all five', '{p} with an unbelievable ace'],
  clutch: ['{p} clutches a 1v3!', 'What a clutch from {p}, 1v2 converted'],
  streak: ['{team} have won {n} rounds in a row', '{team} rolling: {n} straight rounds'],
  map: ['{team} take {map} {a}–{b}', '{map} goes to {team}, {a}–{b}'],
  fb: ['First blood to {team}: {p} finds the pick', '{p} draws first blood for {team}'],
  dragon: ['{team} secure the dragon', 'Dragon taken by {team}'],
  baron: ['{team} take Baron Nashor!', 'Baron to {team}. A huge swing'],
  fight: ['{team} win a 4-for-1 teamfight', 'Huge teamfight win for {team}', '{p} with a triple kill for {team}'],
};

function roundWinProb(s: EsportsState, live: boolean): number {
  const [A, B] = s.t;
  let x = (A.rating - B.rating) / 17 + 1.0 * (s.econ[0] - s.econ[1]) + 0.35 * s.m;
  x += (s.defender === 0 ? 1 : -1) * (s.game === 'cs2' ? 0.12 : 0.08);
  if (live) x += s.latent.form[0] - s.latent.form[1] + s.latent.mapForm[0] - s.latent.mapForm[1];
  return sigmoid(x);
}

function mapTarget(s: EsportsState): { done: boolean; winner?: Side } {
  const [a, b] = s.rounds;
  if (s.game === 'cs2') {
    if (a < 13 && b < 13) return { done: false };
    if (a + b <= 24) return a === 13 ? { done: true, winner: 0 } : b === 13 ? { done: true, winner: 1 } : { done: false };
    // overtime: blocks of 6, first to 4 within the block
    const extra = a + b - 24;
    const block = Math.floor((extra - 1) / 6);
    const base = 12 + block * 3;
    if (a >= base + 4) return { done: true, winner: 0 };
    if (b >= base + 4) return { done: true, winner: 1 };
    return { done: false };
  }
  // valorant: first to 13, win by 2 after 12–12
  if ((a >= 13 || b >= 13) && Math.abs(a - b) >= 2) return { done: true, winner: a > b ? 0 : 1 };
  return { done: false };
}

function startMap(s: EsportsState, rng: Rng, emit: Emit | null, live: boolean): void {
  s.phase = 'LIVE';
  s.rounds = [0, 0];
  s.econ = [0.5, 0.5];
  s.defender = chance(rng, 0.5) ? 0 : 1;
  s.streak = { side: 0, n: 0 };
  s.minute = 0;
  s.kills = [0, 0];
  s.gold = 0;
  s.dragons = [0, 0];
  s.barons = [0, 0];
  s.towers = [0, 0];
  if (live) s.latent.mapForm = [normal(rng, 0, 0.18), normal(rng, 0, 0.18)];
  emit?.incident('period', s.game === 'lol' ? `Game ${s.mapIdx + 1} begins` : `Map ${s.mapIdx + 1}: ${s.maps[s.mapIdx]}`, { clock: clockLabel(s) });
  emit?.key();
}

function endMap(s: EsportsState, w: Side, emit: Emit | null, rng: Rng): void {
  s.mapsWon[w]++;
  s.results.push({ name: s.maps[s.mapIdx], winner: w, rounds: [s.rounds[0], s.rounds[1]], kills: [s.kills[0], s.kills[1]] });
  if (emit) {
    const sc = roundBased(s) ? s.rounds : s.kills;
    emit.incident('map', line(rng, T.map, { team: s.t[w].name, map: s.game === 'lol' ? `Game ${s.mapIdx + 1}` : s.maps[s.mapIdx], a: sc[w], b: sc[1 - w] }, s.said), { side: w, clock: clockLabel(s), major: true });
    emit.key();
  }
  s.m *= 0.4;
  if (s.mapsWon[w] === 2) {
    s.phase = 'FT';
    emit?.incident('end', `${s.t[w].name} win the series ${s.mapsWon[w]}–${s.mapsWon[1 - w]}`, { side: w, clock: 'Final', major: true });
    return;
  }
  s.mapIdx++;
  s.phase = 'BREAK';
  s.wait = MAP_BREAK;
}

function round(s: EsportsState, rng: Rng, emit: Emit | null, live: boolean): void {
  const total = s.rounds[0] + s.rounds[1];
  const pistol = total === 0 || total === 12;
  if (pistol) s.econ = [0.5, 0.5];
  const w: Side = chance(rng, roundWinProb(s, live)) ? 0 : 1;
  const l = (1 - w) as Side;
  s.rounds[w]++;
  s.econ[w] = Math.min(1, s.econ[w] + 0.15);
  s.econ[l] = s.econ[l] < 0.3 ? 0.75 : Math.max(0.05, s.econ[l] - 0.35);
  s.m = clamp(s.m * 0.9 + (w === 0 ? 0.12 : -0.12) + 0.05 * normal(rng), -1, 1);
  s.kills[w] += 5;
  s.kills[l] += Math.floor(rng.next() * 4);
  if (s.streak.side === w) s.streak.n++;
  else s.streak = { side: w, n: 1 };
  if (emit) {
    const star = weighted(rng, s.t[w].players, (p) => p.w).name;
    if (chance(rng, 0.025)) emit.incident('kill', line(rng, T.ace, { p: star }, s.said), { side: w, clock: clockLabel(s) });
    else if (chance(rng, 0.04)) emit.incident('kill', line(rng, T.clutch, { p: star }, s.said), { side: w, clock: clockLabel(s) });
    if (pistol) emit.incident('round', `${s.t[w].short} win the pistol round`, { side: w, clock: clockLabel(s) });
    if (s.streak.n === 5) { emit.incident('round', line(rng, T.streak, { team: s.t[w].name, n: 5 }, s.said), { side: w, clock: clockLabel(s) }); emit.key(); }
  }
  const nt = s.rounds[0] + s.rounds[1];
  if (nt === 12 || (nt > 24 && (nt - 24) % 3 === 0)) {
    s.defender = (1 - s.defender) as Side;
    if (nt === 12) emit?.incident('info', `Half-time on ${s.maps[s.mapIdx]}: ${s.t[0].short} ${s.rounds[0]}–${s.rounds[1]} ${s.t[1].short}`, { clock: clockLabel(s) });
  }
  const r = mapTarget(s);
  if (r.done) endMap(s, r.winner!, emit, rng);
}

function lolMinute(s: EsportsState, rng: Rng, emit: Emit | null, live: boolean): void {
  s.minute++;
  const [A, B] = s.t;
  let edge = (A.rating - B.rating) / 12 + s.gold / 5000 + 0.4 * s.m;
  if (live) edge += s.latent.form[0] - s.latent.form[1] + s.latent.mapForm[0] - s.latent.mapForm[1];
  const share = sigmoid(edge);
  const n = poisson(rng, s.minute < 3 ? 0.2 : 0.98);
  let kh = 0;
  for (let k = 0; k < n; k++) if (chance(rng, share)) kh++;
  const ka = n - kh;
  if (emit && s.kills[0] + s.kills[1] === 0 && n > 0) {
    const side: Side = kh > 0 ? 0 : 1;
    emit.incident('kill', line(rng, T.fb, { team: s.t[side].name, p: weighted(rng, s.t[side].players, (p) => p.w).name }, s.said), { side, clock: clockLabel(s) });
  }
  s.kills[0] += kh;
  s.kills[1] += ka;
  s.gold += (kh - ka) * 320 + normal(rng, (share - 0.5) * 500, 260);
  if (emit && Math.abs(kh - ka) >= 3) {
    const side: Side = kh > ka ? 0 : 1;
    emit.incident('kill', line(rng, T.fight, { team: s.t[side].name, p: weighted(rng, s.t[side].players, (p) => p.w).name }, s.said), { side, clock: clockLabel(s) });
    emit.key();
  }
  if (s.minute >= 5 && s.minute % 5 === 0) {
    const side: Side = chance(rng, share) ? 0 : 1;
    s.dragons[side]++;
    s.gold += side === 0 ? 400 : -400;
    emit?.incident('objective', line(rng, T.dragon, { team: s.t[side].name }, s.said), { side, clock: clockLabel(s) });
  }
  if (s.minute >= 20 && s.minute % 7 === 6) {
    const side: Side = chance(rng, sigmoid(edge * 1.3)) ? 0 : 1;
    s.barons[side]++;
    s.gold += side === 0 ? 1500 : -1500;
    emit?.incident('objective', line(rng, T.baron, { team: s.t[side].name }, s.said), { side, clock: clockLabel(s), major: true });
    emit?.key();
  }
  if (s.minute >= 12 && chance(rng, 0.25)) {
    const side: Side = chance(rng, share) ? 0 : 1;
    s.towers[side]++;
  }
  s.m = clamp(s.m * 0.92 + (kh - ka) * 0.05 + 0.04 * normal(rng), -1, 1);
  if (s.minute >= 22) {
    const pEnd = sigmoid(Math.abs(s.gold) / 2500 - 3 + (s.minute - 22) * 0.08) * 0.5;
    if (chance(rng, pEnd) || s.minute >= 48) {
      const leader: Side = s.gold >= 0 ? 0 : 1;
      const w: Side = chance(rng, 0.88) ? leader : ((1 - leader) as Side);
      endMap(s, w, emit, rng);
    }
  }
}

function stepE(s: EsportsState, dt: number, rng: Rng, emit: Emit | null, live: boolean): void {
  if (s.phase === 'PRE') startMap(s, rng, emit, live);
  s.acc += dt;
  const unit = roundBased(s) ? ROUND[s.game] : 60;
  let guard = 0;
  while (s.phase !== 'FT' && guard++ < 100000) {
    if (s.wait > 0) {
      const use = Math.min(s.wait, s.acc);
      s.wait -= use;
      s.acc -= use;
      if (s.wait > 0) return;
    }
    if (s.phase === 'BREAK') { startMap(s, rng, emit, live); continue; }
    if (s.acc < unit) return;
    s.acc -= unit;
    if (roundBased(s)) round(s, rng, emit, live);
    else lolMinute(s, rng, emit, live);
    const n = roundBased(s) ? s.rounds[0] + s.rounds[1] : s.minute;
    if (n % 3 === 0) { s.mh.push(s.m); if (s.mh.length > 40) s.mh.shift(); }
  }
}

// ── markets ──
type EDef = MarketDef<EsportsState, EsportsFinal>;
const live = (s: EsportsState) => s.phase !== 'FT';

function marketKeys(s: EsportsState): string[] {
  if (s.phase === 'FT') return [];
  const keys = ['mw', 'cs', 'tm:2.5', 'mh:-1.5', 'mh:1.5'];
  const n = s.mapIdx + 1;
  keys.push(`map:${n}`);
  if (s.phase === 'LIVE' && n < 3 && s.mapsWon[0] + s.mapsWon[1] === s.mapIdx) keys.push(`map:${n + 1}`);
  if (roundBased(s)) keys.push(`tr:${n}:${s.game === 'cs2' ? 21.5 : 22.5}`);
  else keys.push(`tk:${n}:${26.5}`);
  return keys;
}

function def(key: string, s: EsportsState): EDef | null {
  const parts = key.split(':');
  const [H, A] = [s.t[0].short, s.t[1].short];
  switch (parts[0]) {
    case 'mw':
      return {
        key, name: 'Match winner', group: 'Main', order: 1, margin: 0.05,
        sels: [{ code: '1', label: s.t[0].name }, { code: '2', label: s.t[1].name }], open: live,
        settle: (f) => (f.winner === 0 ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' }),
      };
    case 'cs': {
      const codes = ['2-0', '2-1', '1-2', '0-2'];
      return {
        key, name: 'Correct map score', group: 'Main', order: 3, margin: 0.08,
        sels: codes.map((c) => ({ code: c, label: c[0] > c[2] ? `${H} ${c.replace('-', '–')}` : `${A} ${c[2]}–${c[0]}` })), open: live,
        settle: (f) => {
          const k = `${f.mapsWon[0]}-${f.mapsWon[1]}`;
          const r: Settled = {};
          for (const c of codes) r[c] = c === k ? 'WON' : 'LOST';
          return r;
        },
      };
    }
    case 'tm':
      return {
        key, name: 'Total maps 2.5', group: 'Main', order: 4, line: 2.5, margin: 0.06,
        sels: [{ code: 'o', label: 'Over 2.5' }, { code: 'u', label: 'Under 2.5' }], open: live,
        settle: (f) => ou(f.results.length > 2.5),
        early: (st) => (st.mapsWon[0] === 1 && st.mapsWon[1] === 1 ? ou(true) : null),
      };
    case 'mh': {
      const L = Number(parts[1]);
      return {
        key, name: `Map handicap ${H} ${fmtLine(L, true)}`, group: 'Main', order: 5 + (L > 0 ? 0.1 : 0), line: L, margin: 0.06,
        sels: [{ code: 'h', label: `${H} ${fmtLine(L, true)}` }, { code: 'a', label: `${A} ${fmtLine(-L, true)}` }], open: live,
        settle: (f) => (f.mapsWon[0] - f.mapsWon[1] + L > 0 ? { h: 'WON', a: 'LOST' } : { h: 'LOST', a: 'WON' }),
      };
    }
    case 'map': {
      const n = Number(parts[1]);
      const label = s.game === 'lol' ? `Game ${n}` : `Map ${n}${s.maps[n - 1] ? ` (${s.maps[n - 1]})` : ''}`;
      return {
        key, name: `${label} winner`, group: 'Maps', order: 10 + n, margin: 0.05,
        sels: [{ code: '1', label: s.t[0].name }, { code: '2', label: s.t[1].name }],
        open: (st) => live(st) && st.results.length < n,
        settle: (f) => {
          const r = f.results[n - 1];
          if (!r) return { '1': 'VOID', '2': 'VOID' };
          return r.winner === 0 ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' };
        },
        early: (st) => {
          const r = st.results[n - 1];
          if (!r) return null;
          return r.winner === 0 ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' };
        },
      };
    }
    case 'tr':
    case 'tk': {
      const n = Number(parts[1]);
      const L = Number(parts[2]);
      const rounds = parts[0] === 'tr';
      const val = (r: MapResult) => (rounds ? r.rounds[0] + r.rounds[1] : r.kills[0] + r.kills[1]);
      return {
        key, name: `${s.game === 'lol' ? `Game ${n}` : `Map ${n}`} total ${rounds ? 'rounds' : 'kills'} ${fmtLine(L)}`, group: 'Maps', order: 20 + n, line: L, margin: 0.06,
        sels: [{ code: 'o', label: `Over ${fmtLine(L)}` }, { code: 'u', label: `Under ${fmtLine(L)}` }],
        open: (st) => live(st) && st.results.length < n,
        settle: (f) => (f.results[n - 1] ? ou(val(f.results[n - 1]) > L) : { o: 'VOID', u: 'VOID' }),
        early: (st) => {
          const r = st.results[n - 1];
          if (r) return ou(val(r) > L);
          if (st.mapIdx === n - 1 && st.phase === 'LIVE') {
            const cur = rounds ? st.rounds[0] + st.rounds[1] : st.kills[0] + st.kills[1];
            if (cur > L) return ou(true);
          }
          return null;
        },
      };
    }
  }
  return null;
}

export const esports: SportModule<EsportsState, EsportsFinal> = {
  sport: 'esports',
  nominal: 2 * 24 * 105 + MAP_BREAK * 2 + 700,
  kickoff(s, rng, emit) {
    s.latent = { form: [normal(rng, 0, 0.12), normal(rng, 0, 0.12)], mapForm: [0, 0] };
    emit.incident('start', `${s.t[0].name} v ${s.t[1].name}, best of three`, { clock: 'Start' });
  },
  clone(s) {
    const c2 = (x: [number, number]) => [x[0], x[1]] as [number, number];
    return {
      ...s, mapsWon: c2(s.mapsWon), results: s.results.map((r) => ({ ...r, rounds: c2(r.rounds), kills: c2(r.kills) })), rounds: c2(s.rounds), econ: c2(s.econ),
      streak: { ...s.streak }, kills: c2(s.kills), dragons: c2(s.dragons), barons: c2(s.barons), towers: c2(s.towers), mh: [...s.mh], said: [],
      latent: { form: c2(s.latent.form), mapForm: c2(s.latent.mapForm) },
    };
  },
  neutral(s) {
    const c = esports.clone(s);
    c.latent = { form: [0, 0], mapForm: [0, 0] };
    return c;
  },
  step(s, dt, rng, emit) {
    stepE(s, dt, rng, emit, emit !== null);
  },
  finished: (s) => s.phase === 'FT',
  final: (s) => ({ mapsWon: [s.mapsWon[0], s.mapsWon[1]], results: s.results.map((r) => ({ ...r })), winner: s.mapsWon[0] === 2 ? 0 : 1 }),
  view(s): View {
    const lines = s.results.map((r, i) => ({ label: s.game === 'lol' ? `Game ${i + 1}` : r.name, home: String(roundBased(s) ? r.rounds[0] : r.kills[0]), away: String(roundBased(s) ? r.rounds[1] : r.kills[1]) }));
    if (s.phase === 'LIVE') lines.push({ label: s.game === 'lol' ? `Game ${s.mapIdx + 1} kills` : `${s.maps[s.mapIdx]} (live)`, home: String(roundBased(s) ? s.rounds[0] : s.kills[0]), away: String(roundBased(s) ? s.rounds[1] : s.kills[1]) });
    const stats = roundBased(s)
      ? [
          { key: 'econ', label: 'Economy', home: s.econ[0] * 100, away: s.econ[1] * 100, fmt: 'pct' as const },
          { key: 'kills', label: 'Kills (map)', home: s.kills[0], away: s.kills[1] },
          { key: 'streak', label: 'Round streak', home: s.streak.side === 0 ? s.streak.n : 0, away: s.streak.side === 1 ? s.streak.n : 0 },
        ]
      : [
          { key: 'kills', label: 'Kills', home: s.kills[0], away: s.kills[1] },
          { key: 'gold', label: 'Gold lead (k)', home: Math.max(0, s.gold) / 1000, away: Math.max(0, -s.gold) / 1000, fmt: 'dec1' as const },
          { key: 'dragons', label: 'Dragons', home: s.dragons[0], away: s.dragons[1] },
          { key: 'barons', label: 'Barons', home: s.barons[0], away: s.barons[1] },
          { key: 'towers', label: 'Towers', home: s.towers[0], away: s.towers[1] },
        ];
    const done = s.results.length;
    const cur = roundBased(s) ? (s.rounds[0] + s.rounds[1]) / 24 : s.minute / 32;
    return {
      clock: clockLabel(s),
      period: s.phase === 'PRE' ? 'Pre-match' : s.phase === 'FT' ? 'Final' : s.phase === 'BREAK' ? 'Map break' : s.game === 'lol' ? `Game ${s.mapIdx + 1}` : s.maps[s.mapIdx],
      score: [s.mapsWon[0], s.mapsWon[1]],
      lines,
      stats,
      momentum: s.m,
      pressure: clamp(0.3 + Math.abs(s.m) * 0.6, 0, 1),
      progress: s.phase === 'FT' ? 1 : clamp((done + Math.min(cur, 0.95)) / 2.5, 0, 0.98),
    };
  },
  marketKeys,
  def,
  winner: (f) => f.winner,
  history: (s) => [...s.mh, s.m],
};

/**
 * Basketball: possession by possession. Each trip ends in a turnover, two, three or free throws,
 * with offensive rebounds, scoring runs, timeouts, late intentional fouls and overtime when tied.
 */
import type { BasketballTeam } from '../../data/types';
import { Rng, chance, clamp, normal, weighted } from '../../lib/rng';
import { Emit, MarketDef, Settled, SportModule, View, fmtLine, line, ou } from '../sport';
import type { Side } from '../types';

interface BTeam { name: string; short: string; offense: number; defense: number; pace: number; players: { name: string; w: number }[] }

export interface BasketballState {
  t: [BTeam, BTeam];
  euro: boolean;
  qLen: number;
  q: number; // 0 pre, 1..4, 5+ overtime
  clock: number; // seconds left in the period
  phase: 'PRE' | 'LIVE' | 'BREAK' | 'FT';
  breakLeft: number;
  poss: Side;
  acc: number;
  score: [number, number];
  qs: [number, number][];
  pts: Record<string, number>; // `${side}:${name}`
  st: { fgm: [number, number]; fga: [number, number]; tpm: [number, number]; tpa: [number, number]; ftm: [number, number]; fta: [number, number]; reb: [number, number]; to: [number, number]; fouls: [number, number] };
  run: { side: Side; pts: number; opp: number };
  lastTimeout: number;
  m: number;
  mh: number[];
  mAcc: number;
  mCount: number;
  firstTo: Record<string, Side | null>; // race-to targets
  latent: { form: [number, number]; pace: number };
  said: string[];
}

export interface BasketballFinal {
  score: [number, number];
  qs: [number, number][];
  pts: Record<string, number>;
  firstTo: Record<string, Side | null>;
}

const RACES = [20, 40, 60];

export function createBasketball(home: BasketballTeam, away: BasketballTeam, euro: boolean): BasketballState {
  const lite = (x: BasketballTeam): BTeam => ({ name: x.name, short: x.short, offense: x.offense, defense: x.defense, pace: x.pace, players: x.players.map((p) => ({ ...p })) });
  const pts: Record<string, number> = {};
  for (const i of [0, 1] as Side[]) for (const p of [home, away][i].players) pts[`${i}:${p.name}`] = 0;
  const firstTo: Record<string, Side | null> = {};
  for (const r of RACES) firstTo[r] = null;
  return {
    t: [lite(home), lite(away)], euro, qLen: euro ? 600 : 720, q: 0, clock: euro ? 600 : 720, phase: 'PRE', breakLeft: 0, poss: 0, acc: 0,
    score: [0, 0], qs: [], pts,
    st: { fgm: [0, 0], fga: [0, 0], tpm: [0, 0], tpa: [0, 0], ftm: [0, 0], fta: [0, 0], reb: [0, 0], to: [0, 0], fouls: [0, 0] },
    run: { side: 0, pts: 0, opp: 0 }, lastTimeout: 0,
    m: 0, mh: [], mAcc: 0, mCount: 0, firstTo,
    latent: { form: [0, 0], pace: 0 }, said: [],
  };
}

function ppp(s: BasketballState, i: Side, live: boolean): number {
  const me = s.t[i];
  const op = s.t[1 - i];
  let k = Math.exp((me.offense - op.defense) / 45) * (i === 0 ? 1.018 : 0.982);
  k *= Math.exp(0.05 * s.m * (i === 0 ? 1 : -1));
  if (live) k *= Math.exp(s.latent.form[i]);
  return k;
}

function possTime(s: BasketballState, rng: Rng, live: boolean): number {
  const pace = (s.t[0].pace + s.t[1].pace) / 200;
  const base = (s.euro ? 16.0 : 14.4) / pace / (live ? Math.exp(s.latent.pace) : 1);
  return clamp(normal(rng, base, 4.5), 4, 24);
}

function clockLabel(s: BasketballState): string {
  if (s.phase === 'PRE') return 'Q1 12:00';
  if (s.phase === 'FT') return 'Final';
  const per = s.q <= 4 ? `Q${s.q}` : s.q === 5 ? 'OT' : `OT${s.q - 4}`;
  if (s.phase === 'BREAK') return s.q === 2 ? 'Half-time' : `End ${per}`;
  const m = Math.floor(s.clock / 60);
  const sec = Math.floor(s.clock % 60);
  return `${per} ${m}:${String(sec).padStart(2, '0')}`;
}

const T = {
  three: ['{player} drains a three from the wing', '{player} pulls up from deep. Splash!', '{player} hits a step-back three', '{player} buries the corner three'],
  run: ['{team} on a {a}–{b} run', '{team} have reeled off {a} straight', 'Momentum swing: {team} on a {a}–{b} burst'],
  timeout: ['Timeout {team}, trying to stop the bleeding', '{team} call timeout'],
};

function score(s: BasketballState, i: Side, n: number, player: string, emit: Emit | null, rng: Rng, three = false): void {
  s.score[i] += n;
  s.pts[`${i}:${player}`] = (s.pts[`${i}:${player}`] ?? 0) + n;
  const q = s.qs[s.q - 1];
  if (q) q[i] += n;
  for (const r of RACES) if (s.firstTo[r] === null && s.score[i] >= r) s.firstTo[r] = i;
  if (s.run.side === i) s.run.pts += n;
  else {
    s.run.opp = s.run.pts;
    s.run = { side: i, pts: n, opp: 0 };
  }
  s.m = clamp(s.m + (i === 0 ? 1 : -1) * n * 0.025, -1, 1);
  if (!emit) return;
  const top = [...s.t[i].players].sort((a, b) => b.w - a.w).slice(0, 2).map((p) => p.name);
  if (three && top.includes(player) && chance(rng, 0.6)) emit.incident('three', line(rng, T.three, { player }, s.said), { side: i, clock: clockLabel(s) });
  if (s.run.pts >= 9 && s.run.pts - n < 9) {
    emit.incident('run', line(rng, T.run, { team: s.t[i].name, a: s.run.pts, b: 0 }, s.said), { side: i, clock: clockLabel(s), major: true });
    emit.key();
    const other = (1 - i) as Side;
    if (s.clock < s.lastTimeout - 60 || s.lastTimeout === 0) {
      s.lastTimeout = s.clock;
      emit.incident('timeout', line(rng, T.timeout, { team: s.t[other].name }, s.said), { side: other, clock: clockLabel(s) });
    }
  }
}

function possession(s: BasketballState, rng: Rng, emit: Emit | null, live: boolean): number {
  const i = s.poss;
  const j = (1 - i) as Side;
  const k = ppp(s, i, live);
  const team = s.t[i];
  const shooter = () => weighted(rng, team.players, (p) => p.w).name;
  let used = possTime(s, rng, live);

  // late game: trailing defence fouls to stop the clock
  const diff = s.score[i] - s.score[j];
  const lateFoul = s.q >= 4 && s.clock < 45 && diff >= 1 && diff <= 8 && chance(rng, 0.55);
  if (lateFoul) {
    used = clamp(normal(rng, 4, 1.5), 1, 8);
    s.st.fouls[j]++;
    const p = shooter();
    s.st.fta[i] += 2;
    for (let f = 0; f < 2; f++) if (chance(rng, 0.8)) { s.st.ftm[i]++; score(s, i, 1, p, emit, rng); }
    s.poss = j;
    return Math.min(used, s.clock);
  }

  let again = true;
  let guard = 0;
  while (again && guard++ < 4) {
    again = false;
    const r = rng.next();
    if (r < 0.13) {
      s.st.to[i]++;
      break;
    }
    if (r < 0.24) {
      // shooting foul
      s.st.fouls[j]++;
      const p = shooter();
      s.st.fta[i] += 2;
      for (let f = 0; f < 2; f++) if (chance(rng, 0.78)) { s.st.ftm[i]++; score(s, i, 1, p, emit, rng); }
      break;
    }
    const three = chance(rng, s.euro ? 0.36 : 0.4);
    const p = shooter();
    if (three) {
      s.st.tpa[i]++; s.st.fga[i]++;
      if (chance(rng, clamp(0.36 * k, 0.2, 0.5))) {
        s.st.tpm[i]++; s.st.fgm[i]++;
        score(s, i, 3, p, emit, rng, true);
        break;
      }
    } else {
      s.st.fga[i]++;
      if (chance(rng, clamp(0.545 * k, 0.35, 0.7))) {
        s.st.fgm[i]++;
        score(s, i, 2, p, emit, rng);
        if (chance(rng, 0.05)) { s.st.fta[i]++; if (chance(rng, 0.78)) { s.st.ftm[i]++; score(s, i, 1, p, emit, rng); } }
        break;
      }
    }
    // miss: rebound
    if (chance(rng, 0.26)) {
      s.st.reb[i]++;
      again = true;
      used += clamp(normal(rng, 5, 2), 2, 10);
    } else s.st.reb[j]++;
  }
  s.poss = j;
  return Math.min(used, s.clock);
}

function stepBb(s: BasketballState, dt: number, rng: Rng, emit: Emit | null, live: boolean): void {
  s.acc += dt;
  let guard = 0;
  while (s.phase !== 'FT' && guard++ < 100000) {
    if (s.phase === 'PRE') {
      s.phase = 'LIVE'; s.q = 1; s.clock = s.qLen; s.qs.push([0, 0]);
      s.poss = chance(rng, 0.5) ? 0 : 1;
      continue;
    }
    if (s.phase === 'BREAK') {
      if (s.acc < s.breakLeft) { s.breakLeft -= s.acc; s.acc = 0; return; }
      s.acc -= s.breakLeft;
      s.phase = 'LIVE';
      s.q++;
      s.clock = s.q <= 4 ? s.qLen : 300;
      s.qs.push([0, 0]);
      s.st.fouls = [0, 0];
      emit?.incident('period', s.q <= 4 ? `Quarter ${s.q} under way` : `Overtime${s.q > 5 ? ` ${s.q - 4}` : ''} under way`, { clock: clockLabel(s) });
      emit?.key();
      continue;
    }
    // need enough accumulated time for the next possession (approx 14s); consume in whole possessions
    if (s.acc < 12) return;
    const used = possession(s, rng, emit, live);
    s.acc -= used;
    s.clock -= used;
    s.m = clamp(s.m - 0.03 * s.m + 0.05 * normal(rng), -1, 1);
    s.mAcc += s.m; s.mCount++;
    if (s.mCount >= 12) { s.mh.push(s.mAcc / s.mCount); if (s.mh.length > 40) s.mh.shift(); s.mAcc = 0; s.mCount = 0; }
    if (s.clock <= 0.5) {
      s.clock = 0;
      const tied = s.score[0] === s.score[1];
      if (s.q >= 4 && !tied) {
        s.phase = 'FT';
        const w = s.score[0] > s.score[1] ? 0 : 1;
        emit?.incident('end', `Final: ${s.t[0].short} ${s.score[0]}–${s.score[1]} ${s.t[1].short}. ${s.t[w].name} win${s.q > 4 ? ' in overtime' : ''}`, { clock: 'Final', major: true });
        return;
      }
      s.phase = 'BREAK';
      s.breakLeft = s.q === 2 ? 150 : 60;
      emit?.incident('period', s.q >= 4 && tied ? `Tied ${s.score[0]}–${s.score[1]} at the buzzer. We're going to overtime` : `End of ${s.q === 2 ? 'first half' : `Q${s.q}`}: ${s.t[0].short} ${s.score[0]}–${s.score[1]} ${s.t[1].short}`, { clock: clockLabel(s) });
      emit?.key();
    }
  }
}

// ── markets ──
type BDef = MarketDef<BasketballState, BasketballFinal>;

function expectedRemaining(s: BasketballState): [number, number] {
  const qLeft = s.phase === 'PRE' ? 4 : Math.max(0, 4 - s.q);
  const secs = (s.phase === 'PRE' ? 0 : s.clock) + qLeft * s.qLen;
  const pace = (s.t[0].pace + s.t[1].pace) / 200;
  const possEach = secs / ((s.euro ? 16.0 : 14.4) / pace) / 2;
  const base = s.euro ? 1.08 : 1.13;
  return [possEach * base * ppp(s, 0, false), possEach * base * ppp(s, 1, false)];
}

function topPlayers(s: BasketballState, i: Side, n: number) {
  return [...s.t[i].players].sort((a, b) => b.w - a.w).slice(0, n);
}

function marketKeys(s: BasketballState): string[] {
  if (s.phase === 'FT') return [];
  const [eh, ea] = expectedRemaining(s);
  const margin = s.score[0] - s.score[1] + eh - ea;
  const total = s.score[0] + s.score[1] + eh + ea;
  const sc = Math.round(-margin) + 0.5;
  const tc = Math.round(total) + 0.5;
  const keys = ['ml', `sp:${sc - 3}`, `sp:${sc}`, `sp:${sc + 3}`, `tot:${tc - 6}`, `tot:${tc}`, `tot:${tc + 6}`];
  if (s.q <= 4) keys.push(`q:${Math.max(1, s.phase === 'BREAK' ? s.q + 1 : s.q)}`);
  if (s.phase === 'PRE' || (s.q === 1 && s.phase === 'LIVE')) keys.push('h1');
  for (const r of RACES) if (s.firstTo[r] === null && s.score[0] < r - 4 && s.score[1] < r - 4) { keys.push(`race:${r}`); break; }
  // player points: lines fixed pre-match from expected share
  for (const i of [0, 1] as Side[]) {
    const tw = s.t[i].players.reduce((a, p) => a + p.w, 0);
    const teamExp = (s.euro ? 80 : 113) * (i === 0 ? 1.01 : 0.99);
    for (const p of topPlayers(s, i, 2)) {
      const L = Math.round(teamExp * (p.w / tw) * 0.94) + 0.5;
      keys.push(`pp:${i}:${p.name}:${L}`);
    }
  }
  return keys;
}

function def(key: string, s: BasketballState): BDef | null {
  const parts = key.split(':');
  const kind = parts[0];
  const [H, A] = [s.t[0].short, s.t[1].short];
  const live = (st: BasketballState) => st.phase !== 'FT';
  const win = (sc: [number, number]): Side => (sc[0] > sc[1] ? 0 : 1);
  switch (kind) {
    case 'ml':
      return {
        key, name: 'Moneyline (incl. overtime)', group: 'Main', order: 1, margin: 0.045,
        sels: [{ code: '1', label: s.t[0].name }, { code: '2', label: s.t[1].name }], open: live,
        settle: (f) => (win(f.score) === 0 ? { '1': 'WON', '2': 'LOST' } : { '1': 'LOST', '2': 'WON' }),
      };
    case 'sp': {
      const L = Number(parts[1]);
      return {
        key, name: `Spread ${H} ${fmtLine(L, true)}`, group: 'Main', order: 2 + Math.abs(L) / 100, line: L, margin: 0.045,
        sels: [{ code: 'h', label: `${H} ${fmtLine(L, true)}` }, { code: 'a', label: `${A} ${fmtLine(-L, true)}` }], open: live,
        settle: (f) => (f.score[0] - f.score[1] + L > 0 ? { h: 'WON', a: 'LOST' } : { h: 'LOST', a: 'WON' }),
      };
    }
    case 'tot': {
      const L = Number(parts[1]);
      return {
        key, name: `Total points ${fmtLine(L)}`, group: 'Main', order: 3 + L / 10000, line: L, margin: 0.045,
        sels: [{ code: 'o', label: `Over ${fmtLine(L)}` }, { code: 'u', label: `Under ${fmtLine(L)}` }], open: live,
        settle: (f) => ou(f.score[0] + f.score[1] > L),
        early: (st) => (st.score[0] + st.score[1] > L ? ou(true) : null),
      };
    }
    case 'q': {
      const n = Number(parts[1]);
      return {
        key, name: `Quarter ${n} winner`, group: 'Quarters', order: 10 + n, margin: 0.06,
        sels: [{ code: '1', label: s.t[0].name }, { code: 'X', label: 'Tie' }, { code: '2', label: s.t[1].name }],
        open: (st) => st.phase === 'PRE' || st.q < n || (st.q === n && st.phase === 'LIVE'),
        settle: (f) => {
          const q = f.qs[n - 1] ?? [0, 0];
          const r = q[0] > q[1] ? '1' : q[1] > q[0] ? '2' : 'X';
          return { '1': r === '1' ? 'WON' : 'LOST', X: r === 'X' ? 'WON' : 'LOST', '2': r === '2' ? 'WON' : 'LOST' };
        },
        early: (st) => {
          if (st.q > n || (st.q === n && st.phase !== 'LIVE')) {
            const q = st.qs[n - 1] ?? [0, 0];
            const r = q[0] > q[1] ? '1' : q[1] > q[0] ? '2' : 'X';
            return { '1': r === '1' ? 'WON' : 'LOST', X: r === 'X' ? 'WON' : 'LOST', '2': r === '2' ? 'WON' : 'LOST' };
          }
          return null;
        },
      };
    }
    case 'h1':
      return {
        key, name: '1st half winner', group: 'Quarters', order: 9, margin: 0.06,
        sels: [{ code: '1', label: s.t[0].name }, { code: 'X', label: 'Tie' }, { code: '2', label: s.t[1].name }],
        open: (st) => st.phase === 'PRE' || st.q <= 1,
        settle: (f) => {
          const h = (f.qs[0]?.[0] ?? 0) + (f.qs[1]?.[0] ?? 0);
          const a = (f.qs[0]?.[1] ?? 0) + (f.qs[1]?.[1] ?? 0);
          const r = h > a ? '1' : a > h ? '2' : 'X';
          return { '1': r === '1' ? 'WON' : 'LOST', X: r === 'X' ? 'WON' : 'LOST', '2': r === '2' ? 'WON' : 'LOST' };
        },
      };
    case 'race': {
      const n = Number(parts[1]);
      return {
        key, name: `Race to ${n} points`, group: 'Specials', order: 30 + n / 100, margin: 0.06,
        sels: [{ code: '1', label: s.t[0].name }, { code: '2', label: s.t[1].name }],
        open: (st) => live(st) && st.firstTo[n] === null,
        settle: (f) => ({ '1': f.firstTo[n] === 0 ? 'WON' : 'LOST', '2': f.firstTo[n] === 1 ? 'WON' : 'LOST' }),
        early: (st) => (st.firstTo[n] === null ? null : { '1': st.firstTo[n] === 0 ? 'WON' : 'LOST', '2': st.firstTo[n] === 1 ? 'WON' : 'LOST' }),
      };
    }
    case 'pp': {
      const side = Number(parts[1]) as Side;
      const name = parts[2];
      const L = Number(parts[3]);
      const k = `${side}:${name}`;
      return {
        key, name: `${name} points ${fmtLine(L)}`, group: 'Players', order: 50 + side, line: L, margin: 0.08,
        sels: [{ code: 'o', label: `Over ${fmtLine(L)}` }, { code: 'u', label: `Under ${fmtLine(L)}` }], open: live,
        settle: (f) => ou((f.pts[k] ?? 0) > L),
        early: (st) => ((st.pts[k] ?? 0) > L ? ou(true) : null),
      };
    }
  }
  return null;
}

export const basketball: SportModule<BasketballState, BasketballFinal> = {
  sport: 'basketball',
  nominal: 2880 + 270,
  kickoff(s, rng, emit) {
    s.latent = { form: [normal(rng, 0, 0.045), normal(rng, 0, 0.045)], pace: normal(rng, 0, 0.05) };
    emit.incident('start', `Tip-off: ${s.t[0].name} v ${s.t[1].name}`, { clock: s.euro ? 'Q1 10:00' : 'Q1 12:00' });
  },
  clone(s) {
    const c2 = (x: [number, number]) => [x[0], x[1]] as [number, number];
    return {
      ...s, score: c2(s.score), qs: s.qs.map(c2), pts: { ...s.pts }, firstTo: { ...s.firstTo }, run: { ...s.run },
      st: { fgm: c2(s.st.fgm), fga: c2(s.st.fga), tpm: c2(s.st.tpm), tpa: c2(s.st.tpa), ftm: c2(s.st.ftm), fta: c2(s.st.fta), reb: c2(s.st.reb), to: c2(s.st.to), fouls: c2(s.st.fouls) },
      mh: [...s.mh], said: [], latent: { form: c2(s.latent.form), pace: s.latent.pace },
    };
  },
  neutral(s) {
    const c = basketball.clone(s);
    c.latent = { form: [0, 0], pace: 0 };
    return c;
  },
  step(s, dt, rng, emit) {
    stepBb(s, dt, rng, emit, emit !== null);
  },
  finished: (s) => s.phase === 'FT',
  final: (s) => ({ score: [s.score[0], s.score[1]], qs: s.qs.map((q) => [q[0], q[1]] as [number, number]), pts: { ...s.pts }, firstTo: { ...s.firstTo } }),
  view(s): View {
    const st = s.st;
    const pct = (m: number, a: number) => (a ? (m / a) * 100 : 0);
    const totalSecs = 4 * s.qLen;
    const played = s.phase === 'PRE' ? 0 : Math.min(totalSecs, (Math.min(s.q, 4) - 1) * s.qLen + (s.q <= 4 ? s.qLen - s.clock : s.qLen));
    return {
      clock: clockLabel(s),
      period: s.phase === 'PRE' ? 'Pre-game' : s.phase === 'FT' ? 'Final' : s.q <= 4 ? `Quarter ${s.q}` : 'Overtime',
      score: [s.score[0], s.score[1]],
      lines: s.qs.map((q, i) => ({ label: i < 4 ? `Q${i + 1}` : `OT${i > 4 ? i - 3 : ''}`, home: String(q[0]), away: String(q[1]) })),
      stats: [
        { key: 'fg', label: 'Field goal %', home: pct(st.fgm[0], st.fga[0]), away: pct(st.fgm[1], st.fga[1]), fmt: 'pct' },
        { key: 'tp', label: '3-pointers made', home: st.tpm[0], away: st.tpm[1] },
        { key: 'tpp', label: '3-point %', home: pct(st.tpm[0], st.tpa[0]), away: pct(st.tpm[1], st.tpa[1]), fmt: 'pct' },
        { key: 'ft', label: 'Free throws', home: st.ftm[0], away: st.ftm[1] },
        { key: 'reb', label: 'Rebounds', home: st.reb[0], away: st.reb[1] },
        { key: 'to', label: 'Turnovers', home: st.to[0], away: st.to[1] },
        { key: 'run', label: 'Current run', home: s.run.side === 0 ? s.run.pts : 0, away: s.run.side === 1 ? s.run.pts : 0 },
      ],
      momentum: s.m,
      pressure: clamp(0.3 + Math.abs(s.m) * 0.5 + s.run.pts / 30, 0, 1),
      progress: s.phase === 'FT' ? 1 : played / totalSecs,
    };
  },
  marketKeys,
  def,
  winner: (f) => (f.score[0] > f.score[1] ? 0 : 1),
  history: (s) => [...s.mh, s.mCount ? s.mAcc / s.mCount : s.m],
};

export type { Settled };

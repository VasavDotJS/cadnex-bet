/**
 * The engine owns every match. It schedules fixtures, runs live simulations tick by tick,
 * derives prices from current state, suspends markets on key events and settles them from
 * the final state. It is environment-agnostic: the worker (or a main-thread fallback) drives it.
 */
import { LEAGUES, TENNIS_EVENTS, TENNIS_VENUES, ESPORTS_EVENTS, venueFor } from '../data/leagues';
import type { League, SportId } from '../data/types';
import type { LegResult } from '../lib/money';
import { roundOdds } from '../lib/odds';
import { createFastRng, cryptoRng, pick, randInt, uniform } from '../lib/rng';
import { MODULES, createState, participant } from './registry';
import { Emit, MarketDef, Tally, addResult, emptyTally, fairOddsFromTally } from './sport';
import type { EngineSettings, EngineSnapshot, EventPublic, EventStatus, Incident, Market, Participant, Side } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = MarketDef<any, any>;

export interface EngineEvent {
  id: string;
  sport: SportId;
  leagueId: string;
  game?: League['game'];
  home: Participant;
  away: Participant;
  startTime: number;
  venue: string;
  round: string;
  rolling: boolean;
  status: EventStatus;
  state: unknown;
  incidents: Incident[];
  markets: Market[];
  suspendedUntil: number;
  priced: number;
  lastStep: number;
  endedAt?: number;
  result?: { winner: Side | null; void?: boolean; note?: string };
  seq: number;
  mv: number; // markets version
  // runtime only
  defs?: Map<string, AnyDef>;
  postedMv?: number;
}

const LIVE_REPRICE: Record<SportId, number> = { football: 1500, basketball: 2500, tennis: 2500, cricket: 2500, esports: 3000 };
const MC_RUNS_LIVE = 360;
const MC_RUNS_PRE_NEAR = 600;
const MC_RUNS_PRE_FAR = 220;
const FINISHED_KEEP_MS = 4 * 3600_000;

/** Gap between rolling fixtures per league, in minutes at the default 10-minute speed. */
const GAP: Record<string, number> = {
  epl: 8, laliga: 11, seriea: 12, bundesliga: 13, ligue1: 15, ucl: 16, isl: 20,
  nba: 10, euroleague: 17, atp: 7, wta: 7, ipl: 18, t20i: 24, cs2: 12, lol: 15, valorant: 14,
};
const SPORT_FACTOR: Record<SportId, number> = { football: 1, basketball: 1, tennis: 1, cricket: 1.25, esports: 1.2 };

let idCounter = 0;
function newId(prefix: string): string {
  const r = new Uint32Array(2);
  crypto.getRandomValues(r);
  return `${prefix}-${(r[0] >>> 0).toString(36)}${(idCounter++).toString(36)}`;
}

export class Engine {
  events = new Map<string, EngineEvent>();
  settings: EngineSettings = { speedMinutes: 10 };
  focus: string | null = null;
  private fast = createFastRng();
  private busy = new Map<string, number>(); // team key → busy until
  private lastPrune = 0;
  private lastFuture = 0;

  // ── timing ──
  compression(sport: SportId): number {
    const sp = this.settings.speedMinutes;
    if (!sp) return 1;
    return MODULES[sport].nominal / (sp * 60 * SPORT_FACTOR[sport]);
  }
  durationMs(sport: SportId): number {
    const sp = this.settings.speedMinutes;
    const minutes = sp ? sp * SPORT_FACTOR[sport] : MODULES[sport].nominal / 60;
    return minutes * 60_000 * 1.08;
  }
  private gapMs(leagueId: string): number {
    const sp = this.settings.speedMinutes || 100;
    return GAP[leagueId] * 60_000 * (sp / 10);
  }

  // ── lifecycle ──
  init(snapshot: EngineSnapshot | null, settings: EngineSettings, now: number): void {
    this.settings = settings;
    if (snapshot) {
      for (const raw of snapshot.events as EngineEvent[]) {
        const ev: EngineEvent = { ...raw, defs: undefined, postedMv: undefined };
        this.events.set(ev.id, ev);
        if (ev.status !== 'FINISHED') this.markBusy(ev);
      }
      // catch up everything that happened while the app was closed
      for (const ev of this.events.values()) this.advance(ev, now);
    }
    this.schedule(now, !snapshot || this.events.size === 0);
    for (const ev of this.events.values()) this.advance(ev, now);
    for (const ev of this.events.values()) {
      this.sync(ev, now);
      if (ev.status === 'LIVE') this.price(ev, now);
    }
  }

  setSettings(s: EngineSettings): void {
    this.settings = s;
  }

  // ── scheduling ──
  private markBusy(ev: EngineEvent): void {
    const until = ev.startTime + this.durationMs(ev.sport) + 120_000;
    for (const p of [ev.home, ev.away]) {
      const k = `${ev.sport}:${p.id}`;
      this.busy.set(k, Math.max(this.busy.get(k) ?? 0, until));
    }
  }

  private freeTeams(league: League, start: number): string[] {
    return league.teams.filter((id) => (this.busy.get(`${league.sport}:${id}`) ?? 0) < start - 60_000);
  }

  private roundLabel(league: League): string {
    switch (league.sport) {
      case 'football':
        return league.id === 'ucl' ? `League phase · Matchday ${randInt(cryptoRng, 3, 8)}` : `Matchday ${randInt(cryptoRng, 8, 14)}`;
      case 'basketball':
        return league.id === 'nba' ? 'Regular season' : `Round ${randInt(cryptoRng, 6, 14)}`;
      case 'tennis':
        return `${pick(cryptoRng, TENNIS_EVENTS)} · ${pick(cryptoRng, ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final'])}`;
      case 'cricket':
        return league.id === 'ipl' ? `Match ${randInt(cryptoRng, 12, 60)}` : `T20I series · Match ${randInt(cryptoRng, 1, 5)}`;
      case 'esports':
        return `${pick(cryptoRng, ESPORTS_EVENTS[league.game!])} · Best of 3`;
    }
  }

  private createFixture(league: League, start: number, homeId: string, awayId: string, rolling: boolean): EngineEvent {
    const id = newId(league.id);
    const ev: EngineEvent = {
      id, sport: league.sport, leagueId: league.id, game: league.game,
      home: participant(league.sport, homeId), away: participant(league.sport, awayId),
      startTime: start,
      venue: league.sport === 'tennis' ? pick(cryptoRng, TENNIS_VENUES) : league.sport === 'esports' ? 'Online' : venueFor(league.sport, homeId),
      round: this.roundLabel(league), rolling,
      status: 'SCHEDULED', state: createState(league, homeId, awayId, cryptoRng),
      incidents: [], markets: [], suspendedUntil: 0, priced: 0, lastStep: start, seq: 0, mv: 0,
    };
    this.events.set(id, ev);
    this.markBusy(ev);
    return ev;
  }

  private pickPair(league: League, start: number, exclude: Set<string>): [string, string] | null {
    const free = this.freeTeams(league, start).filter((t) => !exclude.has(t));
    if (free.length < 2) return null;
    const i = Math.floor(cryptoRng.next() * free.length);
    let j = Math.floor(cryptoRng.next() * (free.length - 1));
    if (j >= i) j++;
    return [free[i], free[j]];
  }

  schedule(now: number, backfill: boolean): void {
    for (const league of LEAGUES) {
      const gap = this.gapMs(league.id);
      const dur = this.durationMs(league.sport);
      const rolling = [...this.events.values()].filter((e) => e.leagueId === league.id && e.rolling);
      let last = rolling.reduce((m, e) => Math.max(m, e.startTime), 0);
      if (backfill && rolling.length === 0) {
        // seed: a couple of finished matches, some in progress, the rest upcoming
        last = now - dur - gap * 2.2;
      }
      if (last < now - dur - gap * 3) last = now - gap * uniform(cryptoRng, 0.2, 0.9);
      const horizon = now + Math.max(75 * 60_000, gap * 6);
      let guard = 0;
      while (last < horizon && guard++ < 40) {
        const start = last + gap * uniform(cryptoRng, 0.75, 1.25);
        const pair = this.pickPair(league, start, new Set());
        if (pair) {
          const [h, a] = cryptoRng.next() < 0.5 ? pair : [pair[1], pair[0]];
          this.createFixture(league, Math.round(start / 1000) * 1000, h, a, true);
        }
        last = start;
      }
    }
    this.scheduleFuture(now);
  }

  /** Fixtures for the next six days at realistic local kickoff times. */
  private scheduleFuture(now: number): void {
    if (now - this.lastFuture < 10 * 60_000) return;
    this.lastFuture = now;
    const day0 = new Date(now);
    day0.setHours(0, 0, 0, 0);
    for (let d = 1; d <= 6; d++) {
      const dayStart = day0.getTime() + d * 86_400_000;
      for (const league of LEAGUES) {
        const existing = [...this.events.values()].filter((e) => e.leagueId === league.id && !e.rolling && e.startTime >= dayStart && e.startTime < dayStart + 86_400_000);
        if (existing.length) continue;
        const used = new Set<string>();
        for (const slot of league.slots) {
          const start = dayStart + slot * 3_600_000;
          const free = league.teams.filter((t) => !used.has(t));
          if (free.length < 2) break;
          const i = Math.floor(cryptoRng.next() * free.length);
          let j = Math.floor(cryptoRng.next() * (free.length - 1));
          if (j >= i) j++;
          used.add(free[i]);
          used.add(free[j]);
          this.createFixture(league, start, free[i], free[j], false);
        }
      }
    }
  }

  private prune(now: number): string[] {
    const removed: string[] = [];
    const finished = [...this.events.values()].filter((e) => e.status === 'FINISHED').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    finished.forEach((e, i) => {
      if ((e.endedAt ?? 0) < now - FINISHED_KEEP_MS || i >= 80) {
        this.events.delete(e.id);
        removed.push(e.id);
      }
    });
    return removed;
  }

  // ── simulation ──
  private emitter(ev: EngineEvent, now: number): Emit {
    const mod = MODULES[ev.sport];
    return {
      incident: (kind, text, opts) => {
        ev.incidents.push({
          id: `${ev.id}#${ev.seq++}`, at: now, clock: opts?.clock ?? mod.view(ev.state).clock, kind, text, side: opts?.side, major: opts?.major,
        });
        if (ev.incidents.length > 90) ev.incidents.splice(0, ev.incidents.length - 90);
      },
      key: () => {
        ev.suspendedUntil = Math.max(ev.suspendedUntil, now + uniform(cryptoRng, 3000, 8000));
      },
    };
  }

  /** Start and step an event up to `now`. Returns true if anything changed. */
  advance(ev: EngineEvent, now: number): boolean {
    const mod = MODULES[ev.sport];
    if (ev.status === 'FINISHED') return false;
    if (ev.status === 'SCHEDULED') {
      if (now < ev.startTime) return false;
      ev.status = 'LIVE';
      ev.lastStep = ev.startTime;
      mod.kickoff(ev.state, cryptoRng, this.emitter(ev, Math.min(now, ev.startTime)));
    }
    const dt = Math.max(0, now - ev.lastStep);
    if (dt <= 0) return false;
    ev.lastStep = now;
    // step in ≤ 1s slices so incident timestamps stay close to when they happen
    const comp = this.compression(ev.sport);
    let t = now - dt;
    while (t < now && !mod.finished(ev.state)) {
      const slice = Math.min(1000, now - t);
      t += slice;
      mod.step(ev.state, (slice / 1000) * comp, cryptoRng, this.emitter(ev, t));
    }
    if (mod.finished(ev.state)) this.finish(ev, now);
    return true;
  }

  private def(ev: EngineEvent, key: string): AnyDef | null {
    if (!ev.defs) ev.defs = new Map();
    let d = ev.defs.get(key);
    if (!d) {
      d = MODULES[ev.sport].def(key, ev.state) ?? undefined;
      if (d) ev.defs.set(key, d);
    }
    return d ?? null;
  }

  private settleMarket(ev: EngineEvent, m: Market, res: Record<string, LegResult>): void {
    let allVoid = true;
    for (const s of m.selections) {
      s.result = res[s.code] ?? 'LOST';
      if (s.result !== 'VOID' && s.result !== 'PUSH') allVoid = false;
    }
    m.status = allVoid ? 'VOID' : 'SETTLED';
    m.closed = true;
    ev.mv++;
  }

  private finish(ev: EngineEvent, now: number): void {
    const mod = MODULES[ev.sport];
    ev.status = 'FINISHED';
    ev.endedAt = now;
    const f = mod.final(ev.state);
    const voided = mod.voided?.(f) ?? false;
    ev.result = { winner: mod.winner(f), void: voided };
    // markets that were never created can't have bets; settle every existing one
    this.ensureMarkets(ev);
    for (const m of ev.markets) {
      if (m.status === 'SETTLED' || m.status === 'VOID') continue;
      const d = this.def(ev, m.key);
      if (d) this.settleMarket(ev, m, d.settle(f));
    }
  }

  private ensureMarkets(ev: EngineEvent): void {
    if (ev.status === 'FINISHED') return;
    const mod = MODULES[ev.sport];
    const have = new Set(ev.markets.map((m) => m.key));
    for (const key of mod.marketKeys(ev.state)) {
      if (have.has(key)) continue;
      const d = this.def(ev, key);
      if (!d) continue;
      ev.markets.push({
        id: `${ev.id}|${key}`, eventId: ev.id, key, name: d.name, group: d.group, line: d.line, order: d.order,
        status: 'SUSPENDED', selections: d.sels.map((s) => ({ id: `${ev.id}|${key}|${s.code}`, code: s.code, label: s.label, odds: 0, prevOdds: 0, fair: 0, result: 'PENDING' })),
      });
      ev.mv++;
    }
  }

  /** Create new markets, settle decided ones, open/close/suspend the rest. */
  sync(ev: EngineEvent, now: number): void {
    if (ev.status === 'FINISHED') return;
    this.ensureMarkets(ev);
    const mod = MODULES[ev.sport];
    const current = new Set(mod.marketKeys(ev.state));
    // stay suspended until a fresh price has been computed after the key event
    const suspended = now < ev.suspendedUntil || (ev.status === 'LIVE' && ev.priced < ev.suspendedUntil);
    for (const m of ev.markets) {
      if (m.status === 'SETTLED' || m.status === 'VOID') continue;
      const d = this.def(ev, m.key);
      if (!d) continue;
      const early = d.early?.(ev.state);
      if (early) { this.settleMarket(ev, m, early); continue; }
      const closed = !current.has(m.key) || !d.open(ev.state);
      const priced = m.selections.some((s) => s.odds > 0);
      const status = closed || suspended || !priced ? 'SUSPENDED' : 'OPEN';
      if (status !== m.status || closed !== !!m.closed) {
        m.status = status;
        m.closed = closed;
        ev.mv++;
      }
    }
  }

  // ── pricing ──
  price(ev: EngineEvent, now: number): void {
    if (ev.status === 'FINISHED') return;
    const mod = MODULES[ev.sport];
    this.ensureMarkets(ev);
    const markets = ev.markets.filter((m) => !m.closed && m.status !== 'SETTLED' && m.status !== 'VOID');
    const defs = markets.map((m) => this.def(ev, m.key)).filter((d): d is AnyDef => !!d);
    if (!defs.length) { ev.priced = now; return; }
    let tallies: Map<string, Record<string, Tally>>;
    if (mod.price) tallies = mod.price(mod.neutral(ev.state), defs);
    else {
      tallies = new Map();
      for (const d of defs) {
        const t: Record<string, Tally> = {};
        for (const s of d.sels) t[s.code] = emptyTally();
        tallies.set(d.key, t);
      }
      const runs = ev.status === 'LIVE' ? MC_RUNS_LIVE : ev.startTime - now < 3_600_000 ? MC_RUNS_PRE_NEAR : MC_RUNS_PRE_FAR;
      const base = mod.neutral(ev.state);
      for (let r = 0; r < runs; r++) {
        const c = mod.clone(base);
        mod.step(c, 1e9, this.fast, null);
        const f = mod.final(c);
        for (const d of defs) {
          const res = d.settle(f);
          const t = tallies.get(d.key)!;
          for (const code in res) if (t[code]) addResult(t[code], res[code]);
        }
      }
    }
    const smooth = !mod.price && ev.status === 'LIVE' && ev.priced > ev.suspendedUntil;
    let changed = false;
    for (const m of markets) {
      const t = tallies.get(m.key);
      const d = this.def(ev, m.key);
      if (!t || !d) continue;
      for (const s of m.selections) {
        const tal = t[s.code];
        if (!tal) continue;
        const fairOdds = fairOddsFromTally(tal);
        let q = isFinite(fairOdds) ? 1 / fairOdds : 0;
        if (smooth && s.fair > 0) q = 0.55 * q + 0.45 * s.fair;
        // MC can't see outcomes rarer than ~1/runs; floor them at a long price
        if (q < 0.0015 && !mod.price) q = 0.0015;
        s.fair = q;
        const offered = q > 0 ? roundOdds(1 / (q * (1 + d.margin))) : 0;
        const locked = q <= 0.0004 || q >= 0.97 || offered <= 1.01;
        if (offered !== s.odds || locked !== !!s.locked) {
          if (s.odds > 0 && offered !== s.odds) s.prevOdds = s.odds;
          else if (!s.odds) s.prevOdds = offered;
          s.odds = locked ? s.odds || offered : offered;
          s.locked = locked;
          changed = true;
        }
      }
    }
    if (changed) ev.mv++;
    ev.priced = now;
    this.sync(ev, now);
  }

  // ── main loop ──
  /** Advance everything; returns ids of events whose public view changed, and removed ids. */
  tick(now: number, budgetMs = 30): { changed: Set<string>; removed: string[] } {
    const changed = new Set<string>();
    for (const ev of this.events.values()) {
      const wasSusp = now < ev.suspendedUntil;
      if (this.advance(ev, now) || ev.status === 'LIVE') changed.add(ev.id);
      if (ev.status === 'LIVE') {
        const mvBefore = ev.mv;
        this.sync(ev, now);
        if (ev.mv !== mvBefore) changed.add(ev.id);
        if (wasSusp !== now < ev.suspendedUntil) changed.add(ev.id);
      }
    }
    // pricing within a time budget: focus first, then live, then upcoming
    const t0 = performance.now();
    const queue = [...this.events.values()].filter((ev) => {
      if (ev.status === 'FINISHED') return false;
      if (ev.status === 'LIVE') {
        if (now < ev.suspendedUntil) return false;
        return ev.priced < ev.suspendedUntil || now - ev.priced >= LIVE_REPRICE[ev.sport] * (ev.id === this.focus ? 0.7 : 1);
      }
      if (!ev.priced) return true;
      return ev.startTime - now < 3_600_000 && now - ev.priced > 60_000;
    });
    queue.sort((a, b) => rank(a, this.focus) - rank(b, this.focus) || a.startTime - b.startTime);
    for (const ev of queue) {
      if (performance.now() - t0 > budgetMs) break;
      const before = ev.mv;
      this.price(ev, now);
      if (ev.mv !== before) changed.add(ev.id);
    }
    let removed: string[] = [];
    if (now - this.lastPrune > 30_000) {
      this.lastPrune = now;
      removed = this.prune(now);
      const n = this.events.size;
      this.schedule(now, false);
      if (this.events.size !== n) for (const ev of this.events.values()) if (!ev.priced) changed.add(ev.id);
    }
    return { changed, removed };
  }

  // ── views and persistence ──
  view(ev: EngineEvent, includeMarkets: boolean): EventPublic {
    const mod = MODULES[ev.sport];
    const v = mod.view(ev.state);
    return {
      id: ev.id, sport: ev.sport, leagueId: ev.leagueId, game: ev.game, home: ev.home, away: ev.away, startTime: ev.startTime, status: ev.status,
      venue: ev.venue, round: ev.round,
      clock: ev.status === 'SCHEDULED' ? '' : v.clock,
      period: v.period, score: v.score, scoreText: v.scoreText, lines: v.lines, stats: v.stats,
      incidents: ev.status === 'SCHEDULED' ? [] : ev.incidents.slice(-60).reverse(),
      momentum: v.momentum, momentumHistory: ev.status === 'SCHEDULED' ? [] : mod.history(ev.state), pressure: v.pressure, serving: v.serving,
      progress: ev.status === 'SCHEDULED' ? 0 : v.progress,
      suspendedUntil: ev.suspendedUntil, result: ev.result, endedAt: ev.endedAt,
      markets: includeMarkets ? ev.markets.map((m) => ({ ...m, selections: m.selections.map((s) => ({ ...s })) })) : [],
      updatedAt: ev.mv,
    };
  }

  snapshot(now: number): EngineSnapshot {
    const events: unknown[] = [];
    for (const ev of this.events.values()) {
      const { defs: _d, postedMv: _p, ...rest } = ev;
      void _d; void _p;
      // future fixtures re-price on load; keep their markets out of storage
      events.push(ev.status === 'SCHEDULED' && ev.startTime - now > 3_600_000 ? { ...rest, markets: [], priced: 0, mv: 0 } : rest);
    }
    return { savedAt: now, events };
  }
}

function rank(ev: EngineEvent, focus: string | null): number {
  if (ev.id === focus) return 0;
  if (ev.status === 'LIVE') return 1;
  if (!ev.priced) return 2;
  return 3;
}

/**
 * The live engine. It holds every real match the feed reports, keeps a little memory per
 * match (pre-match strengths, goal order, momentum), prices markets from the real state,
 * suspends betting around key moments or when data goes stale, and settles markets from
 * real results. It never invents a score.
 */
import { fairOddsFromTally } from '../engine/sport';
import type { EventPublic, Incident, IncidentKind, Market, ScoreLine, Side, StatRow } from '../engine/types';
import { parseMinute } from '../feed/espn';
import type { FeedEvent } from '../feed/types';
import { roundOdds } from '../lib/odds';
import { basketballModel, remainingFraction } from './basketball';
import { cricketModel } from './cricket';
import { footballModel, minuteOf } from './football';
import { clamp, Memory, Model, newMemory } from './model';
import { setsState, tennisModel } from './tennis';

export const MODELS: Record<string, Model> = {
  football: footballModel,
  basketball: basketballModel,
  tennis: tennisModel,
  cricket: cricketModel,
};

const SUSPEND_GOAL = 15_000;
const SUSPEND_SMALL = 8_000;
const STALE_MS = 50_000;
const KEEP_FINISHED_MS = 36 * 3_600_000;

export interface LiveItem {
  feed: FeedEvent;
  mem: Memory;
  markets: Market[];
  suspendedUntil: number;
  mv: number;
  firstSeen: number;
  endedAt?: number;
  lastSeen: number;
  postedMv?: number;
}

function cricketWkts(ev: FeedEvent): number {
  return (ev.extra.cricket?.innings ?? []).reduce((a, i) => a + i.wkts, 0);
}

function inRegulation(ev: FeedEvent): boolean {
  if (/EXTRA|OVERTIME|SHOOTOUT|PENALT/.test(ev.statusName)) return false;
  const m = parseMinute(ev.clock);
  return !m?.extraTime;
}

/** Rebuild the goal order from the feed's incident list, if it agrees with the score. */
function goalsFromIncidents(ev: FeedEvent): (0 | 1)[] | null {
  const goals = ev.incidents.filter((i) => (i.kind === 'goal' || i.kind === 'penalty' || i.kind === 'owngoal') && i.side !== undefined && !i.extraTime);
  for (const flip of [false, true]) {
    const seq = goals.map((g) => ((g.kind === 'owngoal' && flip ? 1 - g.side! : g.side!) as 0 | 1));
    const h = seq.filter((s) => s === 0).length;
    if (h === ev.home.score && seq.length - h === ev.away.score) return seq;
  }
  return null;
}

export class LiveEngine {
  items = new Map<string, LiveItem>();
  tracked = new Set<string>();
  lastOk = 0;
  focus: string | null = null;

  stale(now: number): boolean {
    return now - this.lastOk > STALE_MS;
  }

  restore(raw: unknown[]): void {
    for (const r of raw as LiveItem[]) {
      if (!r?.feed?.id) continue;
      this.items.set(r.feed.id, { ...r, postedMv: undefined });
    }
  }

  snapshot(now: number): unknown[] {
    const out: unknown[] = [];
    for (const it of this.items.values()) {
      const keep = this.tracked.has(it.feed.id) || it.markets.length > 0 || it.feed.status === 'LIVE';
      if (!keep) continue;
      if (it.feed.status === 'FINISHED' && now - (it.endedAt ?? now) > 3 * 86_400_000 && !this.tracked.has(it.feed.id)) continue;
      const { postedMv: _p, ...rest } = it;
      void _p;
      out.push(rest);
    }
    return out;
  }

  /** Ingest a batch of events. Returns ids whose public view changed. */
  ingest(events: FeedEvent[], now: number, opts: { full?: boolean } = {}): { changed: Set<string>; removed: string[] } {
    const changed = new Set<string>();
    const seen = new Set<string>();
    for (const ev of events) {
      seen.add(ev.id);
      if (this.apply(ev, now)) changed.add(ev.id);
    }
    const removed: string[] = [];
    if (opts.full) {
      for (const [id, it] of this.items) {
        if (seen.has(id) || this.tracked.has(id)) continue;
        const old = it.feed.status === 'FINISHED' ? now - (it.endedAt ?? it.lastSeen) > KEEP_FINISHED_MS : now - it.lastSeen > 6 * 3_600_000;
        const hasOpen = it.markets.some((m) => m.status !== 'SETTLED' && m.status !== 'VOID');
        if (old && !hasOpen) {
          this.items.delete(id);
          removed.push(id);
        }
      }
    }
    return { changed, removed };
  }

  apply(incoming: FeedEvent, now: number): boolean {
    const model = MODELS[incoming.sport];
    if (!model) return false;
    let it = this.items.get(incoming.id);
    const first = !it;
    if (!it) {
      it = { feed: incoming, mem: newMemory(), markets: [], suspendedUntil: 0, mv: 1, firstSeen: now, lastSeen: now };
      this.items.set(incoming.id, it);
    }
    const prev = it.feed;
    // never move a finished match backwards on a stale response
    if (!first && prev.status === 'FINISHED' && incoming.status === 'LIVE') return false;
    const ev: FeedEvent = { ...incoming, leagueName: incoming.leagueName || prev.leagueName };
    if (!ev.incidents.length && prev.incidents.length && ev.sport === 'football') ev.incidents = prev.incidents;
    if (!Object.keys(ev.home.stats).length && Object.keys(prev.home.stats).length) {
      ev.home = { ...ev.home, stats: prev.home.stats };
      ev.away = { ...ev.away, stats: prev.away.stats };
    }
    const mem = it.mem;
    const before = JSON.stringify([prev.status, prev.clock, prev.detail, prev.home.score, prev.away.score, prev.home.lines, prev.away.lines, prev.home.scoreText, prev.away.scoreText, prev.incidents.length, prev.home.stats, prev.odds]);
    it.feed = ev;
    it.lastSeen = now;

    // pre-match strengths: follow the odds until kick-off, then freeze
    const preKey = JSON.stringify([ev.odds ?? null, ev.home.record, ev.away.record, ev.home.rank, ev.away.rank]);
    if (ev.status === 'SCHEDULED' ? mem.preKey !== preKey : !mem.pre) {
      mem.pre = model.prematch(ev);
      mem.preKey = preKey;
      it.mv++;
    }

    this.track(it, prev, first, now);

    if (ev.status === 'FINISHED' && !it.endedAt) it.endedAt = now;
    const marketsChanged = this.sync(it, model, now);
    const after = JSON.stringify([ev.status, ev.clock, ev.detail, ev.home.score, ev.away.score, ev.home.lines, ev.away.lines, ev.home.scoreText, ev.away.scoreText, ev.incidents.length, ev.home.stats, ev.odds]);
    if (before !== after || marketsChanged || first) {
      it.mv++;
      return true;
    }
    return false;
  }

  /** Goal order, suspensions, momentum and derived timeline entries. */
  private track(it: LiveItem, prev: FeedEvent, first: boolean, now: number): void {
    const ev = it.feed;
    const mem = it.mem;
    const h = ev.home.score, a = ev.away.score;
    const add = (kind: IncidentKind | string, text: string, side?: 0 | 1, major = false) => {
      mem.derived.unshift({ id: `${ev.id}#d${mem.seq++}`, at: now, clock: ev.clock || ev.detail, kind, side, text, major });
      if (mem.derived.length > 40) mem.derived.length = 40;
    };

    if (first) {
      mem.lastScore = [h, a];
      if (ev.sport === 'football') mem.goals = goalsFromIncidents(ev) ?? Array(h + a).fill(null);
    } else {
      if (prev.status === 'SCHEDULED' && ev.status === 'LIVE') {
        add('start', ev.sport === 'football' ? 'Kick-off' : ev.sport === 'basketball' ? 'Tip-off' : 'Match under way');
        it.suspendedUntil = now + SUSPEND_SMALL;
      }
      const [ph, pa] = mem.lastScore;
      const dh = h - ph, da = a - pa;
      if (dh || da) {
        if (ev.sport === 'football') {
          if (dh >= 0 && da >= 0 && dh + da === 1 && inRegulation(ev)) mem.goals.push(dh ? 0 : 1);
          else if (dh >= 0 && da >= 0 && inRegulation(ev)) {
            const rebuilt = goalsFromIncidents(ev);
            mem.goals = rebuilt ?? [...mem.goals, ...Array(dh + da).fill(null)];
          } else if (dh < 0 || da < 0) {
            // goal taken off (VAR or data correction)
            const rebuilt = goalsFromIncidents(ev);
            mem.goals = rebuilt ?? mem.goals.slice(0, h + a).map(() => null);
            add('nogoal', 'Score corrected by the data provider');
          }
          it.suspendedUntil = now + SUSPEND_GOAL;
          if (!ev.incidents.length && dh + da > 0) add('goal', `GOAL — ${dh ? ev.home.name : ev.away.name}. ${ev.home.short} ${h}–${a} ${ev.away.short}`, dh ? 0 : 1, true);
        } else if (ev.sport === 'tennis') {
          it.suspendedUntil = now + SUSPEND_SMALL;
        }
        mem.lastScore = [h, a];
      }
      if (ev.sport === 'football') {
        const r = (e: FeedEvent) => e.incidents.filter((i) => i.kind === 'red').length;
        if (r(ev) > r(prev)) it.suspendedUntil = now + SUSPEND_GOAL;
      }
      if (ev.sport === 'tennis') {
        const s0 = setsState(prev), s1 = setsState(ev);
        if (s1.winners.length > s0.winners.length) {
          const w = s1.winners[s1.winners.length - 1];
          const i = s1.winners.length - 1;
          add('set', `${w === 0 ? ev.home.name : ev.away.name} wins set ${i + 1}, ${ev.home.lines[i]}–${ev.away.lines[i]}`, w, true);
          it.suspendedUntil = now + SUSPEND_GOAL;
        } else if (JSON.stringify(s0.cur) !== JSON.stringify(s1.cur)) it.suspendedUntil = Math.max(it.suspendedUntil, now + SUSPEND_SMALL);
      }
      if (ev.sport === 'basketball' && /^end|half/i.test(ev.clock) && ev.clock !== prev.clock) {
        add('period', `${ev.clock}: ${ev.home.short} ${h}–${a} ${ev.away.short}`);
      }
      if (ev.sport === 'cricket' && cricketWkts(ev) > cricketWkts(prev)) {
        const side = ev.extra.cricket?.batting;
        add('wicket', `Wicket. ${side === 1 ? ev.away.short : ev.home.short} ${side === 1 ? ev.away.scoreText : ev.home.scoreText}`, side === undefined ? undefined : ((1 - side) as 0 | 1), true);
        it.suspendedUntil = now + SUSPEND_GOAL;
      }
      if (prev.status !== 'FINISHED' && ev.status === 'FINISHED') {
        const txt = ev.sport === 'cricket' ? ev.extra.note ?? 'Match finished' : `${ev.sport === 'football' ? 'Full-time' : 'Final'}: ${ev.home.name} ${h}–${a} ${ev.away.name}`;
        add('end', txt, undefined, true);
      }
      if (ev.status === 'POSTPONED' || ev.status === 'CANCELLED') {
        if (prev.status !== ev.status) add('void', `Match ${ev.status === 'POSTPONED' ? 'postponed' : 'cancelled'}. Bets are void.`);
      }
    }

    // momentum: recent movement in shots (football), points (basketball), games (tennis)
    if (ev.status === 'LIVE') {
      const sh = ev.sport === 'football' ? (ev.home.stats.shots ?? 0) + 2 * (ev.home.stats.sot ?? 0) : ev.sport === 'tennis' ? (setsState(ev).cur?.[0] ?? 0) : h;
      const sa = ev.sport === 'football' ? (ev.away.stats.shots ?? 0) + 2 * (ev.away.stats.sot ?? 0) : ev.sport === 'tennis' ? (setsState(ev).cur?.[1] ?? 0) : a;
      mem.recent.push({ at: now, h, a, sh, sa });
      mem.recent = mem.recent.filter((r) => now - r.at < 6 * 60_000);
      const o = mem.recent[0];
      let m = 0;
      if (ev.sport === 'football') {
        const d = (sh - o.sh) - (sa - o.sa) + 3 * ((h - o.h) - (a - o.a));
        const poss = ((ev.home.stats.possession ?? 50) - 50) / 50;
        m = Math.tanh(d / 4) * 0.8 + poss * 0.4;
      } else if (ev.sport === 'basketball') m = Math.tanh(((h - o.h) - (a - o.a)) / 8);
      else if (ev.sport === 'tennis') m = Math.tanh(((sh - o.sh) - (sa - o.sa)) / 2);
      mem.momentum = clamp(m, -1, 1);
      if (!mem.history.length || now - (mem.histAt ?? 0) > 30_000) {
        mem.history.push(mem.momentum);
        mem.histAt = now;
        if (mem.history.length > 40) mem.history.shift();
      }
    }
  }

  /** Create, close, settle and price markets. Returns true if anything changed. */
  private sync(it: LiveItem, model: Model, now: number): boolean {
    const ev = it.feed;
    let changed = false;
    const keys = new Set(model.keys(ev, it.mem));
    const have = new Set(it.markets.map((m) => m.key));
    for (const key of keys) {
      if (have.has(key)) continue;
      const s = model.spec(key, ev);
      if (!s) continue;
      it.markets.push({
        id: `${ev.id}|${key}`, eventId: ev.id, key, name: s.name, group: s.group, line: s.line, order: s.order, status: 'SUSPENDED',
        selections: s.sels.map((x) => ({ id: `${ev.id}|${key}|${x.code}`, code: x.code, label: x.label, odds: 0, prevOdds: 0, fair: 0, result: 'PENDING' })),
      });
      changed = true;
    }
    const voidAll = ev.status === 'POSTPONED' || ev.status === 'CANCELLED';
    const final = ev.status === 'FINISHED';
    const open: Market[] = [];
    for (const m of it.markets) {
      if (m.status === 'SETTLED' || m.status === 'VOID') continue;
      const closed = !keys.has(m.key);
      if (closed !== !!m.closed) { m.closed = closed; changed = true; }
      const res = voidAll ? null : model.settle(m.key, ev, it.mem, final);
      if (res || voidAll || final) {
        let allVoid = true;
        for (const s of m.selections) {
          s.result = res?.[s.code] ?? 'VOID';
          if (s.result !== 'VOID' && s.result !== 'PUSH') allVoid = false;
        }
        m.status = allVoid ? 'VOID' : 'SETTLED';
        m.closed = true;
        changed = true;
        continue;
      }
      if (!m.closed) open.push(m);
    }
    if (open.length && (ev.status === 'SCHEDULED' || ev.status === 'LIVE')) {
      const specs = open.map((m) => model.spec(m.key, ev)).filter((s): s is NonNullable<typeof s> => !!s);
      const probs = model.price(ev, it.mem, specs);
      for (const m of open) {
        const t = probs.get(m.key);
        const s = specs.find((x) => x.key === m.key);
        for (const sel of m.selections) {
          const tal = t?.[sel.code];
          const fair = tal ? fairOddsFromTally(tal) : Infinity;
          const q = isFinite(fair) ? 1 / fair : 0;
          const offered = q > 0 && s ? roundOdds(1 / (q * (1 + s.margin))) : 0;
          const locked = !tal || q < 0.003 || q > 0.97 || offered <= 1.01;
          if (offered !== sel.odds || locked !== !!sel.locked || Math.abs(sel.fair - q) > 1e-4) {
            if (sel.odds > 0 && offered && offered !== sel.odds) sel.prevOdds = sel.odds;
            else if (!sel.odds) sel.prevOdds = offered;
            sel.odds = locked ? sel.odds || offered : offered;
            sel.locked = locked;
            sel.fair = q;
            changed = true;
          }
        }
      }
    }
    if (this.statuses(it, now)) changed = true;
    return changed;
  }

  /** Open or suspend markets based on time, staleness and suspensions. */
  statuses(it: LiveItem, now: number): boolean {
    const ev = it.feed;
    let changed = false;
    const stale = this.stale(now) && ev.status === 'LIVE';
    const pastKickoff = ev.status === 'SCHEDULED' && now > ev.startTime - 30_000;
    for (const m of it.markets) {
      if (m.status === 'SETTLED' || m.status === 'VOID') continue;
      const priced = m.selections.some((s) => s.odds > 1 && !s.locked);
      const want = !m.closed && priced && !stale && !pastKickoff && now >= it.suspendedUntil && (ev.status === 'SCHEDULED' || ev.status === 'LIVE') ? 'OPEN' : 'SUSPENDED';
      if (m.status !== want) { m.status = want; changed = true; }
    }
    return changed;
  }

  /** Re-check suspensions and staleness without new data. */
  tick(now: number): Set<string> {
    const changed = new Set<string>();
    for (const it of this.items.values()) {
      if (it.feed.status !== 'LIVE' && it.feed.status !== 'SCHEDULED') continue;
      if (this.statuses(it, now)) { it.mv++; changed.add(it.feed.id); }
    }
    return changed;
  }

  // ── public view ──

  view(it: LiveItem, withMarkets: boolean): EventPublic {
    const ev = it.feed;
    const mem = it.mem;
    const live = ev.status === 'LIVE';
    const st = ev.sport === 'tennis' ? setsState(ev) : null;
    const score: [number, number] = st ? st.sets : [ev.home.score, ev.away.score];
    const lines: ScoreLine[] = [];
    if (ev.sport === 'basketball') {
      const n = Math.max(ev.home.lines.length, ev.away.lines.length);
      for (let i = 0; i < n; i++) lines.push({ label: i < 4 ? `Q${i + 1}` : `OT${i > 4 ? i - 3 : ''}`, home: String(ev.home.lines[i] ?? '–'), away: String(ev.away.lines[i] ?? '–') });
    } else if (ev.sport === 'tennis') {
      const n = Math.max(ev.home.lines.length, ev.away.lines.length);
      for (let i = 0; i < n; i++) {
        const tb = (x: (number | null)[] | undefined) => (x?.[i] !== null && x?.[i] !== undefined ? `⁽${x[i]}⁾` : '');
        lines.push({ label: `Set ${i + 1}`, home: `${ev.home.lines[i] ?? 0}${tb(ev.home.tiebreaks)}`, away: `${ev.away.lines[i] ?? 0}${tb(ev.away.tiebreaks)}` });
      }
    } else if (ev.sport === 'cricket') {
      for (const inn of ev.extra.cricket?.innings ?? []) {
        lines.push({ label: `${inn.side === 0 ? ev.home.short : ev.away.short} innings`, home: inn.side === 0 ? `${inn.runs}/${inn.wkts}${inn.overs !== undefined ? ` (${inn.overs})` : ''}` : '', away: inn.side === 1 ? `${inn.runs}/${inn.wkts}${inn.overs !== undefined ? ` (${inn.overs})` : ''}` : '' });
      }
    }
    const incidents: Incident[] = [
      ...ev.incidents.map((i) => ({
        // place feed incidents in time using their match minute (+15 min for half-time)
        id: `${ev.id}#${i.key}`, at: i.minute !== undefined ? ev.startTime + (i.minute + (i.minute > 45 ? 15 : 0)) * 60_000 : 0, clock: i.clock, side: i.side, text: i.text, major: i.kind === 'goal' || i.kind === 'penalty' || i.kind === 'owngoal' || i.kind === 'red',
        kind: (i.kind === 'owngoal' || i.kind === 'penalty' ? 'goal' : i.kind === 'misspen' ? 'save' : i.kind === 'sub' ? 'info' : i.kind) as IncidentKind,
      })),
      ...mem.derived.map((d) => ({ ...d, kind: d.kind as IncidentKind })),
    ];
    incidents.sort((x, y) => y.at - x.at);
    let progress = 0;
    if (ev.status === 'FINISHED') progress = 1;
    else if (live) {
      if (ev.sport === 'football') progress = clamp(minuteOf(ev) / 95, 0, 0.99);
      else if (ev.sport === 'basketball') progress = clamp(1 - remainingFraction(ev), 0, 0.99);
      else if (ev.sport === 'tennis' && st) progress = clamp((st.sets[0] + st.sets[1] + 0.5) / (ev.extra.bestOf ?? 3), 0, 0.99);
      else progress = clamp((ev.extra.cricket?.innings.length ?? 1) / 2 - 0.25, 0, 0.99);
    }
    const winner: Side | null = ev.status === 'FINISHED' ? (ev.home.winner ? 0 : ev.away.winner ? 1 : score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : null) : null;
    return {
      id: ev.id, sport: ev.sport, leagueId: ev.leagueId, leagueName: ev.leagueName, home: participant(ev.home), away: participant(ev.away),
      startTime: ev.startTime, status: ev.status === 'POSTPONED' || ev.status === 'CANCELLED' ? 'FINISHED' : ev.status,
      venue: ev.venue, round: ev.round, detail: ev.detail, priceSource: mem.pre ? String(mem.pre.src) : undefined,
      clock: live ? ev.clock || ev.detail || periodLabel(ev) : '',
      period: periodLabel(ev),
      score,
      scoreText: ev.sport === 'cricket' ? [ev.home.scoreText || (ev.status === 'SCHEDULED' ? '' : 'Yet to bat'), ev.away.scoreText || (ev.status === 'SCHEDULED' ? '' : 'Yet to bat')] : undefined,
      lines,
      stats: statRows(ev),
      incidents: incidents.slice(0, 60),
      momentum: mem.momentum,
      momentumHistory: [...mem.history],
      pressure: clamp(0.25 + Math.abs(mem.momentum) * 0.65, 0, 1),
      progress,
      suspendedUntil: it.suspendedUntil,
      result: ev.status === 'FINISHED' || ev.status === 'POSTPONED' || ev.status === 'CANCELLED' ? { winner, void: ev.status !== 'FINISHED' || !!ev.extra.retired, note: ev.extra.note ?? ev.detail } : undefined,
      endedAt: it.endedAt,
      markets: withMarkets ? it.markets.map((m) => ({ ...m, selections: m.selections.map((s) => ({ ...s })) })) : [],
      updatedAt: it.mv,
    };
  }
}

function participant(s: FeedEvent['home']) {
  return { id: s.id, name: s.name, short: s.short, colors: s.colors, logo: s.logo };
}

function periodLabel(ev: FeedEvent): string {
  if (ev.status === 'SCHEDULED') return 'Pre-match';
  if (ev.status === 'POSTPONED') return 'Postponed';
  if (ev.status === 'CANCELLED') return 'Cancelled';
  if (ev.status === 'FINISHED') {
    if (ev.sport === 'cricket') return ev.extra.note ?? 'Result';
    if (ev.extra.retired) return 'Retired';
    if (ev.extra.pens) return 'Final (penalties)';
    if (ev.extra.aet) return 'Final (extra time)';
    return ev.sport === 'football' ? 'Full-time' : 'Final';
  }
  if (ev.sport === 'football') {
    const n = ev.statusName;
    if (/HALFTIME/.test(n) || ev.clock === 'HT') return 'Half-time';
    if (/FIRST_HALF/.test(n) || ev.period === 1) return '1st half';
    if (/SECOND_HALF/.test(n) || ev.period === 2) return '2nd half';
    if (/EXTRA|OVERTIME/.test(n) || ev.period > 2) return 'Extra time';
    return 'In play';
  }
  if (ev.sport === 'basketball') return ev.period > 4 ? 'Overtime' : /half/i.test(ev.clock) ? 'Half-time' : `Quarter ${Math.max(1, ev.period)}`;
  if (ev.sport === 'tennis') {
    const st = setsState(ev);
    return `Set ${st.sets[0] + st.sets[1] + (st.cur ? 1 : 0) || 1}`;
  }
  return ev.extra.note ?? ev.detail ?? 'In play';
}

const STAT_LABEL: [string, string, StatRow['fmt']?][] = [
  ['possession', 'Possession', 'pct'], ['shots', 'Shots'], ['sot', 'On target'], ['corners', 'Corners'], ['fouls', 'Fouls'],
  ['yellow', 'Yellow cards'], ['red', 'Red cards'], ['offsides', 'Offsides'], ['saves', 'Saves'],
  ['fgpct', 'Field goal %', 'pct'], ['tppct', '3-point %', 'pct'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['tov', 'Turnovers'],
  ['aces', 'Aces'], ['dfs', 'Double faults'], ['breaks', 'Breaks'],
];

function statRows(ev: FeedEvent): StatRow[] {
  const out: StatRow[] = [];
  for (const [k, label, fmt] of STAT_LABEL) {
    const h = ev.home.stats[k];
    const a = ev.away.stats[k];
    if (h === undefined && a === undefined) continue;
    out.push({ key: k, label, home: h ?? 0, away: a ?? 0, fmt });
  }
  if (ev.sport === 'football' && !out.some((r) => r.key === 'yellow')) {
    const y = [0, 0];
    for (const i of ev.incidents) if (i.kind === 'yellow' && i.side !== undefined) y[i.side]++;
    if (y[0] || y[1]) out.push({ key: 'yellow', label: 'Yellow cards', home: y[0], away: y[1] });
  }
  return out;
}

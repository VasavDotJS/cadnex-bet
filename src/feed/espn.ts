/**
 * Turns ESPN public JSON into FeedEvents. ESPN's shapes vary a little between sports,
 * endpoints and seasons, so every read is defensive: a missing field degrades the
 * event (no odds, no stats) instead of dropping it.
 */
import type { League } from '../data/leagues';
import type { SportId } from '../data/types';
import { CricketInfo, eventKey, FeedEvent, FeedIncident, FeedIncidentKind, FeedOdds, FeedSide, FeedStatus } from './types';
import { cleanLogo } from '../lib/logo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const arr = (x: J): J[] => (Array.isArray(x) ? x : []);
const str = (x: J): string => (x === undefined || x === null ? '' : String(x));

export function num(x: J): number | null {
  if (typeof x === 'number') return isFinite(x) ? x : null;
  if (typeof x === 'string') {
    const m = x.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  return null;
}

function hex(c: J, fallback: string): string {
  const s = str(c).replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : fallback;
}

const PALETTE: [string, string][] = [
  ['#2E4A8B', '#FFFFFF'], ['#8B2E3C', '#F5D76E'], ['#1F6F5C', '#FFFFFF'], ['#5B3B8C', '#E8E1FF'], ['#B5652A', '#FFFFFF'],
  ['#2B2B33', '#B5F23D'], ['#126E82', '#FFFFFF'], ['#7A2E6E', '#FFFFFF'], ['#3D5A40', '#F0E6C8'], ['#A33B3B', '#FFFFFF'],
];

/** Stable colours for people (tennis players) or teams without colours. */
export function colorsFor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** American (or already-decimal) odds → decimal. */
export function toDecimal(v: J): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).trim().toUpperCase();
  if (s === 'EVEN' || s === 'EV') return 2;
  const n = Number(s.replace('+', ''));
  if (!isFinite(n) || n === 0) return undefined;
  if (n >= 100) return 1 + n / 100;
  if (n <= -100) return 1 + 100 / Math.abs(n);
  if (n > 1 && n < 100 && s.includes('.')) return n; // decimal already
  return undefined;
}

function mapStatus(type: J): { status: FeedStatus; name: string } {
  const name = str(type?.name).toUpperCase();
  const state = str(type?.state).toLowerCase();
  const desc = `${name} ${str(type?.description)} ${str(type?.detail)}`.toUpperCase();
  if (/POSTPON/.test(desc)) return { status: 'POSTPONED', name };
  if (/CANCEL|ABANDON|FORFEIT/.test(desc) && state !== 'in') return { status: 'CANCELLED', name };
  if (state === 'in') return { status: 'LIVE', name };
  if (state === 'post' || type?.completed === true) return { status: 'FINISHED', name };
  return { status: 'SCHEDULED', name };
}

const STAT_KEYS: Record<string, string> = {
  possessionpct: 'possession', possession: 'possession', totalshots: 'shots', shotsontarget: 'sot', shotsongoal: 'sot',
  woncorners: 'corners', corners: 'corners', foulscommitted: 'fouls', fouls: 'fouls', yellowcards: 'yellow', redcards: 'red',
  saves: 'saves', offsides: 'offsides', accuratepasses: 'passes',
  fieldgoalpct: 'fgpct', threepointfieldgoalpct: 'tppct', threepointpct: 'tppct', rebounds: 'reb', totalrebounds: 'reb', assists: 'ast', turnovers: 'tov', totalturnovers: 'tov',
  aces: 'aces', doublefaults: 'dfs', breakpointsconverted: 'breaks',
};

function stats(list: J): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of arr(list)) {
    const k = STAT_KEYS[str(s?.name).toLowerCase()] ?? STAT_KEYS[str(s?.abbreviation).toLowerCase()];
    const v = num(s?.displayValue ?? s?.value);
    if (k && v !== null && out[k] === undefined) out[k] = v;
  }
  return out;
}

function teamSide(c: J, sport: SportId): FeedSide {
  const t = c?.team ?? c?.athlete ?? c ?? {};
  const name = str(t.displayName ?? t.name ?? c?.displayName ?? 'TBD');
  const short = str(t.abbreviation ?? c?.abbreviation ?? t.shortDisplayName ?? name).slice(0, 4).toUpperCase();
  const fallback = colorsFor(name);
  const lines = arr(c?.linescores).map((l: J) => num(l?.value ?? l?.displayValue));
  const scoreRaw = c?.score;
  const scoreText = typeof scoreRaw === 'object' && scoreRaw !== null ? str(scoreRaw.displayValue ?? scoreRaw.value) : str(scoreRaw);
  return {
    id: str(t.id ?? c?.id ?? name),
    name,
    short: sport === 'tennis' ? name.split(' ').slice(-1)[0] : short,
    colors: [hex(t.color ?? c?.color, fallback[0]), hex(t.alternateColor ?? c?.alternateColor, fallback[1])],
    logo: sport === 'tennis' ? undefined : cleanLogo(t.logo ?? arr(t.logos)[0]?.href ?? c?.logo),
    score: num(scoreText) ?? 0,
    scoreText: sport === 'cricket' ? scoreText || undefined : undefined,
    winner: c?.winner === true ? true : undefined,
    lines,
    stats: stats(c?.statistics),
    record: str(arr(c?.records)[0]?.summary) || undefined,
    form: str(c?.form) || undefined,
  };
}

function orderSides(competitors: J[]): [J, J] | null {
  if (competitors.length < 2) return null;
  const home = competitors.find((c) => c?.homeAway === 'home');
  const away = competitors.find((c) => c?.homeAway === 'away');
  if (home && away) return [home, away];
  const sorted = [...competitors].sort((a, b) => (num(a?.order) ?? 0) - (num(b?.order) ?? 0));
  return [sorted[0], sorted[1]];
}

function parseOdds(o: J, homeShort: string): FeedOdds | undefined {
  if (!o) return undefined;
  const odds: FeedOdds = { provider: str(o.provider?.name) || undefined };
  odds.home = toDecimal(o.homeTeamOdds?.moneyLine ?? o.moneyline?.home?.close?.odds ?? o.moneyline?.home?.open?.odds);
  odds.away = toDecimal(o.awayTeamOdds?.moneyLine ?? o.moneyline?.away?.close?.odds ?? o.moneyline?.away?.open?.odds);
  odds.draw = toDecimal(o.drawOdds?.moneyLine ?? o.moneyline?.draw?.close?.odds ?? o.moneyline?.draw?.open?.odds);
  const total = num(o.overUnder) ?? num(o.total?.over?.close?.line) ?? num(o.total?.over?.open?.line);
  if (total !== null && total > 0) odds.total = total;
  const ps = num(o.pointSpread?.home?.close?.line) ?? num(o.pointSpread?.home?.open?.line);
  if (ps !== null) odds.spreadHome = ps;
  else {
    const d = str(o.details).trim();
    const m = d.match(/^([A-Za-z0-9.&' ]+?)\s+([+-]?\d+(\.\d+)?)$/);
    if (m) odds.spreadHome = m[1].trim().toUpperCase() === homeShort ? Number(m[2]) : -Number(m[2]);
    else if (/^EVEN$/i.test(d)) odds.spreadHome = 0;
  }
  return odds.home || odds.away || odds.total || odds.spreadHome !== undefined ? odds : undefined;
}

/** Football clock "67'", "90'+3'", "45+2'" → minute and extra-time flag. */
export function parseMinute(s: string): { minute: number; extraTime: boolean } | null {
  const m = s.replace(/\s/g, '').match(/^(\d+)'?(?:\+(\d+))?'?$/);
  if (!m) return null;
  const base = Number(m[1]);
  const plus = m[2] ? Number(m[2]) : 0;
  return { minute: base + plus, extraTime: base > 90 };
}

function footballIncidents(details: J[], homeId: string, awayId: string): FeedIncident[] {
  const out: FeedIncident[] = [];
  details.forEach((d, i) => {
    const t = str(d?.type?.text).toLowerCase();
    let kind: FeedIncidentKind | null = null;
    if (d?.redCard || /red card/.test(t)) kind = 'red';
    else if (d?.yellowCard || /yellow card/.test(t)) kind = 'yellow';
    else if (d?.ownGoal || /own goal/.test(t)) kind = 'owngoal';
    else if (/penalty.*(missed|saved)/.test(t)) kind = 'misspen';
    else if (d?.scoringPlay || /goal/.test(t)) kind = d?.penaltyKick || /penalty/.test(t) ? 'penalty' : 'goal';
    else if (/substitution/.test(t)) kind = 'sub';
    if (!kind || kind === 'sub') return;
    const teamId = str(d?.team?.id);
    const side: 0 | 1 | undefined = teamId === homeId ? 0 : teamId === awayId ? 1 : undefined;
    const clock = str(d?.clock?.displayValue);
    const pm = parseMinute(clock);
    const player = str(arr(d?.athletesInvolved)[0]?.displayName) || undefined;
    const label = kind === 'goal' ? 'Goal' : kind === 'penalty' ? 'Penalty goal' : kind === 'owngoal' ? 'Own goal' : kind === 'misspen' ? 'Penalty missed' : kind === 'red' ? 'Red card' : 'Yellow card';
    out.push({
      key: `${i}-${kind}-${clock}-${player ?? ''}`,
      clock, minute: pm?.minute, extraTime: pm?.extraTime, kind, side, player,
      text: player ? `${label} — ${player}` : label,
    });
  });
  return out;
}

function clockLabel(sport: SportId, status: FeedStatus, st: J): { clock: string; detail: string; period: number } {
  const detail = str(st?.type?.shortDetail ?? st?.type?.detail ?? st?.type?.description);
  const period = num(st?.period) ?? 0;
  const dc = str(st?.displayClock);
  if (status !== 'LIVE') return { clock: '', detail, period };
  if (sport === 'football') {
    if (/half/i.test(detail) && !/'/.test(detail)) return { clock: 'HT', detail, period };
    return { clock: /'/.test(dc) ? dc : /'/.test(detail) ? detail : dc ? `${dc}'` : detail, detail, period };
  }
  if (sport === 'basketball') {
    if (/half/i.test(detail)) return { clock: 'Half-time', detail, period };
    if (/^end/i.test(detail)) return { clock: detail, detail, period };
    const p = period <= 4 ? `Q${period}` : period === 5 ? 'OT' : `${period - 4}OT`;
    return { clock: dc ? `${p} ${dc}` : detail, detail, period };
  }
  return { clock: detail, detail, period };
}

/** One competition (a match) from a scoreboard-style payload. */
export function normalizeCompetition(league: League, event: J, comp: J, extraName?: string): FeedEvent | null {
  const sport = league.sport;
  const sides = orderSides(arr(comp?.competitors));
  if (!sides) return null;
  if (sport === 'tennis' && (!sides[0]?.athlete || !sides[1]?.athlete)) return null; // doubles or TBD
  const st = comp?.status ?? event?.status ?? {};
  const { status, name } = mapStatus(st.type);
  const home = teamSide(sides[0], sport);
  const away = teamSide(sides[1], sport);
  const start = Date.parse(str(comp?.date ?? event?.date)) || Date.now();
  const espnId = str(comp?.id ?? event?.id);
  const { clock, detail, period } = clockLabel(sport, status, st);
  const incidents = sport === 'football' ? footballIncidents(arr(comp?.details), home.id, away.id) : [];
  if (sport === 'tennis') {
    home.tiebreaks = arr(sides[0]?.linescores).map((l: J) => num(l?.tiebreak));
    away.tiebreaks = arr(sides[1]?.linescores).map((l: J) => num(l?.tiebreak));
    const r0 = num(sides[0]?.athlete?.rank ?? sides[0]?.rank ?? sides[0]?.curatedRank?.current);
    const r1 = num(sides[1]?.athlete?.rank ?? sides[1]?.rank ?? sides[1]?.curatedRank?.current);
    if (r0) home.rank = r0;
    if (r1) away.rank = r1;
  }
  const upper = `${name} ${detail} ${str(st?.type?.description)}`.toUpperCase();
  const extra: FeedEvent['extra'] = {};
  if (/AET|EXTRA TIME/.test(upper)) extra.aet = true;
  if (/PEN|SHOOTOUT/.test(upper) && status === 'FINISHED' && sport === 'football') extra.pens = true;
  if (/RETIRED|RET\.|\bRET\b/.test(upper)) extra.retired = true;
  if (/WALKOVER|W\/O/.test(upper)) extra.walkover = true;
  if (sport === 'tennis') {
    const tname = str(event?.name ?? event?.shortName);
    const mens = league.id === 'atp';
    extra.bestOf = num(comp?.format?.regulation?.periods) ?? (mens && /australian open|roland|french open|wimbledon|us open/i.test(tname) ? 5 : 3);
  }
  const leagueName = extraName ?? league.name;
  const venue = str(comp?.venue?.fullName ?? comp?.venue?.court ?? event?.venue?.fullName ?? '');
  const round = str(comp?.round?.displayName ?? arr(comp?.notes)[0]?.headline ?? arr(event?.notes)[0]?.headline ?? comp?.type?.text ?? '');
  return {
    id: eventKey(league.id, espnId, start),
    espnId, leagueId: league.id, leagueName, sport, startTime: start, status, statusName: name, detail, clock, period,
    home, away, venue, round, incidents,
    odds: parseOdds(arr(comp?.odds)[0], home.short),
    extra,
  };
}

/** Scoreboard payload (soccer, NBA): events[].competitions[0]. */
export function normalizeScoreboard(league: League, payload: J): FeedEvent[] {
  const out: FeedEvent[] = [];
  for (const e of arr(payload?.events)) {
    const comp = arr(e?.competitions)[0];
    const ev = comp ? normalizeCompetition(league, e, comp) : null;
    if (ev) out.push(ev);
  }
  return out;
}

/** Tennis scoreboard: events are tournaments; matches sit in groupings[].competitions[] (or competitions[]). */
export function normalizeTennis(league: League, payload: J): FeedEvent[] {
  const out: FeedEvent[] = [];
  for (const e of arr(payload?.events)) {
    const tname = str(e?.name ?? e?.shortName ?? league.name);
    const groups = arr(e?.groupings);
    const buckets: { label: string; comps: J[] }[] = groups.length
      ? groups.map((g: J) => ({ label: str(g?.grouping?.displayName ?? g?.grouping?.slug), comps: arr(g?.competitions) }))
      : [{ label: '', comps: arr(e?.competitions) }];
    for (const b of buckets) {
      if (/doubles|mixed/i.test(b.label)) continue;
      for (const c of b.comps) {
        const ev = normalizeCompetition(league, e, c, tname);
        if (ev) out.push(ev);
      }
    }
  }
  return out;
}

// ── cricket ──

export function cricketFormat(text: string): CricketInfo['format'] {
  const t = text.toLowerCase();
  if (/\btest\b|first-class|ranji|sheffield|county championship|plunket|duleep|4-day|5-day|unofficial test/.test(t)) return 'TEST';
  if (/t20|twenty20|ipl|big bash|bbl|psl|cpl|sa20|ilt20|hundred|smash|blast|wpl|wbbl|mlc|super league|premier league/.test(t)) return 'T20';
  if (/odi|one-day|one day|50-over|list a|world cup/.test(t)) return 'ODI';
  return 'OTHER';
}

export function parseInnings(text: string): { runs: number; wkts: number; overs?: number; declared?: boolean }[] {
  return text
    .split('&')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/(\d+)(?:\/(\d+))?\s*(d|dec)?(?:\s*\(\s*([\d.]+)\s*(?:ov|overs?)?)?/i);
      if (!m) return null;
      return { runs: Number(m[1]), wkts: m[2] !== undefined ? Number(m[2]) : 10, overs: m[4] ? Number(m[4]) : undefined, declared: !!m[3] };
    })
    .filter((x): x is { runs: number; wkts: number; overs: number | undefined; declared: boolean } => !!x);
}

export function cricketInfo(ev: FeedEvent, text: string): CricketInfo {
  const format = cricketFormat(`${ev.leagueName} ${text}`);
  const innings: CricketInfo['innings'] = [];
  for (const [i, side] of [ev.home, ev.away].entries()) {
    for (const inn of parseInnings(side.scoreText ?? '')) innings.push({ side: i as 0 | 1, runs: inn.runs, wkts: inn.wkts, overs: inn.overs });
  }
  const info: CricketInfo = { format, innings };
  const m = text.match(/([A-Za-z][A-Za-z .'&-]*?)\s+(?:need|require)s?\s+(\d+)\s+runs?\s+(?:from|in|off)\s+(\d+)\s+(balls?|overs?)/i);
  if (m) {
    const who = m[1].trim().toLowerCase();
    const side: 0 | 1 = ev.away.name.toLowerCase().includes(who) || ev.away.short.toLowerCase() === who || who.includes(ev.away.short.toLowerCase()) ? 1 : 0;
    const balls = /over/i.test(m[4]) ? Number(m[3]) * 6 : Number(m[3]);
    info.chase = { side, need: Number(m[2]), balls };
    info.batting = side;
  } else if (ev.status === 'LIVE') {
    // the side whose latest innings has an overs count and fewer than 10 wickets is usually batting
    const live = [...innings].reverse().find((x) => x.overs !== undefined && x.wkts < 10);
    if (live) info.batting = live.side;
  }
  return info;
}

/** Personalized header payload for cricket: sports[0].leagues[].events[] with competitors on the event. */
export function normalizeCricketHeader(payload: J): { leagues: { id: string; name: string }[]; events: FeedEvent[] } {
  const leagues: { id: string; name: string }[] = [];
  const events: FeedEvent[] = [];
  for (const sport of arr(payload?.sports)) {
    for (const lg of arr(sport?.leagues)) {
      const lid = `cricket-${str(lg?.id ?? lg?.slug)}`;
      const lname = str(lg?.name ?? lg?.shortName ?? 'Cricket');
      const league: League = { id: lid, sport: 'cricket', name: lname, short: str(lg?.abbreviation ?? lg?.shortName ?? lname).slice(0, 12), region: '', kind: 'cricket' };
      leagues.push({ id: lid, name: lname });
      for (const e of arr(lg?.events)) {
        const comp = arr(e?.competitions)[0] ?? e;
        const status = e?.fullStatus ?? comp?.status ?? (typeof e?.status === 'string' ? { type: { state: e.status, detail: e?.summary ?? '' } } : e?.status);
        const ev = normalizeCompetition(league, e, { ...comp, competitors: comp?.competitors ?? e?.competitors, status, id: e?.id ?? comp?.id, date: e?.date ?? comp?.date });
        if (!ev) continue;
        const statusText = [str(e?.summary), str(e?.status?.summary), str(status?.type?.detail), str(status?.summary), str(e?.description), str(e?.name)].join(' · ');
        ev.extra.cricket = cricketInfo(ev, statusText);
        ev.extra.note = str(e?.summary ?? status?.type?.detail) || undefined;
        ev.detail = ev.extra.note ?? ev.detail;
        if (ev.status === 'LIVE') ev.clock = 'Live';
        events.push(ev);
      }
    }
  }
  return { leagues, events };
}

/** Summary payload (single match): header.competitions[0] mirrors a scoreboard competition. */
export function normalizeSummary(league: League, payload: J): FeedEvent | null {
  const header = payload?.header;
  const comp = arr(header?.competitions)[0];
  if (!comp) return null;
  const ev = normalizeCompetition(league, { ...header, name: header?.league?.name ?? league.name }, comp);
  if (!ev) return null;
  // boxscore statistics (football) are richer than the scoreboard's
  const teams = arr(payload?.boxscore?.teams);
  for (const t of teams) {
    const id = str(t?.team?.id);
    const s = stats(t?.statistics);
    if (id === ev.home.id) ev.home.stats = { ...ev.home.stats, ...s };
    if (id === ev.away.id) ev.away.stats = { ...ev.away.stats, ...s };
  }
  if (league.sport === 'football' && !ev.incidents.length) {
    const ke = arr(payload?.keyEvents).map((k: J) => ({ ...k, type: k?.type, clock: k?.clock, team: k?.team, athletesInvolved: arr(k?.participants).map((p: J) => p?.athlete) }));
    ev.incidents = footballIncidents(ke, ev.home.id, ev.away.id);
  }
  return ev;
}

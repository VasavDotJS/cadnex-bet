/**
 * Server-side fetching from ESPN's public site API (no key). Runs only in Next.js route
 * handlers. Responses are cached by Next's data cache, so every visitor shares the same
 * few upstream requests: live windows refresh every 15 s, far-ahead fixtures every 10 min.
 */
import { LEAGUES, League } from '../data/leagues';
import { normalizeCricketHeader, normalizeScoreboard, normalizeSummary, normalizeTennis } from './espn';
import { FeedEvent, FeedResponse, FeedSource, parseEventKey } from './types';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const SITE_WEB = 'https://site.web.api.espn.com/apis/site/v2/sports';
const CRICKET_HEADER = 'https://site.web.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Calcutta&lang=en';

const LIVE_TTL = 15;
const FUTURE_TTL = 600;

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function dayOffset(base: number, days: number): string {
  return ymd(new Date(base + days * 86_400_000));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJson(url: string, ttl: number): Promise<{ ok: boolean; status: number; json: any; ms: number; error?: string }> {
  const t0 = Date.now();
  if (process.env.CADNEX_FIXTURES) return fixture(url, t0);
  const hit = memo.get(url);
  if (hit && t0 - hit.at < ttl * 1000) return { ok: true, status: 200, json: hit.json, ms: 0 };
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return stale(url, t0, res.status, `HTTP ${res.status}`);
    const json = await res.json();
    memo.set(url, { at: Date.now(), json });
    if (memo.size > 200) memo.delete(memo.keys().next().value as string);
    return { ok: true, status: res.status, json, ms: Date.now() - t0 };
  } catch (e) {
    return stale(url, t0, 0, (e as Error).message);
  }
}

/** Per-instance cache of upstream responses (warm serverless instances reuse it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memo = new Map<string, { at: number; json: any }>();

/** On an upstream error, serve the last good copy for up to 2 minutes rather than nothing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stale(url: string, t0: number, status: number, error: string): { ok: boolean; status: number; json: any; ms: number; error?: string } {
  const hit = memo.get(url);
  if (hit && t0 - hit.at < 120_000) return { ok: true, status: 200, json: hit.json, ms: Date.now() - t0, error: `${error} (served cached copy)` };
  return { ok: false, status, json: null, ms: Date.now() - t0, error };
}

/**
 * Offline mode for development and tests: CADNEX_FIXTURES=<dir> serves recorded ESPN-shaped
 * JSON from <dir>/<league>.json (cricket.json for the cricket header) instead of the network.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fixture(url: string, t0: number): Promise<{ ok: boolean; status: number; json: any; ms: number; error?: string }> {
  const { readFile } = await import('node:fs/promises');
  const m = url.match(/sports\/[a-z]+\/([^/]+)\/(scoreboard|summary)/);
  const name = url.includes('sport=cricket') ? 'cricket' : m ? m[1] : 'unknown';
  if (url.includes('dates=') && !url.includes(`dates=${dayOffset(Date.now(), -1)}`) && m?.[2] === 'scoreboard' && !/tennis/.test(url)) {
    return { ok: true, status: 200, json: { events: [] }, ms: Date.now() - t0 };
  }
  try {
    const json = JSON.parse(await readFile(`${process.env.CADNEX_FIXTURES}/${name}.json`, 'utf8'));
    return { ok: true, status: 200, json, ms: Date.now() - t0 };
  } catch {
    return { ok: false, status: 404, json: null, ms: Date.now() - t0, error: 'no fixture' };
  }
}

interface Job {
  league: League;
  url: string;
  ttl: number;
  label: string;
}

function jobs(now: number): Job[] {
  const out: Job[] = [];
  for (const l of LEAGUES) {
    if (!l.espn) continue;
    if (l.kind === 'tennis') {
      out.push({ league: l, url: `${SITE}/${l.espn}/scoreboard`, ttl: LIVE_TTL, label: l.id });
      continue;
    }
    // yesterday → tomorrow at live cadence, the rest of the week slowly
    out.push({ league: l, url: `${SITE}/${l.espn}/scoreboard?dates=${dayOffset(now, -1)}-${dayOffset(now, 1)}&limit=300`, ttl: LIVE_TTL, label: `${l.id} (today)` });
    out.push({ league: l, url: `${SITE}/${l.espn}/scoreboard?dates=${dayOffset(now, 2)}-${dayOffset(now, 7)}&limit=300`, ttl: FUTURE_TTL, label: `${l.id} (this week)` });
  }
  return out;
}

export async function loadFeed(): Promise<FeedResponse> {
  const now = Date.now();
  const sources: FeedSource[] = [];
  const byId = new Map<string, FeedEvent>();
  const work = jobs(now).map(async (j) => {
    const r = await getJson(j.url, j.ttl);
    let events: FeedEvent[] = [];
    let error = r.error;
    if (r.ok) {
      try {
        events = j.league.kind === 'tennis' ? normalizeTennis(j.league, r.json) : normalizeScoreboard(j.league, r.json);
      } catch (e) {
        error = `parse: ${(e as Error).message}`;
      }
    }
    sources.push({ league: j.label, url: j.url, ok: r.ok && !error, status: r.status, count: events.length, error, ms: r.ms });
    for (const ev of events) byId.set(ev.id, ev);
  });
  const cricket = (async () => {
    const r = await getJson(CRICKET_HEADER, LIVE_TTL);
    let error = r.error;
    let events: FeedEvent[] = [];
    if (r.ok) {
      try {
        events = normalizeCricketHeader(r.json).events;
      } catch (e) {
        error = `parse: ${(e as Error).message}`;
      }
    }
    sources.push({ league: 'cricket', url: CRICKET_HEADER, ok: r.ok && !error, status: r.status, count: events.length, error, ms: r.ms });
    for (const ev of events) byId.set(ev.id, ev);
  })();
  await Promise.all([...work, cricket]);
  // keep a sensible window: last 36 h of results, everything live, the next 7 days
  const events = [...byId.values()].filter((e) => e.status === 'LIVE' || (e.startTime > now - 36 * 3_600_000 && e.startTime < now + 8 * 86_400_000));
  events.sort((a, b) => a.startTime - b.startTime);
  sources.sort((a, b) => a.league.localeCompare(b.league));
  return { updatedAt: now, provider: 'ESPN', sources, events };
}

/** One match by our event key, used to settle bets on matches that left the main window. */
export async function loadEvent(id: string): Promise<FeedEvent | null> {
  const key = parseEventKey(id);
  if (!key) return null;
  const { leagueId, espnId, ymd: day } = key;
  if (leagueId.startsWith('cricket-')) {
    const series = leagueId.slice('cricket-'.length);
    const r = await getJson(`${SITE_WEB}/cricket/${series}/summary?event=${espnId}&lang=en&region=in`, LIVE_TTL);
    if (!r.ok) return null;
    const league: League = { id: leagueId, sport: 'cricket', name: String(r.json?.header?.league?.name ?? 'Cricket'), short: 'Cricket', region: '', kind: 'cricket' };
    const ev = normalizeSummary(league, r.json);
    if (ev) {
      const { cricketInfo } = await import('./espn');
      const text = [r.json?.header?.competitions?.[0]?.status?.summary, r.json?.header?.competitions?.[0]?.status?.type?.detail].filter(Boolean).join(' · ');
      ev.extra.cricket = cricketInfo(ev, text);
      ev.id = id;
    }
    return ev;
  }
  const league = LEAGUES.find((l) => l.id === leagueId);
  if (!league?.espn) return null;
  // look in the scoreboard for the match day (±1 day for time zones), then fall back to summary
  const d = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
  const range = `${dayOffset(d, -1)}-${dayOffset(d, 1)}`;
  const r = await getJson(`${SITE}/${league.espn}/scoreboard?dates=${league.kind === 'tennis' ? day : range}&limit=300`, LIVE_TTL);
  if (r.ok) {
    const list = league.kind === 'tennis' ? normalizeTennis(league, r.json) : normalizeScoreboard(league, r.json);
    const hit = list.find((e) => e.espnId === espnId);
    if (hit) return { ...hit, id };
  }
  const s = await getJson(`${SITE}/${league.espn}/summary?event=${espnId}`, LIVE_TTL);
  if (!s.ok) return null;
  const ev = normalizeSummary(league, s.json);
  return ev ? { ...ev, id } : null;
}

/** Match detail with richer stats and key events, for the match screen. */
export async function loadDetail(id: string): Promise<FeedEvent | null> {
  const key = parseEventKey(id);
  if (!key) return null;
  const league = LEAGUES.find((l) => l.id === key.leagueId);
  if (!league?.espn || league.kind === 'tennis') return loadEvent(id);
  const s = await getJson(`${SITE}/${league.espn}/summary?event=${key.espnId}`, LIVE_TTL);
  if (!s.ok) return loadEvent(id);
  const ev = normalizeSummary(league, s.json);
  return ev ? { ...ev, id } : loadEvent(id);
}

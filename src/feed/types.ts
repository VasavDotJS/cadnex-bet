/**
 * Normalised real-world match data. The server turns ESPN's public JSON into these
 * shapes; the browser engine prices and settles from them. Plain data only.
 */
import type { SportId } from '../data/types';

export type FeedStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';

export interface FeedSide {
  id: string;
  name: string;
  short: string;
  colors: [string, string];
  score: number;
  /** display text when the score isn't one number (cricket "185/6 (20 ov)") */
  scoreText?: string;
  winner?: boolean;
  /** per-period values: quarters (NBA), games per set (tennis) */
  lines: (number | null)[];
  tiebreaks?: (number | null)[];
  stats: Record<string, number>;
  record?: string;
  form?: string;
  rank?: number;
}

export type FeedIncidentKind = 'goal' | 'owngoal' | 'penalty' | 'misspen' | 'yellow' | 'red' | 'sub' | 'info';

export interface FeedIncident {
  key: string;
  clock: string;
  /** regulation-time minute for football (90'+3' → 93, 105' → 105) */
  minute?: number;
  /** true when the clock reads like extra time (beyond 90 with no "+") */
  extraTime?: boolean;
  kind: FeedIncidentKind;
  side?: 0 | 1;
  player?: string;
  text: string;
}

export interface FeedOdds {
  /** decimal odds */
  home?: number;
  away?: number;
  draw?: number;
  /** line on the home side, e.g. -5.5 */
  spreadHome?: number;
  total?: number;
  provider?: string;
}

export interface CricketInfo {
  format: 'T20' | 'ODI' | 'TEST' | 'OTHER';
  /** side currently batting, if known */
  batting?: 0 | 1;
  /** chase state parsed from the status line */
  chase?: { side: 0 | 1; need: number; balls: number };
  innings: { side: 0 | 1; runs: number; wkts: number; overs?: number }[];
}

export interface FeedEvent {
  id: string; // `${leagueId}~${espnId}~${yyyymmdd}`
  espnId: string;
  leagueId: string;
  leagueName: string;
  sport: SportId;
  startTime: number;
  status: FeedStatus;
  /** ESPN status name, e.g. STATUS_SECOND_HALF */
  statusName: string;
  /** short status text, e.g. 67', HT, Q3 4:12, Final */
  detail: string;
  clock: string;
  period: number;
  home: FeedSide;
  away: FeedSide;
  venue: string;
  round: string;
  incidents: FeedIncident[];
  odds?: FeedOdds;
  extra: {
    aet?: boolean;
    pens?: boolean;
    retired?: boolean;
    walkover?: boolean;
    bestOf?: number;
    cricket?: CricketInfo;
    note?: string;
  };
}

export interface FeedSource {
  league: string;
  url: string;
  ok: boolean;
  status?: number;
  count: number;
  error?: string;
  ms: number;
}

export interface FeedResponse {
  updatedAt: number;
  provider: string;
  sources: FeedSource[];
  events: FeedEvent[];
}

export function eventKey(leagueId: string, espnId: string, start: number): string {
  const d = new Date(start);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `${leagueId}~${espnId}~${ymd}`;
}

export function parseEventKey(id: string): { leagueId: string; espnId: string; ymd: string } | null {
  const p = id.split('~');
  if (p.length !== 3 || !/^\d{8}$/.test(p[2])) return null;
  return { leagueId: p[0], espnId: p[1], ymd: p[2] };
}

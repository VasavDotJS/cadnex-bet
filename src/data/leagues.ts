/**
 * Real competitions CADNEX follows. Each maps to an ESPN public feed.
 * Cricket series are discovered at runtime and registered on the fly.
 */
import type { SportId } from './types';

export interface SportInfo {
  id: SportId;
  name: string;
  unit: string;
}

export const SPORTS: SportInfo[] = [
  { id: 'football', name: 'Football', unit: 'team' },
  { id: 'basketball', name: 'Basketball', unit: 'team' },
  { id: 'tennis', name: 'Tennis', unit: 'player' },
  { id: 'cricket', name: 'Cricket', unit: 'team' },
];

export interface League {
  id: string;
  sport: SportId;
  name: string;
  short: string;
  region: string;
  /** ESPN site-API path segment after /sports/, e.g. soccer/eng.1 */
  espn?: string;
  kind: 'scoreboard' | 'tennis' | 'cricket';
}

const soccer = (id: string, name: string, short: string, region: string): League => ({ id, sport: 'football', name, short, region, espn: `soccer/${id}`, kind: 'scoreboard' });

export const LEAGUES: League[] = [
  soccer('eng.1', 'Premier League', 'EPL', 'England'),
  soccer('esp.1', 'LaLiga', 'LaLiga', 'Spain'),
  soccer('ita.1', 'Serie A', 'Serie A', 'Italy'),
  soccer('ger.1', 'Bundesliga', 'BL', 'Germany'),
  soccer('fra.1', 'Ligue 1', 'L1', 'France'),
  soccer('uefa.champions', 'UEFA Champions League', 'UCL', 'Europe'),
  soccer('uefa.europa', 'UEFA Europa League', 'UEL', 'Europe'),
  soccer('ind.1', 'Indian Super League', 'ISL', 'India'),
  soccer('eng.2', 'EFL Championship', 'EFL', 'England'),
  soccer('ned.1', 'Eredivisie', 'ERE', 'Netherlands'),
  soccer('por.1', 'Primeira Liga', 'POR', 'Portugal'),
  soccer('ksa.1', 'Saudi Pro League', 'SPL', 'Saudi Arabia'),
  soccer('usa.1', 'MLS', 'MLS', 'USA'),
  soccer('mex.1', 'Liga MX', 'LMX', 'Mexico'),
  soccer('bra.1', 'Brasileirão', 'BRA', 'Brazil'),
  soccer('arg.1', 'Liga Profesional', 'ARG', 'Argentina'),
  { id: 'nba', sport: 'basketball', name: 'NBA', short: 'NBA', region: 'USA', espn: 'basketball/nba', kind: 'scoreboard' },
  { id: 'atp', sport: 'tennis', name: 'ATP Tour', short: 'ATP', region: 'World', espn: 'tennis/atp', kind: 'tennis' },
  { id: 'wta', sport: 'tennis', name: 'WTA Tour', short: 'WTA', region: 'World', espn: 'tennis/wta', kind: 'tennis' },
];

const registry = new Map<string, League>(LEAGUES.map((l) => [l.id, l]));

/** Add a league discovered in the feed (cricket series, tennis tournaments). */
export function registerLeague(l: Pick<League, 'id' | 'sport' | 'name'> & Partial<League>): void {
  if (registry.has(l.id)) return;
  registry.set(l.id, { short: l.name.slice(0, 12), region: '', kind: 'cricket', ...l } as League);
}

export function allLeagues(): League[] {
  return [...registry.values()];
}

export function leagueById(id: string): League {
  const l = registry.get(id);
  if (l) return l;
  const sport: SportId = id.startsWith('cricket') ? 'cricket' : id.startsWith('atp') || id.startsWith('wta') ? 'tennis' : id === 'nba' ? 'basketball' : 'football';
  return { id, sport, name: sport === 'cricket' ? 'Cricket' : id, short: sport === 'cricket' ? 'Cricket' : id.toUpperCase(), region: '', kind: 'scoreboard' };
}

export function leagueOrder(id: string): number {
  const i = LEAGUES.findIndex((l) => l.id === id);
  return i < 0 ? 999 : i;
}

export function sportInfo(id: SportId): SportInfo {
  return SPORTS.find((s) => s.id === id) ?? { id, name: id, unit: 'team' };
}

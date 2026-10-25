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
  /** ESPN's numeric league id (matches in the all-football scoreboard carry it in their uid) */
  lid?: string;
  /** domestic cups: the divisions (top first) used to tell how strong each side is */
  divisions?: string[];
  kind: 'scoreboard' | 'tennis' | 'cricket';
}

const soccer = (id: string, lid: string, name: string, short: string, region: string): League => ({ id, lid, sport: 'football', name, short, region, espn: `soccer/${id}`, kind: 'scoreboard' });

/** Football competitions CADNEX prices, in display order. */
export const FOOTBALL: League[] = [
  // the big five, Europe's club competitions and India
  soccer('eng.1', '700', 'Premier League', 'EPL', 'England'),
  soccer('esp.1', '740', 'LaLiga', 'LaLiga', 'Spain'),
  soccer('uefa.champions', '775', 'UEFA Champions League', 'UCL', 'Europe'),
  soccer('ita.1', '730', 'Serie A', 'Serie A', 'Italy'),
  soccer('ger.1', '720', 'Bundesliga', 'BL', 'Germany'),
  soccer('fra.1', '710', 'Ligue 1', 'L1', 'France'),
  soccer('ind.1', '8316', 'Indian Super League', 'ISL', 'India'),
  soccer('uefa.europa', '776', 'UEFA Europa League', 'UEL', 'Europe'),
  soccer('uefa.europa.conf', '20296', 'UEFA Conference League', 'UECL', 'Europe'),
  // national teams
  soccer('fifa.worldq.uefa', '786', 'World Cup Qualifying · UEFA', 'WCQ', 'Europe'),
  soccer('uefa.nations', '2395', 'UEFA Nations League', 'UNL', 'Europe'),
  soccer('fifa.friendly', '3922', 'International Friendlies', 'INTL', 'World'),
  // cups
  soccer('eng.fa', '3918', 'FA Cup', 'FA Cup', 'England'),
  soccer('eng.league_cup', '3920', 'Carabao Cup', 'EFL Cup', 'England'),
  soccer('esp.copa_del_rey', '3951', 'Copa del Rey', 'Copa', 'Spain'),
  soccer('ita.coppa_italia', '3956', 'Coppa Italia', 'Coppa', 'Italy'),
  soccer('ger.dfb_pokal', '3954', 'DFB-Pokal', 'Pokal', 'Germany'),
  soccer('fra.coupe_de_france', '3952', 'Coupe de France', 'CdF', 'France'),
  soccer('uefa.super_cup', '5462', 'UEFA Super Cup', 'USC', 'Europe'),
  soccer('fifa.cwc', '5501', 'FIFA Club World Cup', 'CWC', 'World'),
  // more of Europe
  soccer('eng.2', '3914', 'EFL Championship', 'EFL', 'England'),
  soccer('eng.3', '3915', 'EFL League One', 'L1', 'England'),
  soccer('esp.2', '3921', 'LaLiga 2', 'LaLiga 2', 'Spain'),
  soccer('ita.2', '3931', 'Serie B', 'Serie B', 'Italy'),
  soccer('ger.2', '3927', '2. Bundesliga', 'BL2', 'Germany'),
  soccer('fra.2', '3926', 'Ligue 2', 'L2', 'France'),
  soccer('ned.1', '725', 'Eredivisie', 'ERE', 'Netherlands'),
  soccer('por.1', '715', 'Primeira Liga', 'POR', 'Portugal'),
  soccer('sco.1', '735', 'Scottish Premiership', 'SPFL', 'Scotland'),
  soccer('tur.1', '3946', 'Süper Lig', 'TUR', 'Turkey'),
  soccer('bel.1', '3901', 'Belgian Pro League', 'BEL', 'Belgium'),
  // Asia, the Americas and Oceania
  soccer('ind.2', '18505', 'I-League', 'I-League', 'India'),
  soccer('ksa.1', '21231', 'Saudi Pro League', 'SPL', 'Saudi Arabia'),
  soccer('afc.champions', '3902', 'AFC Champions League Elite', 'ACLE', 'Asia'),
  soccer('jpn.1', '750', 'J1 League', 'J1', 'Japan'),
  soccer('aus.1', '3906', 'A-League Men', 'ALM', 'Australia'),
  soccer('usa.1', '770', 'MLS', 'MLS', 'USA'),
  soccer('mex.1', '760', 'Liga MX', 'LMX', 'Mexico'),
  soccer('bra.1', '630', 'Brasileirão', 'BRA', 'Brazil'),
  soccer('arg.1', '745', 'Liga Profesional', 'ARG', 'Argentina'),
  soccer('conmebol.libertadores', '783', 'Copa Libertadores', 'LIB', 'South America'),
  soccer('conmebol.sudamericana', '5454', 'Copa Sudamericana', 'SUD', 'South America'),
];

export const LEAGUES: League[] = [
  ...FOOTBALL,
  { id: 'nba', sport: 'basketball', name: 'NBA', short: 'NBA', region: 'USA', espn: 'basketball/nba', kind: 'scoreboard' },
  { id: 'atp', sport: 'tennis', name: 'ATP Tour', short: 'ATP', region: 'World', espn: 'tennis/atp', kind: 'tennis' },
  { id: 'wta', sport: 'tennis', name: 'WTA Tour', short: 'WTA', region: 'World', espn: 'tennis/wta', kind: 'tennis' },
];

/** ESPN numeric league id → our football league. */
const cup = (id: string, divisions: string[]) => {
  const l = FOOTBALL.find((x) => x.id === id);
  if (l) l.divisions = divisions;
};
cup('eng.fa', ['eng.1', 'eng.2', 'eng.3']);
cup('eng.league_cup', ['eng.1', 'eng.2', 'eng.3']);
cup('esp.copa_del_rey', ['esp.1', 'esp.2']);
cup('ita.coppa_italia', ['ita.1', 'ita.2']);
cup('ger.dfb_pokal', ['ger.1', 'ger.2']);
cup('fra.coupe_de_france', ['fra.1', 'fra.2']);

export const FOOTBALL_BY_LID = new Map(FOOTBALL.map((l) => [l.lid!, l]));

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

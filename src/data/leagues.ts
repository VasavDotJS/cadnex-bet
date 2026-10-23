import { BASKETBALL_TEAMS } from './basketball';
import { CRICKET_TEAMS } from './cricket';
import { ESPORTS_TEAMS } from './esports';
import { FOOTBALL_TEAMS } from './football';
import { TENNIS_PLAYERS } from './tennis';
import { League, SportId, TeamBase } from './types';

export interface SportInfo {
  id: SportId;
  name: string;
  /** noun for a participant: team or player */
  unit: string;
}

export const SPORTS: SportInfo[] = [
  { id: 'football', name: 'Football', unit: 'team' },
  { id: 'basketball', name: 'Basketball', unit: 'team' },
  { id: 'tennis', name: 'Tennis', unit: 'player' },
  { id: 'cricket', name: 'Cricket', unit: 'team' },
  { id: 'esports', name: 'Esports', unit: 'team' },
];

const ids = (arr: { id: string }[], from: number, to: number) => arr.slice(from, to).map((x) => x.id);

export const LEAGUES: League[] = [
  { id: 'epl', sport: 'football', name: 'Premier League', short: 'EPL', region: 'England', teams: ids(FOOTBALL_TEAMS, 0, 12), slots: [12.5, 15, 17.5, 20] },
  { id: 'laliga', sport: 'football', name: 'La Liga', short: 'LaLiga', region: 'Spain', teams: ids(FOOTBALL_TEAMS, 12, 20), slots: [14, 16.25, 18.5, 21] },
  { id: 'seriea', sport: 'football', name: 'Serie A', short: 'Serie A', region: 'Italy', teams: ids(FOOTBALL_TEAMS, 20, 28), slots: [12.5, 15, 18, 20.75] },
  { id: 'bundesliga', sport: 'football', name: 'Bundesliga', short: 'BL', region: 'Germany', teams: ids(FOOTBALL_TEAMS, 28, 36), slots: [15.5, 18.5, 20.5] },
  { id: 'ligue1', sport: 'football', name: 'Ligue 1', short: 'L1', region: 'France', teams: ids(FOOTBALL_TEAMS, 36, 42), slots: [17, 19, 21] },
  { id: 'ucl', sport: 'football', name: 'UEFA Champions League', short: 'UCL', region: 'Europe', teams: ['ars', 'mci', 'liv', 'che', 'new', 'rma', 'bar', 'atm', 'int', 'nap', 'juv', 'bay', 'bvb', 'b04', 'psg', 'om', 'asm', 'ata'], slots: [18.75, 21] },
  { id: 'isl', sport: 'football', name: 'Indian Super League', short: 'ISL', region: 'India', teams: ids(FOOTBALL_TEAMS, 42, 50), slots: [17.5, 19.5] },

  { id: 'nba', sport: 'basketball', name: 'NBA', short: 'NBA', region: 'USA', teams: ids(BASKETBALL_TEAMS, 0, 12), slots: [19, 19.5, 20, 22] },
  { id: 'euroleague', sport: 'basketball', name: 'EuroLeague', short: 'EL', region: 'Europe', teams: ids(BASKETBALL_TEAMS, 12, 20), slots: [19, 20.5] },

  { id: 'atp', sport: 'tennis', name: 'ATP Tour', short: 'ATP', region: 'World', teams: TENNIS_PLAYERS.filter((p) => p.tour === 'ATP').map((p) => p.id), slots: [11, 13, 15, 17, 19] },
  { id: 'wta', sport: 'tennis', name: 'WTA Tour', short: 'WTA', region: 'World', teams: TENNIS_PLAYERS.filter((p) => p.tour === 'WTA').map((p) => p.id), slots: [11, 13, 15, 17, 19] },

  { id: 'ipl', sport: 'cricket', name: 'Indian Premier League', short: 'IPL', region: 'India', teams: ids(CRICKET_TEAMS, 0, 8), slots: [15.5, 19.5] },
  { id: 't20i', sport: 'cricket', name: 'International T20', short: 'T20I', region: 'World', teams: ids(CRICKET_TEAMS, 8, 16), slots: [14, 19] },

  { id: 'cs2', sport: 'esports', game: 'cs2', name: 'Counter-Strike 2', short: 'CS2', region: 'Global', teams: ESPORTS_TEAMS.filter((t) => t.game === 'cs2').map((t) => t.id), slots: [13, 16, 19, 22] },
  { id: 'lol', sport: 'esports', game: 'lol', name: 'League of Legends', short: 'LoL', region: 'Global', teams: ESPORTS_TEAMS.filter((t) => t.game === 'lol').map((t) => t.id), slots: [12, 15, 18] },
  { id: 'valorant', sport: 'esports', game: 'valorant', name: 'Valorant', short: 'VAL', region: 'Global', teams: ESPORTS_TEAMS.filter((t) => t.game === 'valorant').map((t) => t.id), slots: [14, 17, 20] },
];

export const VENUES: Record<string, string> = {
  ars: 'Emirates Stadium', mci: 'Etihad Stadium', liv: 'Anfield', che: 'Stamford Bridge', mun: 'Old Trafford', tot: 'Tottenham Hotspur Stadium', new: "St James' Park", avl: 'Villa Park', bha: 'Amex Stadium', cry: 'Selhurst Park', nfo: 'City Ground', whu: 'London Stadium',
  rma: 'Santiago Bernabéu', bar: 'Spotify Camp Nou', atm: 'Metropolitano', ath: 'San Mamés', rso: 'Reale Arena', vil: 'Estadio de la Cerámica', bet: 'Benito Villamarín', sev: 'Ramón Sánchez-Pizjuán',
  int: 'San Siro', nap: 'Diego Armando Maradona', juv: 'Allianz Stadium', mil: 'San Siro', ata: 'Gewiss Stadium', rom: 'Stadio Olimpico', laz: 'Stadio Olimpico', fio: 'Artemio Franchi',
  bay: 'Allianz Arena', bvb: 'Signal Iduna Park', b04: 'BayArena', rbl: 'Red Bull Arena', vfb: 'MHPArena', sge: 'Deutsche Bank Park', wob: 'Volkswagen Arena', scf: 'Europa-Park Stadion',
  psg: 'Parc des Princes', om: 'Orange Vélodrome', asm: 'Stade Louis II', losc: 'Stade Pierre-Mauroy', ol: 'Groupama Stadium', rcl: 'Stade Bollaert-Delelis',
  mbsg: 'Salt Lake Stadium', ebfc: 'Salt Lake Stadium', mcfc: 'Mumbai Football Arena', kbfc: 'JLN Stadium, Kochi', bfc: 'Sree Kanteerava', fcg: 'Fatorda Stadium', ofc: 'Kalinga Stadium', neufc: 'Indira Gandhi Stadium',
  okc: 'Paycom Center', den: 'Ball Arena', bos: 'TD Garden', nyk: 'Madison Square Garden', cle: 'Rocket Arena', lal: 'Crypto.com Arena', gsw: 'Chase Center', mil_b: 'Fiserv Forum', min: 'Target Center', dal: 'American Airlines Center', sas: 'Frost Bank Center', hou: 'Toyota Center',
  rmb: 'Movistar Arena', fen: 'Ülker Sports Arena', pao: 'OAKA Altion', oly: 'Peace and Friendship Stadium', fcb: 'Palau Blaugrana', efs: 'Sinan Erdem Dome', asmb: 'Salle Gaston Médecin', zal: 'Žalgirio Arena',
  csk: 'MA Chidambaram Stadium', mi: 'Wankhede Stadium', rcb: 'M. Chinnaswamy Stadium', kkr: 'Eden Gardens', srh: 'Rajiv Gandhi Intl. Stadium', rr: 'Sawai Mansingh Stadium', gt: 'Narendra Modi Stadium', pbks: 'Mullanpur Stadium',
  ind: 'Wankhede Stadium', aus: 'Melbourne Cricket Ground', eng: "Lord's", pak: 'Gaddafi Stadium', rsa: 'Wanderers Stadium', nzl: 'Eden Park', wi: 'Kensington Oval', afg: 'Sharjah Cricket Stadium',
};

export const TENNIS_VENUES = ['Centre Court', 'Court Philippe-Chatrier', 'Arthur Ashe Stadium', 'Rod Laver Arena', 'Stadium 1', 'Court Suzanne-Lenglen'];
export const TENNIS_EVENTS = ['Shanghai Masters', 'Paris Masters', 'Vienna Open', 'Basel Indoors', 'Tour Finals', 'Tokyo Open', 'Wuhan Open', 'Ningbo Open'];
export const ESPORTS_EVENTS: Record<string, string[]> = {
  cs2: ['IEM Cologne', 'BLAST Premier', 'PGL Major', 'ESL Pro League'],
  lol: ['Worlds', 'LCK', 'MSI', 'LEC'],
  valorant: ['VCT Masters', 'VCT Champions', 'VCT EMEA', 'VCT Pacific'],
};

export function leagueById(id: string): League {
  const l = LEAGUES.find((x) => x.id === id);
  if (!l) throw new Error(`league ${id}`);
  return l;
}

export function sportInfo(id: SportId): SportInfo {
  return SPORTS.find((s) => s.id === id)!;
}

/** Look up a participant record for a sport. Basketball and football ids can collide (mil), so sport is required. */
export function findTeam(sport: SportId, id: string): TeamBase {
  switch (sport) {
    case 'football': return FOOTBALL_TEAMS.find((t) => t.id === id)!;
    case 'basketball': return BASKETBALL_TEAMS.find((t) => t.id === id)!;
    case 'tennis': return TENNIS_PLAYERS.find((t) => t.id === id)!;
    case 'cricket': return CRICKET_TEAMS.find((t) => t.id === id)!;
    case 'esports': return ESPORTS_TEAMS.find((t) => t.id === id)!;
  }
}

export function venueFor(sport: SportId, homeId: string): string {
  if (sport === 'basketball' && homeId === 'mil') return VENUES.mil_b;
  if (sport === 'football' || sport === 'basketball' || sport === 'cricket') return VENUES[homeId] ?? 'Neutral venue';
  return '';
}

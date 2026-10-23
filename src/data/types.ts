export type SportId = 'football' | 'basketball' | 'tennis' | 'cricket' | 'esports';
export type EsportsGame = 'cs2' | 'lol' | 'valorant';

export interface Player {
  name: string;
  /** relative involvement: scoring weight (football/basketball), batting/bowling skill (cricket), impact (esports) */
  w: number;
}

export interface TeamBase {
  id: string;
  name: string;
  short: string;
  colors: [string, string];
}

export interface FootballTeam extends TeamBase {
  attack: number;
  defence: number;
  midfield: number;
  home: number; // 0..1 home strength
  gk: string;
  players: Player[];
}

export interface BasketballTeam extends TeamBase {
  offense: number;
  defense: number;
  pace: number; // possessions per 48 relative (90..104)
  players: Player[];
}

export interface TennisPlayer extends TeamBase {
  tour: 'ATP' | 'WTA';
  serve: number; // 0..100
  ret: number; // 0..100
  country: string;
}

export interface CricketTeam extends TeamBase {
  bat: number;
  bowl: number;
  /** batting order, 11 players; w = batting quality 0..100 */
  players: Player[];
  /** names of main bowlers from the XI */
  bowlers: string[];
}

export interface EsportsTeam extends TeamBase {
  game: EsportsGame;
  rating: number;
  region: string;
  players: Player[];
}

export interface League {
  id: string;
  sport: SportId;
  name: string;
  short: string;
  region: string;
  teams: string[];
  game?: EsportsGame;
  venues?: string[];
  /** typical local kickoff hours (24h) for future fixtures */
  slots: number[];
}

/** "Name 8, Other Name 5" → Player[] */
export function roster(s: string): Player[] {
  return s.split(',').map((x) => {
    const t = x.trim();
    const m = t.match(/^(.*\S)\s+(\d+(?:\.\d+)?)$/);
    return m ? { name: m[1], w: Number(m[2]) } : { name: t, w: 1 };
  });
}

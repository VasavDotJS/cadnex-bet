/** Sport module registry and match construction from team data. */
import { BASKETBALL_TEAMS } from '../data/basketball';
import { CRICKET_TEAMS } from '../data/cricket';
import { ESPORTS_TEAMS, MAPS } from '../data/esports';
import { FOOTBALL_TEAMS } from '../data/football';
import { TENNIS_PLAYERS } from '../data/tennis';
import type { League, SportId } from '../data/types';
import { Rng, shuffle } from '../lib/rng';
import type { SportModule } from './sport';
import { basketball, createBasketball } from './sports/basketball';
import { createCricket, cricket } from './sports/cricket';
import { createEsports, esports } from './sports/esports';
import { createFootball, football } from './sports/football';
import { createTennis, tennis } from './sports/tennis';
import type { Participant } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = SportModule<any, any>;

export const MODULES: Record<SportId, AnyModule> = { football, basketball, tennis, cricket, esports };

export function participant(sport: SportId, id: string): Participant {
  const src =
    sport === 'football' ? FOOTBALL_TEAMS : sport === 'basketball' ? BASKETBALL_TEAMS : sport === 'tennis' ? TENNIS_PLAYERS : sport === 'cricket' ? CRICKET_TEAMS : ESPORTS_TEAMS;
  const t = (src as { id: string; name: string; short: string; colors: [string, string] }[]).find((x) => x.id === id)!;
  return { id: t.id, name: t.name, short: t.short, colors: t.colors };
}

export function createState(league: League, homeId: string, awayId: string, rng: Rng): unknown {
  switch (league.sport) {
    case 'football': {
      const h = FOOTBALL_TEAMS.find((t) => t.id === homeId)!;
      const a = FOOTBALL_TEAMS.find((t) => t.id === awayId)!;
      return createFootball(h, a, false);
    }
    case 'basketball':
      return createBasketball(BASKETBALL_TEAMS.find((t) => t.id === homeId)!, BASKETBALL_TEAMS.find((t) => t.id === awayId)!, league.id === 'euroleague');
    case 'tennis':
      return createTennis(TENNIS_PLAYERS.find((t) => t.id === homeId)!, TENNIS_PLAYERS.find((t) => t.id === awayId)!);
    case 'cricket':
      return createCricket(CRICKET_TEAMS.find((t) => t.id === homeId)!, CRICKET_TEAMS.find((t) => t.id === awayId)!, league.id === 'ipl');
    case 'esports': {
      const h = ESPORTS_TEAMS.find((t) => t.id === homeId)!;
      const a = ESPORTS_TEAMS.find((t) => t.id === awayId)!;
      const maps = h.game === 'lol' ? ['Game 1', 'Game 2', 'Game 3'] : shuffle(rng, [...MAPS[h.game]]).slice(0, 3);
      return createEsports(h, a, maps);
    }
  }
}

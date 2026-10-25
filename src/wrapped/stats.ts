/**
 * Wrapped: a player's week or month in numbers, and the betting personality those numbers
 * suggest. Pure functions over the bets already on the device (synced from the cloud).
 * Amounts are converted to the wallet's currency so mixed-currency bets add up.
 */
import type { BetRow } from '../db/db';
import type { SportId } from '../data/types';
import { convertMinor } from '../lib/money';

export type Period = 'week' | 'month';

export interface Persona {
  id: 'livewire' | 'maverick' | 'architect' | 'sniper' | 'loyalist' | 'nightowl' | 'allrounder';
  name: string;
  line: string;
  traits: string[];
  colors: [string, string];
}

export interface Wrapped {
  period: Period;
  from: number;
  to: number;
  currency: string;
  placed: number;
  settled: number;
  won: number;
  lost: number;
  winRate: number | null; // won / (won + lost)
  staked: bigint;
  returned: bigint;
  net: bigint; // returned − staked, for bets settled in the period
  sports: { id: SportId; n: number }[];
  topLeague: { id: string; n: number } | null;
  team: { name: string; n: number } | null;
  biggestWin: { profit: bigint; label: string; match: string; odds: number } | null;
  longestOdds: { odds: number; label: string } | null;
  bestStreak: number;
  liveShare: number; // share of legs placed in-play
  nightShare: number; // share of bets placed 21:00–04:00
  underdogShare: number; // share of legs at odds ≥ 2.5
  parlayShare: number;
  closeCall: { match: string; legs: number } | null; // a parlay lost by one leg
  busiestDay: string | null;
  persona: Persona;
}

const DAY = 86_400_000;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function periodRange(period: Period, now = Date.now()): { from: number; to: number } {
  return { from: now - (period === 'week' ? 7 : 30) * DAY, to: now };
}

const PERSONAS: Record<Persona['id'], Omit<Persona, 'traits'>> = {
  livewire: { id: 'livewire', name: 'The Live Wire', line: 'You bet with the game in front of you. Kick-off is when you wake up.', colors: ['#F43F5E', '#7C6CF6'] },
  maverick: { id: 'maverick', name: 'The Maverick', line: 'Favourites are boring. You back the upset and enjoy the ride.', colors: ['#F59E0B', '#F45BB5'] },
  architect: { id: 'architect', name: 'The Architect', line: 'One pick is never enough. You build parlays like blueprints.', colors: ['#3B5BDB', '#B5F23D'] },
  sniper: { id: 'sniper', name: 'The Sniper', line: 'Patient, precise, rarely wrong. You pick your shots.', colors: ['#B5F23D', '#22C55E'] },
  loyalist: { id: 'loyalist', name: 'The Loyalist', line: 'Win or lose, you ride with your team.', colors: ['#7C6CF6', '#F45BB5'] },
  nightowl: { id: 'nightowl', name: 'The Night Owl', line: 'The later the match, the sharper you get.', colors: ['#3B5BDB', '#7C6CF6'] },
  allrounder: { id: 'allrounder', name: 'The All-Rounder', line: 'A bit of everything, a lot of fun. You play it your way.', colors: ['#7C6CF6', '#B5F23D'] },
};

/** Players settle every leg as a team name when they back a side; otherwise the label is a market pick. */
function teamOf(leg: BetRow['legs'][number]): string | null {
  if (leg.label === leg.home || leg.label === leg.away) return leg.label;
  return null;
}

function isWin(b: BetRow): boolean {
  if (b.status === 'WON') return true;
  if (b.status === 'CASHED_OUT') return BigInt(b.cashedOutMinor) > BigInt(b.stakeMinor);
  return false;
}

export function computeWrapped(bets: BetRow[], period: Period, currency: string, now = Date.now()): Wrapped {
  const { from, to } = periodRange(period, now);
  const conv = (minor: bigint, code: string) => (code === currency ? minor : convertMinor(minor, code, currency));
  const placed = bets.filter((b) => b.placedAt >= from && b.placedAt <= to);
  const settledBets = bets
    .filter((b) => b.status !== 'OPEN' && b.status !== 'PARTIALLY_CASHED_OUT' && (b.settledAt ?? b.placedAt) >= from && (b.settledAt ?? b.placedAt) <= to)
    .sort((a, b) => (a.settledAt ?? a.placedAt) - (b.settledAt ?? b.placedAt));

  let won = 0;
  let lost = 0;
  let staked = 0n;
  let returned = 0n;
  let streak = 0;
  let bestStreak = 0;
  let biggestWin: Wrapped['biggestWin'] = null;
  let longestOdds: Wrapped['longestOdds'] = null;
  let closeCall: Wrapped['closeCall'] = null;
  for (const b of settledBets) {
    const stake = conv(BigInt(b.stakeMinor), b.currency);
    const back = conv(BigInt(b.returnMinor ?? (b.status === 'CASHED_OUT' ? b.cashedOutMinor : '0')), b.currency);
    staked += stake;
    returned += back;
    if (b.status === 'VOID') continue;
    if (isWin(b)) {
      won++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      const profit = back - stake;
      const match = `${b.legs[0].home} v ${b.legs[0].away}${b.legs.length > 1 ? ` +${b.legs.length - 1}` : ''}`;
      if (!biggestWin || profit > biggestWin.profit) biggestWin = { profit, label: b.legs.length > 1 ? `${b.legs.length}-leg parlay` : b.legs[0].label, match, odds: b.totalOdds };
      if (b.status === 'WON' && (!longestOdds || b.totalOdds > longestOdds.odds)) longestOdds = { odds: b.totalOdds, label: b.legs.length > 1 ? `${b.legs.length}-leg parlay` : b.legs[0].label };
    } else {
      lost++;
      streak = 0;
      const lostLegs = b.legs.filter((l) => l.result === 'LOST' || l.result === 'HALF_LOST').length;
      if (b.type === 'PARLAY' && b.legs.length >= 3 && lostLegs === 1) closeCall = { match: `${b.legs.length}-leg parlay`, legs: b.legs.length };
    }
  }

  // habits come from what was placed in the period
  const legs = placed.flatMap((b) => b.legs);
  const count = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const sports = count(legs.map((l) => l.sport)).map(([id, n]) => ({ id, n }));
  const leagues = count(legs.map((l) => l.leagueId));
  const teams = count(legs.map(teamOf).filter((t): t is string => !!t));
  const days = count(placed.map((b) => DAYS[new Date(b.placedAt).getDay()]));
  const share = (n: number, d: number) => (d ? n / d : 0);
  const liveShare = share(legs.filter((l) => l.live).length, legs.length);
  const nightShare = share(placed.filter((b) => { const h = new Date(b.placedAt).getHours(); return h >= 21 || h < 4; }).length, placed.length);
  const underdogShare = share(legs.filter((l) => l.odds >= 2.5).length, legs.length);
  const parlayShare = share(placed.filter((b) => b.type !== 'SINGLE').length, placed.length);
  const team = teams[0] && teams[0][1] >= 2 ? { name: teams[0][0], n: teams[0][1] } : null;
  const loyalty = team ? team.n / Math.max(1, legs.length) : 0;
  const winRate = won + lost ? won / (won + lost) : null;
  const avgOdds = legs.length ? legs.reduce((a, l) => a + l.odds, 0) / legs.length : 0;

  // the trait that stands out most, relative to where it starts to mean something
  const scores: [Persona['id'], number][] = [
    ['livewire', liveShare / 0.5],
    ['maverick', underdogShare / 0.4],
    ['architect', parlayShare / 0.5],
    ['sniper', winRate !== null && won + lost >= 3 && avgOdds < 2.2 ? winRate / 0.6 : 0],
    ['loyalist', loyalty / 0.35],
    ['nightowl', nightShare / 0.5],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const pid: Persona['id'] = placed.length >= 2 && scores[0][1] >= 1 ? scores[0][0] : 'allrounder';
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const traits = [
    liveShare >= 0.25 ? `${pct(liveShare)} of picks made in-play` : null,
    underdogShare >= 0.25 ? `${pct(underdogShare)} of picks on underdogs` : null,
    parlayShare >= 0.25 ? `${pct(parlayShare)} of bets were parlays` : null,
    nightShare >= 0.3 ? `${pct(nightShare)} placed after 9 pm` : null,
    team ? `${team.name} ×${team.n}` : null,
    winRate !== null ? `${pct(winRate)} win rate` : null,
  ].filter((t): t is string => !!t).slice(0, 3);

  return {
    period, from, to, currency,
    placed: placed.length,
    settled: settledBets.length,
    won, lost, winRate,
    staked, returned, net: returned - staked,
    sports,
    topLeague: leagues[0] ? { id: leagues[0][0], n: leagues[0][1] } : null,
    team,
    biggestWin: biggestWin && biggestWin.profit > 0n ? biggestWin : null,
    longestOdds,
    bestStreak,
    liveShare, nightShare, underdogShare, parlayShare,
    closeCall,
    busiestDay: days[0] && days[0][1] >= 2 ? days[0][0] : null,
    persona: { ...PERSONAS[pid], traits },
  };
}

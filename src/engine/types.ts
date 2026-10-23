/**
 * Contracts shared by the engine (worker) and the app (main thread).
 * Everything here is plain data so it can cross postMessage and live in IndexedDB.
 */
import type { EsportsGame, SportId } from '../data/types';
import type { LegResult } from '../lib/money';

export type EventStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'SUSPENDED';
export type MarketStatus = 'OPEN' | 'SUSPENDED' | 'SETTLED' | 'VOID';
export type Side = 0 | 1;

export interface Participant {
  id: string;
  name: string;
  short: string;
  colors: [string, string];
}

export type IncidentKind =
  | 'start' | 'period' | 'end' | 'goal' | 'nogoal' | 'yellow' | 'red' | 'penalty' | 'chance' | 'save' | 'corner'
  | 'basket' | 'three' | 'run' | 'timeout' | 'foul'
  | 'break' | 'game' | 'set' | 'tiebreak' | 'retire'
  | 'wicket' | 'four' | 'six' | 'over' | 'milestone'
  | 'round' | 'map' | 'kill' | 'objective' | 'info' | 'void';

export interface Incident {
  id: string;
  at: number; // epoch ms (real time)
  clock: string; // sport clock label: 62', Q3 4:12, S2 3-2, 14.3
  kind: IncidentKind;
  side?: Side;
  text: string;
  major?: boolean; // goal-like: triggers the banner sweep
}

export interface StatRow {
  key: string;
  label: string;
  home: number;
  away: number;
  fmt?: 'int' | 'pct' | 'dec1' | 'dec2';
}

export interface ScoreLine {
  label: string;
  home: string;
  away: string;
}

export interface Selection {
  id: string; // `${marketId}|${code}`
  code: string;
  label: string;
  odds: number; // offered decimal odds, 2 dp
  prevOdds: number;
  fair: number; // fair win-equivalent probability, used for cash out
  result: LegResult;
  locked?: boolean; // individually unavailable (price too short)
}

export interface Market {
  id: string; // `${eventId}|${key}`
  eventId: string;
  key: string;
  name: string;
  group: string;
  line?: number;
  status: MarketStatus;
  closed?: boolean; // betting window over, awaiting result
  selections: Selection[];
  order: number;
}

export interface EventPublic {
  id: string;
  sport: SportId;
  leagueId: string;
  game?: EsportsGame;
  home: Participant;
  away: Participant;
  startTime: number;
  status: EventStatus;
  venue: string;
  round: string;
  // live presentation
  clock: string;
  period: string;
  score: [number, number];
  scoreText?: [string, string]; // when the score is not a plain integer (cricket 156/4)
  lines: ScoreLine[];
  stats: StatRow[];
  incidents: Incident[];
  momentum: number; // -1 (away) .. 1 (home)
  momentumHistory: number[];
  pressure: number; // 0..1 attacking pressure magnitude
  serving?: Side;
  progress: number; // 0..1
  suspendedUntil?: number;
  result?: { winner: Side | null; void?: boolean; note?: string };
  endedAt?: number;
  markets: Market[];
  updatedAt: number;
}

// ── worker protocol ──

export interface EngineSettings {
  speedMinutes: number; // 5 | 10 | 20 | 0 (0 = real time)
}

export type ToEngine =
  | { type: 'init'; snapshot: EngineSnapshot | null; settings: EngineSettings; now: number }
  | { type: 'settings'; settings: EngineSettings }
  | { type: 'focus'; eventId: string | null }
  | { type: 'snapshot-request' };

export type FromEngine =
  | { type: 'ready'; events: EventPublic[] }
  | { type: 'update'; events: EventPublic[]; removed: string[] }
  | { type: 'snapshot'; snapshot: EngineSnapshot }
  | { type: 'log'; msg: string };

export interface EngineSnapshot {
  savedAt: number;
  events: unknown[]; // opaque serialized engine events
}

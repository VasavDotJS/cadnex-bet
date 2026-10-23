/** IndexedDB schema (Dexie). Money is stored as decimal strings of minor units. */
import Dexie, { Table } from 'dexie';
import type { LegResult } from '../lib/money';
import type { OddsFormat } from '../lib/odds';
import type { SportId } from '../data/types';
import type { EngineSnapshot } from '../engine/types';

export interface UserRow {
  id: string;
  username: string;
  usernameLower: string;
  email: string;
  emailLower: string;
  passwordHash: string;
  salt: string;
  iterations: number;
  avatarSeed: number;
  createdAt: number;
  dob: string;
}

export interface SessionRow {
  id: 'current';
  userId: string;
  remember: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface WalletRow {
  userId: string;
  currency: string;
  balanceMinor: string;
  updatedAt: number;
}

export type LedgerType = 'DEPOSIT' | 'WITHDRAW' | 'DEMO_ADJUST' | 'BET_PLACED' | 'BET_WON' | 'BET_REFUND' | 'CASHOUT' | 'CURRENCY_CONVERT' | 'BONUS';

export interface LedgerRow {
  id: string;
  userId: string;
  type: LedgerType;
  amountMinor: string; // signed
  balanceAfterMinor: string;
  currency: string;
  refId?: string;
  note?: string;
  createdAt: number;
}

export interface BetLeg {
  selectionId: string;
  eventId: string;
  marketKey: string;
  code: string;
  sport: SportId;
  leagueId: string;
  home: string;
  away: string;
  marketName: string;
  label: string;
  odds: number;
  oddsE4: string;
  result: LegResult;
  startTime: number;
  live: boolean;
}

export type BetType = 'SINGLE' | 'PARLAY' | 'SYSTEM';
export type BetStatus = 'OPEN' | 'WON' | 'LOST' | 'VOID' | 'CASHED_OUT' | 'PARTIALLY_CASHED_OUT';

export interface BetRow {
  id: string;
  userId: string;
  type: BetType;
  systemType?: string;
  stakeMinor: string; // original total stake
  activeStakeMinor: string; // stake still riding after partial cash outs
  unitStakeMinor?: string; // per-line stake for system bets
  currency: string;
  totalOdds: number;
  potentialReturnMinor: string;
  status: BetStatus;
  legs: BetLeg[];
  placedAt: number;
  settledAt?: number;
  returnMinor?: string;
  cashedOutMinor: string;
  cashOuts: { at: number; amountMinor: string; fraction: number }[];
  bookingCode?: string;
}

export interface SettingsRow {
  userId: string;
  theme: 'dark' | 'light' | 'system';
  oddsFormat: OddsFormat;
  oddsChange: 'any' | 'higher' | 'ask';
  reducedMotion: 'system' | 'on' | 'off';
  hideBalance: boolean;
  notifyGoals: boolean;
  notifySettled: boolean;
  favourites: string[]; // participant keys `${sport}:${id}`
  followed: string[]; // event ids
}

export interface DeviceRow {
  id: 'device';
  speedMinutes: number;
  ageConfirmed: boolean;
}

export interface EngineRow {
  id: 'snapshot';
  snapshot: EngineSnapshot;
}

export interface NotificationRow {
  id: string;
  userId: string;
  kind: 'goal' | 'settled' | 'info';
  title: string;
  body: string;
  link?: string;
  createdAt: number;
  read: boolean;
}

export interface ResetRow {
  userId: string;
  code: string;
  expiresAt: number;
}

class CadnexDB extends Dexie {
  users!: Table<UserRow, string>;
  sessions!: Table<SessionRow, string>;
  wallets!: Table<WalletRow, string>;
  ledger!: Table<LedgerRow, string>;
  bets!: Table<BetRow, string>;
  settings!: Table<SettingsRow, string>;
  device!: Table<DeviceRow, string>;
  engine!: Table<EngineRow, string>;
  notifications!: Table<NotificationRow, string>;
  resets!: Table<ResetRow, string>;

  constructor() {
    super('cadnex');
    this.version(1).stores({
      users: 'id, &usernameLower, &emailLower',
      sessions: 'id',
      wallets: 'userId',
      ledger: 'id, userId, [userId+createdAt], refId',
      bets: 'id, userId, [userId+placedAt], status',
      settings: 'userId',
      device: 'id',
      engine: 'id',
      notifications: 'id, userId, [userId+createdAt]',
      resets: 'userId',
    });
  }
}

export const db = new CadnexDB();

export function uid(prefix = ''): string {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return prefix + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

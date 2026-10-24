/**
 * How each synced table looks on the device (Dexie, camelCase) and in the cloud
 * (Postgres, snake_case). Local and cloud tables share their names.
 */
import type { BetRow, LedgerRow, NotificationRow, SettingsRow, WalletRow } from '../db/db';

export const SYNCED = ['wallets', 'ledger', 'bets', 'settings', 'notifications'] as const;
export type SyncedTable = (typeof SYNCED)[number];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Remote = Record<string, any>;
type LocalRow = WalletRow | LedgerRow | BetRow | SettingsRow | NotificationRow;

interface Mapping {
  /** primary key on the device */
  key: (row: any) => string;
  toRemote: (row: any) => Remote;
  toLocal: (row: Remote) => LocalRow;
}

export const MAP: Record<SyncedTable, Mapping> = {
  wallets: {
    key: (w: WalletRow) => w.userId,
    toRemote: (w: WalletRow) => ({ user_id: w.userId, currency: w.currency, balance_minor: w.balanceMinor, client_updated_at: w.updatedAt }),
    toLocal: (r) => ({ userId: r.user_id, currency: r.currency, balanceMinor: String(r.balance_minor), updatedAt: Number(r.client_updated_at ?? 0) }),
  },
  ledger: {
    key: (l: LedgerRow) => l.id,
    toRemote: (l: LedgerRow) => ({
      id: l.id, user_id: l.userId, type: l.type, amount_minor: l.amountMinor, balance_after_minor: l.balanceAfterMinor,
      currency: l.currency, ref_id: l.refId ?? null, note: l.note ?? null, created_at: l.createdAt,
    }),
    toLocal: (r) => {
      const l: LedgerRow = {
        id: r.id, userId: r.user_id, type: r.type, amountMinor: String(r.amount_minor), balanceAfterMinor: String(r.balance_after_minor),
        currency: r.currency, createdAt: Number(r.created_at),
      };
      if (r.ref_id) l.refId = r.ref_id;
      if (r.note) l.note = r.note;
      return l;
    },
  },
  bets: {
    key: (b: BetRow) => b.id,
    toRemote: (b: BetRow) => ({
      id: b.id, user_id: b.userId, type: b.type, status: b.status, currency: b.currency, stake_minor: b.stakeMinor,
      placed_at: b.placedAt, settled_at: b.settledAt ?? null, doc: b,
    }),
    toLocal: (r) => ({ ...(r.doc as BetRow), id: r.id, userId: r.user_id }),
  },
  settings: {
    key: (s: SettingsRow) => s.userId,
    toRemote: (s: SettingsRow) => ({ user_id: s.userId, doc: s }),
    toLocal: (r) => ({ ...(r.doc as SettingsRow), userId: r.user_id }),
  },
  notifications: {
    key: (n: NotificationRow) => n.id,
    toRemote: (n: NotificationRow) => ({
      id: n.id, user_id: n.userId, kind: n.kind, title: n.title, body: n.body, link: n.link ?? null, read: n.read, created_at: n.createdAt,
    }),
    toLocal: (r) => {
      const n: NotificationRow = { id: r.id, userId: r.user_id, kind: r.kind, title: r.title, body: r.body ?? '', createdAt: Number(r.created_at), read: !!r.read };
      if (r.link) n.link = r.link;
      return n;
    },
  },
};


import 'fake-indexeddb/auto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { toE4 } from '../lib/money';
import { authService, PublicUser } from '../services/authService';
import { betService } from '../services/betService';
import { walletService } from '../services/walletService';
import { setCloudClient } from './client';
import { clearLocal, flush, pull, startSync, stopSync, syncState } from './sync';

/* eslint-disable @typescript-eslint/no-explicit-any */

// tests run in Node: give them a localStorage
if (!(globalThis as any).localStorage) {
  const m = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

/** A tiny in-memory stand-in for the parts of Supabase the sync uses. */
function fakeCloud() {
  const tables: Record<string, Map<string, any>> = {};
  const upserts: { table: string; rows: any[] }[] = [];
  let clock = Date.parse('2026-10-25T00:00:00Z');
  const pk = (t: string) => (t === 'wallets' || t === 'settings' ? 'user_id' : 'id');
  const tbl = (t: string) => (tables[t] ??= new Map());
  const client = {
    from(table: string) {
      const filters: ((r: any) => boolean)[] = [];
      let range: [number, number] = [0, 999];
      const q: any = {
        select: () => q,
        eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return q; },
        gt: (c: string, v: any) => { filters.push((r) => r[c] > v); return q; },
        order: () => q,
        range: (a: number, b: number) => { range = [a, b]; return q; },
        then: (res: any) => {
          const rows = [...tbl(table).values()].filter((r) => filters.every((f) => f(r))).sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
          return Promise.resolve({ data: rows.slice(range[0], range[1] + 1), error: null }).then(res);
        },
        upsert: (rows: any[]) => {
          upserts.push({ table, rows });
          for (const r of rows) tbl(table).set(r[pk(table)], { ...r, updated_at: new Date((clock += 1000)).toISOString() });
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => Promise.resolve('ok'),
  };
  /** Another device writes straight to the cloud. */
  const remoteWrite = (table: string, row: any) => tbl(table).set(row[pk(table)], { ...row, updated_at: new Date((clock += 1000)).toISOString() });
  return { client: client as unknown as SupabaseClient, tables, upserts, remoteWrite };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const me: PublicUser = { id: ME, username: 'vasav', email: 'v@x.io', avatarSeed: 1, createdAt: 0, dob: '1990-01-01', currency: 'USD' };

const leg = (eventId: string, odds: number) => ({
  selectionId: `${eventId}|1x2|1`, eventId, marketKey: '1x2', code: '1', sport: 'football' as const, leagueId: 'eng.1',
  home: 'Arsenal', away: 'Chelsea', marketName: 'Match result', label: 'Arsenal', odds, oddsE4: toE4(odds).toString(), startTime: Date.now(), live: false,
});

describe('cloud sync', () => {
  let cloud: ReturnType<typeof fakeCloud>;
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    localStorage.clear();
    cloud = fakeCloud();
    setCloudClient(cloud.client);
  });
  afterEach(async () => {
    await stopSync(0);
  });

  it('uploads the signed-in user’s changes, and only theirs', async () => {
    await startSync(ME, { fresh: true });
    await authService.openAccount(me);
    await authService.openAccount({ ...me, id: OTHER }); // someone else's leftovers on the device
    await settle();
    await flush();
    const wallets = cloud.tables.wallets;
    expect(wallets.get(ME)?.balance_minor).toBe('100000');
    expect(wallets.has(OTHER)).toBe(false);
    expect(cloud.tables.ledger.get(`l_start_${ME}`)?.amount_minor).toBe('100000');
    expect(syncState().pending).toBe(0);
  });

  it('downloads the whole account on a new device', async () => {
    cloud.remoteWrite('wallets', { user_id: ME, currency: 'INR', balance_minor: '4200000', client_updated_at: 5 });
    cloud.remoteWrite('ledger', { id: 'l_a', user_id: ME, type: 'DEPOSIT', amount_minor: '4200000', balance_after_minor: '4200000', currency: 'INR', ref_id: null, note: 'x', created_at: 1 });
    cloud.remoteWrite('settings', { user_id: ME, doc: { userId: ME, theme: 'light', oddsFormat: 'american' } });
    cloud.remoteWrite('wallets', { user_id: OTHER, currency: 'USD', balance_minor: '1', client_updated_at: 5 });
    await startSync(ME, { fresh: true });
    expect((await db.wallets.get(ME))?.balanceMinor).toBe('4200000');
    expect((await db.settings.get(ME))?.oddsFormat).toBe('american');
    expect(await db.wallets.get(OTHER)).toBeUndefined();
    // what came from the cloud is not uploaded straight back
    await settle();
    await flush();
    expect(cloud.upserts.length).toBe(0);
  });

  it('never lets an older cloud copy overwrite a change waiting to upload', async () => {
    await startSync(ME, { fresh: true });
    await authService.openAccount(me);
    await settle();
    await flush();
    await walletService.setBalance(ME, 777n); // waiting in the outbox…
    cloud.remoteWrite('wallets', { user_id: ME, currency: 'USD', balance_minor: '5', client_updated_at: 1 });
    await pull();
    expect((await db.wallets.get(ME))?.balanceMinor).toBe('777');
    await settle();
    await flush();
    expect(cloud.tables.wallets.get(ME)?.balance_minor).toBe('777');
  });

  it('picks up changes made on another device', async () => {
    await startSync(ME, { fresh: true });
    await authService.openAccount(me);
    await settle();
    await flush();
    cloud.remoteWrite('wallets', { user_id: ME, currency: 'USD', balance_minor: '123456', client_updated_at: Date.now() });
    await pull();
    expect((await db.wallets.get(ME))?.balanceMinor).toBe('123456');
  });

  it('settles a bet once even if two devices both settle it', async () => {
    await startSync(ME, { fresh: true });
    await authService.openAccount(me);
    const [bet] = await betService.place(ME, [{ type: 'SINGLE', legs: [leg('e1', 2)], stakeMinor: 1000n }]);
    await betService.settle(() => 'WON', ME);
    const first = (await walletService.getLedger(ME)).filter((l) => l.type === 'BET_WON');
    expect(first.map((l) => l.id)).toEqual([`l_settle_${bet.id}`]);
    await settle();
    await flush();
    // a second device that had the bet open settles it too: same ledger id, so one entry
    await db.bets.put({ ...bet });
    await betService.settle(() => 'WON', ME);
    expect((await walletService.getLedger(ME)).filter((l) => l.type === 'BET_WON').length).toBe(1);
  });

  it('logging out leaves nothing of the account on the device', async () => {
    await startSync(ME, { fresh: true });
    await authService.openAccount(me);
    await settle();
    const { clean } = await stopSync();
    expect(clean).toBe(true);
    await clearLocal(ME);
    expect(await db.wallets.get(ME)).toBeUndefined();
    expect(await db.ledger.where('userId').equals(ME).count()).toBe(0);
    expect(cloud.tables.wallets.get(ME)?.balance_minor).toBe('100000'); // still safe in the cloud
  });
});

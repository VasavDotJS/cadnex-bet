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
import { LEAGUES } from '../data/leagues';
import { normalizeScoreboard } from '../feed/espn';
import type { FeedEvent } from '../feed/types';
import { soccerEvent } from '../live/fixtures';
import type { Change } from '../money/core';
import { prepare, quote } from '../money/market';
import { handleMoney, Store } from '../money/server';
import { OddsChangedError } from '../services/betService';

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

describe('cloud sync (device-side money, as older versions and tests use)', () => {
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
    await startSync(ME, { fresh: true, money: 'local' });
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
    await startSync(ME, { fresh: true, money: 'local' });
    expect((await db.wallets.get(ME))?.balanceMinor).toBe('4200000');
    expect((await db.settings.get(ME))?.oddsFormat).toBe('american');
    expect(await db.wallets.get(OTHER)).toBeUndefined();
    // what came from the cloud is not uploaded straight back
    await settle();
    await flush();
    expect(cloud.upserts.length).toBe(0);
  });

  it('never lets an older cloud copy overwrite a change waiting to upload', async () => {
    await startSync(ME, { fresh: true, money: 'local' });
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
    await startSync(ME, { fresh: true, money: 'local' });
    await authService.openAccount(me);
    await settle();
    await flush();
    cloud.remoteWrite('wallets', { user_id: ME, currency: 'USD', balance_minor: '123456', client_updated_at: Date.now() });
    await pull();
    expect((await db.wallets.get(ME))?.balanceMinor).toBe('123456');
  });

  it('settles a bet once even if two devices both settle it', async () => {
    await startSync(ME, { fresh: true, money: 'local' });
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
    await startSync(ME, { fresh: true, money: 'local' });
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


/** The money function, run in-process against the fake cloud's tables. */
function withMoneyFunction(cloud: ReturnType<typeof fakeCloud>, uid: string, events: Map<string, FeedEvent>) {
  const t = (name: string) => (cloud.tables[name] ??= new Map());
  const store: Store = {
    async wallet(u) { const w = t('wallets').get(u); return w ? { userId: u, currency: w.currency, balanceMinor: w.balance_minor, updatedAt: w.client_updated_at } : null; },
    async bets(u, ids) { return [...t('bets').values()].filter((b) => b.user_id === u && (ids === 'open' ? ['OPEN', 'PARTIALLY_CASHED_OUT'].includes(b.status) : ids.includes(b.id))).map((b) => b.doc); },
    async settings() { return null; },
    async ledgerSince(u, since) { return [...t('ledger').values()].filter((l) => l.user_id === u && l.created_at >= since).map((l) => ({ id: l.id, userId: u, type: l.type, amountMinor: l.amount_minor, balanceAfterMinor: l.balance_after_minor, currency: l.currency, createdAt: l.created_at, note: l.note ?? undefined })); },
    async ledgerHas(id) { return t('ledger').has(id); },
    async commit(u, c: Change) {
      cloud.remoteWrite('wallets', { user_id: u, currency: c.wallet.currency, balance_minor: c.wallet.balanceMinor, client_updated_at: c.wallet.updatedAt });
      for (const l of c.ledger) cloud.remoteWrite('ledger', { id: l.id, user_id: u, type: l.type, amount_minor: l.amountMinor, balance_after_minor: l.balanceAfterMinor, currency: l.currency, ref_id: l.refId ?? null, note: l.note ?? null, created_at: l.createdAt });
      for (const b of c.bets) cloud.remoteWrite('bets', { id: b.id, user_id: u, type: b.type, status: b.status, currency: b.currency, stake_minor: b.stakeMinor, placed_at: b.placedAt, settled_at: b.settledAt ?? null, doc: b });
    },
  };
  let n = 0;
  (cloud.client as any).functions = {
    invoke: async (_name: string, { body }: { body: Record<string, unknown> }) => ({
      data: await handleMoney(uid, String(body.action), body, { store, feed: { event: async (id) => events.get(id) ?? null }, now: () => Date.now(), id: (p) => `${p}srv${++n}` }),
      error: null,
    }),
  };
}

describe('cloud sync with server-owned money (the app)', () => {
  let cloud: ReturnType<typeof fakeCloud>;
  let events: Map<string, FeedEvent>;
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    localStorage.clear();
    cloud = fakeCloud();
    setCloudClient(cloud.client);
    events = new Map();
    withMoneyFunction(cloud, ME, events);
  });
  afterEach(async () => {
    await stopSync(0);
  });

  const EPL = LEAGUES.find((l) => l.id === 'eng.1')!;
  const fixture = () => {
    const ev = normalizeScoreboard(EPL, { events: [soccerEvent({ id: '901', start: Date.now() + 3_600_000, state: 'pre', home: ['359', 'Arsenal', 'ARS', 'ef0107'], away: ['363', 'Chelsea', 'CHE', '034694'], odds: { homeTeamOdds: { moneyLine: -150 }, awayTeamOdds: { moneyLine: 400 }, drawOdds: { moneyLine: 280 } } })] })[0];
    events.set(ev.id, ev);
    return ev;
  };

  it('opens the wallet on the server and never uploads money from the device', async () => {
    await startSync(ME, { fresh: true });
    await authService.openAccount(me);
    expect((await db.wallets.get(ME))?.balanceMinor).toBe('100000');
    expect(cloud.tables.wallets.get(ME)?.balance_minor).toBe('100000');
    // even a direct write to the device's wallet is not uploaded
    await db.wallets.put({ ...(await db.wallets.get(ME))!, balanceMinor: '999999999' });
    await settle();
    await flush();
    expect(cloud.upserts.filter((u) => ['wallets', 'ledger', 'bets'].includes(u.table))).toEqual([]);
    expect(cloud.tables.wallets.get(ME)?.balance_minor).toBe('100000');
  });

  it('places bets through the server and keeps its answer', async () => {
    await startSync(ME, { fresh: true });
    await authService.openAccount(me);
    const ev = fixture();
    const odds = quote(prepare(ev, Date.now())!, '1x2', '1').odds;
    const [bet] = await betService.place(ME, [{ type: 'SINGLE', legs: [{ ...leg(ev.id, odds), label: 'Made up' }], stakeMinor: 1000n }]);
    expect(bet.legs[0].label).toBe('Arsenal');
    expect((await db.bets.get(bet.id))?.status).toBe('OPEN');
    expect((await db.wallets.get(ME))?.balanceMinor).toBe('99000');
    // an inflated price comes back as "odds changed", with the real price
    const err = await betService.place(ME, [{ type: 'SINGLE', legs: [leg(ev.id, odds * 3)], stakeMinor: 1000n }]).catch((e) => e);
    expect(err).toBeInstanceOf(OddsChangedError);
    expect((err as OddsChangedError).prices[`${ev.id}|1x2|1`]).toBe(odds);
    expect((await db.wallets.get(ME))?.balanceMinor).toBe('99000');
  });

  it('still uploads settings and notifications from the device', async () => {
    await startSync(ME, { fresh: true });
    await authService.openAccount(me);
    await settle();
    await flush();
    expect(cloud.tables.settings.get(ME)).toBeTruthy();
  });
});

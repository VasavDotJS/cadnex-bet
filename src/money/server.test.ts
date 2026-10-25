import { beforeEach, describe, expect, it } from 'vitest';
import { LEAGUES } from '../data/leagues';
import type { BetRow, LedgerRow, SettingsRow, WalletRow } from '../db/db';
import { normalizeScoreboard } from '../feed/espn';
import type { FeedEvent } from '../feed/types';
import { goal, soccerEvent } from '../live/fixtures';
import type { Change } from './core';
import type { RgSettings } from './limits';
import { prepare, quote } from './market';
import { ConflictError, Deps, handleMoney, Ok, Reply, Store } from './server';

const EPL = LEAGUES.find((l) => l.id === 'eng.1')!;
const ARS: [string, string, string, string] = ['359', 'Arsenal', 'ARS', 'ef0107'];
const CHE: [string, string, string, string] = ['363', 'Chelsea', 'CHE', '034694'];
const ODDS = { provider: { name: 'DraftKings' }, details: 'ARS -0.5', overUnder: 2.5, homeTeamOdds: { moneyLine: -150 }, awayTeamOdds: { moneyLine: 400 }, drawOdds: { moneyLine: 280 } };
const T0 = Date.UTC(2026, 9, 23, 18, 0, 0);
const UID = '00000000-0000-4000-8000-000000000001';

class MemStore implements Store {
  wallets = new Map<string, WalletRow>();
  ledger = new Map<string, LedgerRow>();
  betRows = new Map<string, BetRow>();
  settingsRows = new Map<string, SettingsRow & { rg?: RgSettings }>();
  conflictsLeft = 0;
  commits = 0;
  async wallet(uid: string) { return this.wallets.get(uid) ?? null; }
  async bets(uid: string, ids: string[] | 'open') {
    const all = [...this.betRows.values()].filter((b) => b.userId === uid);
    return ids === 'open' ? all.filter((b) => b.status === 'OPEN' || b.status === 'PARTIALLY_CASHED_OUT') : all.filter((b) => ids.includes(b.id));
  }
  async settings(uid: string) { return this.settingsRows.get(uid) ?? null; }
  async ledgerSince(uid: string, since: number) { return [...this.ledger.values()].filter((l) => l.userId === uid && l.createdAt >= since); }
  async ledgerHas(id: string) { return this.ledger.has(id); }
  async commit(uid: string, c: Change) {
    if (this.conflictsLeft > 0) { this.conflictsLeft--; throw new ConflictError(); }
    const cur = this.wallets.get(uid);
    if ((cur?.balanceMinor ?? null) !== c.before) throw new ConflictError();
    for (const l of c.ledger) if (this.ledger.has(l.id)) throw new Error(`duplicate ledger ${l.id}`);
    this.wallets.set(uid, c.wallet);
    for (const l of c.ledger) this.ledger.set(l.id, l);
    for (const b of c.bets) this.betRows.set(b.id, b);
    this.commits++;
  }
}

let store: MemStore;
let feed: Map<string, FeedEvent>;
let now: number;
let seq = 0;
const deps = (): Deps => ({ store, feed: { event: async (id) => feed.get(id) ?? null }, now: () => now, id: (p) => `${p}${(++seq).toString(16).padStart(8, '0')}` });
const call = (action: string, body: Record<string, unknown> = {}) => handleMoney(UID, action, body, deps());
const ok = (r: Reply): Ok => { if (!r.ok) throw new Error(`${r.code}: ${r.message}`); return r; };

function match(o: Partial<Parameters<typeof soccerEvent>[0]> & { id: string }): FeedEvent {
  const ev = normalizeScoreboard(EPL, { events: [soccerEvent({ start: now + 3_600_000, state: 'pre', home: ARS, away: CHE, odds: ODDS, ...o })] })[0];
  feed.set(ev.id, ev);
  return ev;
}
const priceOf = (ev: FeedEvent, key: string, code: string) => quote(prepare(ev, now)!, key, code).odds;
const leg = (ev: FeedEvent, key: string, code: string, odds = priceOf(ev, key, code)) => ({ selectionId: `${ev.id}|${key}|${code}`, eventId: ev.id, marketKey: key, code, odds, label: 'HACKED', marketName: 'HACKED' });
const single = (l: ReturnType<typeof leg>, stake = '1000') => ({ bets: [{ type: 'SINGLE', stakeMinor: stake, legs: [l] }] });
const balance = () => BigInt(store.wallets.get(UID)!.balanceMinor);

beforeEach(async () => {
  store = new MemStore();
  feed = new Map();
  now = T0;
  ok(await call('open', { currency: 'USD' }));
});

describe('server money', () => {
  it('opens a wallet once, with the starting balance', async () => {
    expect(balance()).toBe(100000n);
    ok(await call('open', { currency: 'EUR' }));
    expect(store.wallets.get(UID)!.currency).toBe('USD');
    expect(store.ledger.size).toBe(1);
  });

  it('places a bet at the server’s price and records the server’s own labels', async () => {
    const ev = match({ id: '801' });
    const r = ok(await call('place', single(leg(ev, '1x2', '1'))));
    expect(balance()).toBe(99000n);
    const b = r.bets[0];
    expect(b.legs[0]).toMatchObject({ label: 'Arsenal', marketName: 'Match result', home: 'Arsenal', away: 'Chelsea', sport: 'football' });
    expect(b.legs[0].odds).toBe(priceOf(ev, '1x2', '1'));
  });

  it('refuses inflated odds and reports the real price', async () => {
    const ev = match({ id: '802' });
    const real = priceOf(ev, '1x2', '2');
    const r = await call('place', single(leg(ev, '1x2', '2', real * 2)));
    expect(r).toMatchObject({ ok: false, code: 'ODDS_CHANGED' });
    expect((r as { prices: Record<string, number> }).prices[`${ev.id}|1x2|2`]).toBe(real);
    expect(balance()).toBe(100000n);
    // a price a few seconds stale (within tolerance) is fine
    ok(await call('place', single(leg(ev, '1x2', '2', Math.round(real * 1.03 * 100) / 100))));
  });

  it('refuses bets once a market is closed or the match is over', async () => {
    const soon = match({ id: '803', start: now + 5_000 });
    expect(await call('place', single(leg(soon, '1x2', '1', 1.8)))).toMatchObject({ ok: false, code: 'ODDS_CHANGED' });
    const done = match({ id: '804', start: now - 3 * 3_600_000, state: 'post', score: [1, 0], details: [goal('359', "10'", 'A')] });
    expect(await call('place', single(leg(done, '1x2', '1', 1.5)))).toMatchObject({ ok: false, code: 'ODDS_CHANGED' });
    expect(await call('place', single({ ...leg(match({ id: '805' }), '1x2', '1'), eventId: 'eng.1~1?x=2~20261023' }))).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
  });

  it('won’t spend money the player doesn’t have, or bet below the minimum', async () => {
    const ev = match({ id: '806' });
    expect(await call('place', single(leg(ev, '1x2', '1'), '100001'))).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(await call('place', single(leg(ev, '1x2', '1'), '1'))).toMatchObject({ ok: false, code: 'BET' });
    expect(balance()).toBe(100000n);
  });

  it('settles from the server’s results and never pays twice', async () => {
    const ev = match({ id: '807' });
    const price = priceOf(ev, '1x2', '1');
    const b = ok(await call('place', single(leg(ev, '1x2', '1')))).bets[0];
    // still to play: nothing to settle
    expect(ok(await call('settle', { betIds: [b.id] })).settled).toEqual([]);
    now += 3 * 3_600_000;
    match({ id: '807', start: T0 + 3_600_000, state: 'post', score: [2, 0], details: [goal('359', "10'", 'A'), goal('359', "70'", 'B')] });
    const r = ok(await call('settle', { betIds: [b.id] }));
    expect(r.settled).toEqual([b.id]);
    const win = BigInt(Math.round(1000 * price));
    expect(balance()).toBe(99000n + win);
    ok(await call('settle', { betIds: [b.id] }));
    ok(await call('settle', {}));
    expect(balance()).toBe(99000n + win);
    expect([...store.ledger.values()].filter((l) => l.type === 'BET_WON')).toHaveLength(1);
  });

  it('settles a lost bet without paying and voids bets on lost matches after four days', async () => {
    const ev = match({ id: '808' });
    const b = ok(await call('place', single(leg(ev, '1x2', '2')))).bets[0];
    const ghost = match({ id: '809' });
    const g = ok(await call('place', single(leg(ghost, '1x2', '1')))).bets[0];
    feed.delete(ghost.id);
    now += 3 * 3_600_000;
    match({ id: '808', start: T0 + 3_600_000, state: 'post', score: [1, 0], details: [goal('359', "10'", 'A')] });
    ok(await call('settle', {}));
    expect(store.betRows.get(b.id)!.status).toBe('LOST');
    expect(store.betRows.get(g.id)!.status).toBe('OPEN');
    now += 5 * 86_400_000;
    ok(await call('settle', {}));
    expect(store.betRows.get(g.id)!.status).toBe('VOID');
    expect(balance()).toBe(99000n); // the void bet's stake came back
  });

  it('values cash-outs itself and never pays more than the player was shown', async () => {
    const ev = match({ id: '810' });
    const b = ok(await call('place', single(leg(ev, '1x2', '1'), '10000'))).bets[0];
    now += 2 * 3_600_000;
    match({ id: '810', start: T0 + 3_600_000, state: 'in', clock: "60'", period: 2, score: [1, 0], details: [goal('359', "10'", 'A')] });
    // asking for far more than it's worth is refused
    expect(await call('cashout', { betId: b.id, fraction: 1, expected: '10000000' })).toMatchObject({ ok: false, code: 'VALUE_CHANGED' });
    // asking for less is paid at what the player saw
    const before = balance();
    const r = ok(await call('cashout', { betId: b.id, fraction: 1, expected: '12000' }));
    expect(r.paid).toBe('12000');
    expect(balance()).toBe(before + 12000n);
    expect(store.betRows.get(b.id)!.status).toBe('CASHED_OUT');
    expect(await call('cashout', { betId: b.id, fraction: 1, expected: '1' })).toMatchObject({ ok: false });
  });

  it('enforces self-exclusion and deposit limits on the server', async () => {
    const ev = match({ id: '811' });
    store.settingsRows.set(UID, { userId: UID, rg: { excludedUntil: now + 86_400_000 } } as SettingsRow & { rg: RgSettings });
    expect(await call('place', single(leg(ev, '1x2', '1')))).toMatchObject({ ok: false, code: 'LIMIT' });
    expect(await call('wallet', { op: { kind: 'deposit', amount: '500', method: 'Visa' } })).toMatchObject({ ok: false, code: 'LIMIT' });
    store.settingsRows.set(UID, { userId: UID, rg: { deposit: { amountMinor: '5000', currency: 'USD', period: 'day' } } } as SettingsRow & { rg: RgSettings });
    ok(await call('wallet', { op: { kind: 'deposit', amount: '4000', method: 'Visa' } }));
    expect(await call('wallet', { op: { kind: 'set', target: String(balance() + 2000n) } })).toMatchObject({ ok: false, code: 'LIMIT' });
    ok(await call('wallet', { op: { kind: 'withdraw', amount: '1000', method: 'Visa' } }));
  });

  it('gives the daily reward once a day', async () => {
    ok(await call('wallet', { op: { kind: 'daily' } }));
    expect(await call('wallet', { op: { kind: 'daily' } })).toMatchObject({ ok: false, code: 'TOO_SOON' });
    now += 86_400_001;
    ok(await call('wallet', { op: { kind: 'daily' } }));
  });

  it('retries when another request moved the balance first', async () => {
    store.conflictsLeft = 1;
    ok(await call('wallet', { op: { kind: 'deposit', amount: '500', method: 'Visa' } }));
    expect(balance()).toBe(100500n);
    store.conflictsLeft = 5;
    expect(await call('wallet', { op: { kind: 'deposit', amount: '500', method: 'Visa' } })).toMatchObject({ ok: false, code: 'BUSY' });
  });

  it('rejects malformed requests', async () => {
    expect(await call('nope')).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
    expect(await call('place', { bets: 'x' })).toMatchObject({ ok: false });
    expect(await call('wallet', { op: { kind: 'deposit', amount: '1e9', method: 'Visa' } })).toMatchObject({ ok: false });
    expect(await call('wallet', { op: { kind: 'currency', to: 'XXX', mode: 'convert' } })).toMatchObject({ ok: false });
  });
});

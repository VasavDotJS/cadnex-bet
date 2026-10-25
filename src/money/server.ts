/**
 * The server side of money: the only code allowed to change a signed-in player's wallet,
 * ledger and bets. It runs in the `money` Edge Function, with storage and the match feed
 * passed in, so it can be tested with in-memory stand-ins.
 *
 * Every bet is re-priced from the server's own copy of the match; cash-outs are valued the
 * same way; settlement uses the server's results. The device never sends a balance, a
 * result or a payout, only what the player asked for.
 */
import type { BetLeg, BetRow, LedgerRow, SettingsRow, WalletRow } from '../db/db';
import type { FeedEvent } from '../feed/types';
import { parseEventKey } from '../feed/types';
import type { LegQuote } from '../lib/betting';
import { isCurrency } from '../lib/currencies';
import { LegResult, toE4 } from '../lib/money';
import { BetError, cashOut, Change, Ctx, NewBet, openWallet, placeBets, settleBet, totalStake, WalletError, walletOp, WalletOp } from './core';
import { betLimitError, depositLimitError, effectiveRg, LOOKBACK_MS, RgSettings } from './limits';
import { describe, prepare, Prepared, quote, result } from './market';

/** How far a player's price may be above ours (their screen can be a few seconds behind). */
export const PRICE_TOLERANCE = 0.05;
/** Bets on matches we can no longer find are voided after this long. */
const LOST_EVENT_MS = 4 * 86_400_000;

export class ConflictError extends Error {}

export interface Store {
  wallet(uid: string): Promise<WalletRow | null>;
  bets(uid: string, ids: string[] | 'open'): Promise<BetRow[]>;
  settings(uid: string): Promise<(SettingsRow & { rg?: RgSettings }) | null>;
  /** ledger entries since `since` (ms) */
  ledgerSince(uid: string, since: number): Promise<LedgerRow[]>;
  ledgerHas(id: string): Promise<boolean>;
  /** Write a change atomically; throws ConflictError if the balance moved since `change.before`. */
  commit(uid: string, change: Change): Promise<void>;
}

export interface Feed {
  event(id: string): Promise<FeedEvent | null>;
}

export interface Deps {
  store: Store;
  feed: Feed;
  now: () => number;
  id: (prefix: string) => string;
}

export interface Ok {
  ok: true;
  wallet: WalletRow | null;
  ledger: LedgerRow[];
  bets: BetRow[];
  settled?: string[];
  paid?: string;
}
export interface Fail {
  ok: false;
  code: string;
  message: string;
  prices?: Record<string, number>;
}
export type Reply = Ok | Fail;

const fail = (code: string, message: string, prices?: Record<string, number>): Fail => ({ ok: false, code, message, ...(prices ? { prices } : {}) });

function ctxFor(uid: string, deps: Deps): Ctx {
  const now = deps.now();
  let last = now;
  return { userId: uid, now, id: deps.id, stamp: () => (last = Math.max(last + 1, deps.now())) };
}

/** Fetch each match once per request. */
function events(deps: Deps, now: number) {
  const cache = new Map<string, Promise<Prepared | null>>();
  return (id: string) => {
    if (!cache.has(id)) cache.set(id, deps.feed.event(id).then((ev) => (ev ? prepare(ev, now) : null)).catch(() => null));
    return cache.get(id)!;
  };
}

async function rgFor(deps: Deps, uid: string, now: number) {
  const s = await deps.store.settings(uid);
  return effectiveRg(s?.rg, now).rg;
}

// ── actions ─────────────────────────────────────────────

async function open(uid: string, body: { currency?: unknown }, deps: Deps): Promise<Reply> {
  const existing = await deps.store.wallet(uid);
  if (existing) return { ok: true, wallet: existing, ledger: [], bets: [] };
  const code = typeof body.currency === 'string' && isCurrency(body.currency) ? body.currency : 'USD';
  const change = openWallet(ctxFor(uid, deps), code);
  await deps.store.commit(uid, change);
  return { ok: true, wallet: change.wallet, ledger: change.ledger, bets: [] };
}

async function wallet(uid: string, body: { op?: WalletOp }, deps: Deps): Promise<Reply> {
  const op = body.op;
  if (!op || typeof op !== 'object') return fail('BAD_REQUEST', 'Missing operation.');
  const w = await deps.store.wallet(uid);
  if (!w) return fail('WALLET', 'Wallet not found.');
  const ctx = ctxFor(uid, deps);
  let lastDaily = 0;
  if (op.kind === 'daily') {
    const rows = await deps.store.ledgerSince(uid, ctx.now - 86_400_000);
    lastDaily = Math.max(0, ...rows.filter((r) => r.type === 'BONUS' && r.note === 'Daily reward').map((r) => r.createdAt));
  }
  const change = walletOp(ctx, w, op, lastDaily);
  // money coming in (deposits and top-ups) must respect the player's deposit limit and breaks
  const delta = BigInt(change.wallet.balanceMinor) - BigInt(w.balanceMinor);
  if (delta > 0n && (op.kind === 'deposit' || op.kind === 'adjust' || op.kind === 'set')) {
    const err = depositLimitError(await rgFor(deps, uid, ctx.now), await deps.store.ledgerSince(uid, ctx.now - LOOKBACK_MS), delta, w.currency, ctx.now);
    if (err) return fail('LIMIT', err);
  }
  if (!change.ledger.length && change.wallet.currency === w.currency) return { ok: true, wallet: w, ledger: [], bets: [] };
  await deps.store.commit(uid, change);
  return { ok: true, wallet: change.wallet, ledger: change.ledger, bets: [] };
}

interface WireLeg { selectionId?: unknown; eventId?: unknown; marketKey?: unknown; code?: unknown; odds?: unknown }
interface WireBet { type?: unknown; systemType?: unknown; stakeMinor?: unknown; bookingCode?: unknown; legs?: unknown }

async function place(uid: string, body: { bets?: unknown }, deps: Deps): Promise<Reply> {
  const raw = Array.isArray(body.bets) ? (body.bets as WireBet[]) : [];
  if (!raw.length || raw.length > 20) return fail('BAD_REQUEST', 'Add a selection first.');
  const ctx = ctxFor(uid, deps);
  const ev = events(deps, ctx.now);
  const prices: Record<string, number> = {};
  const moved: string[] = [];
  const bets: NewBet[] = [];

  for (const b of raw) {
    if (typeof b.stakeMinor !== 'string' || !/^\d{1,30}$/.test(b.stakeMinor)) return fail('BAD_REQUEST', 'Enter a stake.');
    const legsIn = Array.isArray(b.legs) ? (b.legs as WireLeg[]) : [];
    if (!legsIn.length || legsIn.length > 20) return fail('BAD_REQUEST', 'Add a selection first.');
    const legs: Omit<BetLeg, 'result'>[] = [];
    for (const l of legsIn) {
      const eventId = String(l.eventId ?? '');
      const marketKey = String(l.marketKey ?? '');
      const code = String(l.code ?? '');
      const odds = Number(l.odds);
      const selectionId = `${eventId}|${marketKey}|${code}`;
      if (!parseEventKey(eventId) || !/^[\w.:+-]{1,40}$/.test(marketKey) || !/^[\w.:+-]{1,40}$/.test(code) || !Number.isFinite(odds)) return fail('BAD_REQUEST', 'That selection is not valid.');
      const p = await ev(eventId);
      if (!p) return fail('UNAVAILABLE', 'We can’t reach that match right now. Try again in a moment.');
      const q = quote(p, marketKey, code);
      const d = describe(p, marketKey, code);
      if (!q.available || !d) {
        prices[selectionId] = 0;
        moved.push(`${d?.label ?? 'A selection'} is no longer available`);
      } else if (odds > q.odds * (1 + PRICE_TOLERANCE)) {
        prices[selectionId] = q.odds;
        moved.push(`${d.label} is now ${q.odds.toFixed(2)}`);
      } else {
        prices[selectionId] = q.odds;
      }
      // every descriptive field comes from the server's own data, not the device
      legs.push({
        selectionId, eventId, marketKey, code, sport: p.ev.sport, leagueId: p.ev.leagueId, home: p.ev.home.name, away: p.ev.away.name,
        marketName: d?.marketName ?? marketKey, label: d?.label ?? code, odds, oddsE4: toE4(odds).toString(), startTime: p.ev.startTime, live: p.ev.status === 'LIVE',
      });
    }
    bets.push({
      type: b.type as NewBet['type'], systemType: typeof b.systemType === 'string' ? b.systemType : undefined, stakeMinor: BigInt(b.stakeMinor), legs,
      bookingCode: typeof b.bookingCode === 'string' && /^[A-Z0-9-]{1,16}$/.test(b.bookingCode) ? b.bookingCode : undefined,
    });
  }
  if (moved.length) return fail('ODDS_CHANGED', `Odds changed: ${moved.slice(0, 2).join('; ')}${moved.length > 2 ? ` and ${moved.length - 2} more` : ''}. Check your slip and place again.`, prices);

  const w = await deps.store.wallet(uid);
  if (!w) return fail('WALLET', 'Wallet not found.');
  const err = betLimitError(await rgFor(deps, uid, ctx.now), await deps.store.ledgerSince(uid, ctx.now - LOOKBACK_MS), totalStake(bets), w.currency, ctx.now);
  if (err) return fail('LIMIT', err);
  const change = placeBets(ctx, w, bets);
  await deps.store.commit(uid, change);
  return { ok: true, wallet: change.wallet, ledger: change.ledger, bets: change.placed };
}

async function quotesFor(bet: BetRow, deps: Deps, now: number): Promise<(LegQuote | null)[]> {
  const ev = events(deps, now);
  return Promise.all(bet.legs.map(async (l) => {
    if (l.result !== 'PENDING') return null;
    const p = await ev(l.eventId);
    if (!p) return { fair: 0, available: false };
    const q = quote(p, l.marketKey, l.code);
    return { fair: q.fair, available: q.available && q.fair > 0 };
  }));
}

async function cash(uid: string, body: { betId?: unknown; fraction?: unknown; expected?: unknown }, deps: Deps): Promise<Reply> {
  const betId = String(body.betId ?? '');
  const fraction = Number(body.fraction);
  const expected = typeof body.expected === 'string' && /^\d{1,30}$/.test(body.expected) ? BigInt(body.expected) : -1n;
  if (!betId || !Number.isFinite(fraction) || expected < 0n) return fail('BAD_REQUEST', 'Choose how much to cash out.');
  const [bet] = await deps.store.bets(uid, [betId]);
  if (!bet) return fail('BET', 'Bet not found.');
  const w = await deps.store.wallet(uid);
  if (!w) return fail('WALLET', 'Wallet not found.');
  const ctx = ctxFor(uid, deps);
  const change = cashOut(ctx, w, bet, Math.round(fraction * 100) / 100, await quotesFor(bet, deps, ctx.now), expected);
  await deps.store.commit(uid, change);
  return { ok: true, wallet: change.wallet, ledger: change.ledger, bets: [change.bet], paid: change.paid.toString() };
}

async function settle(uid: string, body: { betIds?: unknown }, deps: Deps): Promise<Reply> {
  const ids = Array.isArray(body.betIds) ? (body.betIds as unknown[]).map(String).slice(0, 200) : null;
  const bets = (await deps.store.bets(uid, ids ?? 'open')).filter((b) => b.status === 'OPEN' || b.status === 'PARTIALLY_CASHED_OUT');
  if (!bets.length) return { ok: true, wallet: null, ledger: [], bets: [], settled: [] };
  const ctx = ctxFor(uid, deps);
  const ev = events(deps, ctx.now);
  // work out every pending leg first (one fetch per match)
  const results = new Map<string, LegResult | null>();
  await Promise.all(bets.flatMap((b) => b.legs.filter((l) => l.result === 'PENDING').map(async (l) => {
    const key = `${l.eventId}|${l.marketKey}|${l.code}`;
    if (results.has(key)) return;
    results.set(key, null);
    if (!parseEventKey(l.eventId)) { results.set(key, 'VOID'); return; }
    const p = await ev(l.eventId);
    if (!p) { results.set(key, ctx.now - l.startTime > LOST_EVENT_MS ? 'VOID' : null); return; }
    results.set(key, result(p, l.marketKey, l.code));
  })));
  const resultOf = (l: BetLeg) => results.get(`${l.eventId}|${l.marketKey}|${l.code}`) ?? null;

  const start = await deps.store.wallet(uid);
  if (!start) return fail('WALLET', 'Wallet not found.');
  let w: WalletRow = start;
  const ledger: LedgerRow[] = [];
  const out: BetRow[] = [];
  const settled: string[] = [];
  for (const bet of bets) {
    const r = settleBet(ctx, w, bet, resultOf, await deps.store.ledgerHas(`l_settle_${bet.id}`));
    if (!r) continue;
    if (r.ledger.length) w = r.wallet;
    ledger.push(...r.ledger);
    out.push(r.bet);
    if (r.settled) settled.push(r.bet.id);
  }
  if (!out.length) return { ok: true, wallet: null, ledger: [], bets: [], settled: [] };
  await deps.store.commit(uid, { before: start.balanceMinor, wallet: w, ledger, bets: out });
  return { ok: true, wallet: w, ledger, bets: out, settled };
}

const ACTIONS: Record<string, (uid: string, body: Record<string, unknown>, deps: Deps) => Promise<Reply>> = {
  open, wallet, place, cashout: cash, settle,
};

/** Handle one request from a signed-in player. Retries once if another request moved the balance first. */
export async function handleMoney(uid: string, action: string, body: Record<string, unknown>, deps: Deps): Promise<Reply> {
  const run = ACTIONS[action];
  if (!run) return fail('BAD_REQUEST', 'Unknown action.');
  for (let attempt = 0; ; attempt++) {
    try {
      return await run(uid, body ?? {}, deps);
    } catch (e) {
      if (e instanceof ConflictError && attempt < 2) continue;
      if (e instanceof ConflictError) return fail('BUSY', 'Your account was busy. Try again.');
      if (e instanceof BetError || e instanceof WalletError) return fail(e.code, e.message);
      throw e;
    }
  }
}

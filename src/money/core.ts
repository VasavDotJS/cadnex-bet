/**
 * The money rules, with no storage attached. Given the current wallet (and bet), each
 * operation returns exactly what changes: the new wallet, ledger entries and bets.
 *
 * The same code runs in two places:
 *  - on the server (the `money` Edge Function), which is the only thing allowed to write
 *    wallets, ledger entries and bets for signed-in players;
 *  - on the device in tests and offline tools, through the local services.
 * So the rules the app shows are exactly the rules the server enforces.
 */
import type { BetLeg, BetRow, BetType, LedgerRow, LedgerType, WalletRow } from '../db/db';
import { cashOutValue, decide, LegQuote, partialCashOut, potentialReturn } from '../lib/betting';
import { currency, isCurrency } from '../lib/currencies';
import { convertMinor, formatMoney, fxRate, LegResult, Minor, pow10, SYSTEM_TYPES, systemLines, units, usdToMinor } from '../lib/money';

export class BetError extends Error {
  constructor(message: string, public code = 'BET') {
    super(message);
  }
}
export class WalletError extends Error {
  constructor(message: string, public code = 'WALLET') {
    super(message);
  }
}

export const MAX_UNITS = 1_000_000_000n;
export const MAX_LEGS = 20;
export const MIN_ODDS = 1.01;
export const MAX_ODDS = 1001;

export function maxBalance(code: string): Minor {
  return units(MAX_UNITS, code);
}
export function minStake(code: string): Minor {
  return usdToMinor('0.10', code);
}
export function maxPayout(code: string): Minor {
  return usdToMinor('1000000', code, 'down');
}
export function systemUnit(total: Minor, systemType: string, n: number): Minor {
  const t = SYSTEM_TYPES.find((x) => x.id === systemType);
  if (!t) return 0n;
  const lines = BigInt(systemLines(t, n).length);
  return lines ? total / lines : 0n;
}

/** A friendly starting balance worth about 1,000 USD, rounded to two significant figures. */
export function startingBalance(code: string): Minor {
  const raw = convertMinor(100_000n, 'USD', code); // 1,000.00 USD
  const unitsWhole = Number(raw / pow10(currency(code).decimals));
  if (unitsWhole < 1) return raw; // crypto: keep exact
  const mag = Math.pow(10, Math.floor(Math.log10(unitsWhole)) - 1);
  const nice = Math.round(unitsWhole / mag) * mag;
  return BigInt(nice) * pow10(currency(code).decimals);
}

/** Daily reward: about 5 USD, rounded to one significant figure. */
export const DAILY_NOTE = 'Daily reward';
export const DAY_MS = 86_400_000;
export function dailyAmount(code: string): Minor {
  const raw = convertMinor(500n, 'USD', code);
  const d = currency(code).decimals;
  const n = Number(raw) / Number(pow10(d));
  if (n < 1) return raw;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  return BigInt(Math.max(1, Math.round(n / mag)) * mag) * pow10(d);
}

export interface Ctx {
  userId: string;
  now: number;
  /** new unique id with a prefix */
  id: (prefix: string) => string;
  /** strictly increasing timestamp for ledger ordering */
  stamp: () => number;
}

/** What an operation changes. `before` is the wallet balance it was computed from. */
export interface Change {
  before: string | null;
  wallet: WalletRow;
  ledger: LedgerRow[];
  bets: BetRow[];
}

/** A working copy of the wallet that records ledger entries as it moves. */
class Draft {
  w: WalletRow;
  ledger: LedgerRow[] = [];
  bets: BetRow[] = [];
  constructor(private ctx: Ctx, wallet: WalletRow, private before = wallet.balanceMinor) {
    this.w = { ...wallet };
  }
  move(delta: Minor, type: LedgerType, opts: { id?: string; refId?: string; note?: string; allowNegative?: boolean; currency?: string } = {}): LedgerRow {
    const cur = opts.currency ?? this.w.currency;
    if (cur !== this.w.currency) throw new WalletError(`This needs ${cur}, but your wallet is in ${this.w.currency}.`);
    const next = BigInt(this.w.balanceMinor) + delta;
    if (next < 0n && !opts.allowNegative) throw new WalletError('Insufficient balance.', 'INSUFFICIENT');
    if (next > maxBalance(this.w.currency)) throw new WalletError(`The demo balance is capped at ${formatMoney(maxBalance(this.w.currency), this.w.currency, { noDecimals: true })}.`);
    this.w = { ...this.w, balanceMinor: next.toString(), updatedAt: this.ctx.now };
    const entry: LedgerRow = {
      id: opts.id ?? this.ctx.id('l_'), userId: this.ctx.userId, type, amountMinor: delta.toString(), balanceAfterMinor: next.toString(), currency: this.w.currency,
      refId: opts.refId, note: opts.note, createdAt: this.ctx.stamp(),
    };
    this.ledger.push(entry);
    return entry;
  }
  done(): Change {
    return { before: this.before, wallet: this.w, ledger: this.ledger, bets: this.bets };
  }
}

// ── wallet ──────────────────────────────────────────────

/** First login of a brand-new account: a wallet with the starting balance. */
export function openWallet(ctx: Ctx, code: string): Change {
  const start = startingBalance(code);
  const wallet: WalletRow = { userId: ctx.userId, currency: code, balanceMinor: start.toString(), updatedAt: ctx.now };
  return {
    before: null,
    wallet,
    ledger: [{ id: `l_start_${ctx.userId}`, userId: ctx.userId, type: 'DEMO_ADJUST', amountMinor: start.toString(), balanceAfterMinor: start.toString(), currency: code, note: 'Starting demo balance', createdAt: ctx.stamp() }],
    bets: [],
  };
}

export type WalletOp =
  | { kind: 'deposit'; amount: string; method: string }
  | { kind: 'withdraw'; amount: string; method: string }
  | { kind: 'set'; target: string }
  | { kind: 'adjust'; delta: string }
  | { kind: 'currency'; to: string; mode: 'convert' | 'keep' }
  | { kind: 'daily' };

const METHOD = /^[\w .,'&()-]{1,40}$/;

export function walletOp(ctx: Ctx, wallet: WalletRow, op: WalletOp, lastDailyAt = 0): Change {
  const d = new Draft(ctx, wallet);
  const big = (s: string, what: string) => {
    if (!/^-?\d{1,30}$/.test(s)) throw new WalletError(`Enter a valid ${what}.`);
    return BigInt(s);
  };
  switch (op.kind) {
    case 'deposit': {
      const amount = big(op.amount, 'amount');
      if (amount <= 0n) throw new WalletError('Enter an amount above zero.');
      if (!METHOD.test(op.method)) throw new WalletError('Pick a payment method.');
      d.move(amount, 'DEPOSIT', { note: `Demo deposit via ${op.method}` });
      break;
    }
    case 'withdraw': {
      const amount = big(op.amount, 'amount');
      if (amount <= 0n) throw new WalletError('Enter an amount above zero.');
      if (!METHOD.test(op.method)) throw new WalletError('Pick a payout method.');
      d.move(-amount, 'WITHDRAW', { note: `Demo withdrawal to ${op.method}` });
      break;
    }
    case 'set': {
      const target = big(op.target, 'balance');
      if (target < 0n) throw new WalletError('The balance cannot be negative.');
      const delta = target - BigInt(wallet.balanceMinor);
      if (delta !== 0n) d.move(delta, 'DEMO_ADJUST', { note: 'Balance set' });
      break;
    }
    case 'adjust': {
      const delta = big(op.delta, 'amount');
      if (delta === 0n) break;
      d.move(delta, 'DEMO_ADJUST', { note: delta > 0n ? 'Demo top-up' : 'Demo reduction' });
      break;
    }
    case 'currency': {
      if (!/^[A-Z0-9]{2,6}$/.test(op.to) || !isCurrency(op.to)) throw new WalletError('Unknown currency.');
      if (wallet.currency === op.to) break;
      const bal = BigInt(wallet.balanceMinor);
      const df = currency(wallet.currency).decimals;
      const dt = currency(op.to).decimals;
      let next = op.mode === 'convert' ? convertMinor(bal, wallet.currency, op.to) : (bal * pow10(dt)) / pow10(df);
      if (next > maxBalance(op.to)) next = maxBalance(op.to);
      const rate = fxRate(wallet.currency, op.to);
      const note = op.mode === 'convert'
        ? `Converted ${formatMoney(bal, wallet.currency)} at 1 ${wallet.currency} = ${rate < 0.001 ? rate.toPrecision(4) : rate.toFixed(rate < 1 ? 6 : 4)} ${op.to}`
        : `Switched from ${wallet.currency}, kept the number`;
      d.w = { ...d.w, currency: op.to, balanceMinor: next.toString(), updatedAt: ctx.now };
      d.ledger.push({ id: ctx.id('l_'), userId: ctx.userId, type: 'CURRENCY_CONVERT', amountMinor: next.toString(), balanceAfterMinor: next.toString(), currency: op.to, note, createdAt: ctx.stamp() });
      break;
    }
    case 'daily': {
      if (lastDailyAt && lastDailyAt + DAY_MS > ctx.now) throw new WalletError('Already claimed. Come back tomorrow.', 'TOO_SOON');
      d.move(dailyAmount(wallet.currency), 'BONUS', { note: DAILY_NOTE });
      break;
    }
  }
  return d.done();
}

// ── bets ────────────────────────────────────────────────

export interface NewBet {
  type: BetType;
  systemType?: string;
  legs: Omit<BetLeg, 'result'>[];
  /** total stake (for system bets: unit stake × lines) */
  stakeMinor: Minor;
  bookingCode?: string;
}

const kindLabel = (r: Pick<BetRow, 'type' | 'legs' | 'systemType'>) => (r.type === 'SINGLE' ? 'Single' : r.type === 'PARLAY' ? `${r.legs.length}-leg parlay` : `System ${r.systemType}`);
const matchLabel = (legs: Pick<BetLeg, 'home' | 'away'>[]) => `${legs[0].home} v ${legs[0].away}${legs.length > 1 ? ' +' + (legs.length - 1) : ''}`;

/** Checks the shape of a new bet; prices are checked separately (the server re-prices every leg). */
export function validateShape(b: NewBet): void {
  if (!['SINGLE', 'PARLAY', 'SYSTEM'].includes(b.type)) throw new BetError('Unknown bet type.');
  if (!b.legs.length || b.legs.length > MAX_LEGS) throw new BetError(`A bet can have 1 to ${MAX_LEGS} selections.`);
  if (b.type === 'SINGLE' && b.legs.length !== 1) throw new BetError('A single has exactly one selection.');
  if (b.type === 'PARLAY' && b.legs.length < 2) throw new BetError('A parlay needs at least two selections.');
  if (b.type === 'SYSTEM') {
    const t = SYSTEM_TYPES.find((x) => x.id === b.systemType);
    if (!t || !systemLines(t, b.legs.length).length) throw new BetError('That system bet doesn’t fit these selections.');
  }
  if (b.type !== 'SINGLE' && new Set(b.legs.map((l) => l.eventId)).size !== b.legs.length) throw new BetError('Combine selections from different matches only.');
  for (const l of b.legs) {
    if (!(l.odds >= MIN_ODDS && l.odds <= MAX_ODDS) || !Number.isFinite(l.odds)) throw new BetError('Those odds are not available.');
  }
}

export function placeBets(ctx: Ctx, wallet: WalletRow, bets: NewBet[]): Change & { placed: BetRow[] } {
  if (!bets.length) throw new BetError('Add a selection first.');
  const cur = wallet.currency;
  const min = minStake(cur);
  const maxPay = maxPayout(cur);
  let total = 0n;
  const rows: BetRow[] = [];
  for (const b of bets) {
    validateShape(b);
    if (b.stakeMinor < min) throw new BetError(`Minimum stake is ${formatMoney(min, cur)}.`);
    const legs: BetLeg[] = b.legs.map((l) => ({ ...l, result: 'PENDING' as LegResult }));
    let unit: Minor | undefined;
    if (b.type === 'SYSTEM') {
      unit = systemUnit(b.stakeMinor, b.systemType!, legs.length);
      if (unit < min) throw new BetError(`Minimum stake per line is ${formatMoney(min, cur)}.`);
    }
    const draft: BetRow = {
      id: ctx.id('b_'), userId: ctx.userId, type: b.type, systemType: b.type === 'SYSTEM' ? b.systemType : undefined, stakeMinor: b.stakeMinor.toString(), activeStakeMinor: b.stakeMinor.toString(),
      unitStakeMinor: unit?.toString(), currency: cur, totalOdds: legs.reduce((a, l) => a * l.odds, 1), potentialReturnMinor: '0', status: 'OPEN', legs,
      placedAt: ctx.now, cashedOutMinor: '0', cashOuts: [], bookingCode: b.bookingCode,
    };
    if (b.type === 'SYSTEM') draft.stakeMinor = (unit! * BigInt(systemLines(SYSTEM_TYPES.find((t) => t.id === b.systemType)!, legs.length).length)).toString();
    draft.activeStakeMinor = draft.stakeMinor;
    const pot = potentialReturn(draft);
    if (pot > maxPay) throw new BetError(`Potential return is over the ${formatMoney(maxPay, cur, { noDecimals: true })} limit. Lower the stake.`);
    draft.potentialReturnMinor = pot.toString();
    total += BigInt(draft.stakeMinor);
    rows.push(draft);
  }
  if (BigInt(wallet.balanceMinor) < total) throw new WalletError('Insufficient balance.', 'INSUFFICIENT');
  const d = new Draft(ctx, wallet);
  for (const r of rows) {
    d.bets.push(r);
    d.move(-BigInt(r.stakeMinor), 'BET_PLACED', { refId: r.id, note: `${kindLabel(r)} · ${matchLabel(r.legs)}` });
  }
  return { ...d.done(), placed: rows };
}

/** Total stake of a list of new bets, after system-bet rounding (for limit checks). */
export function totalStake(bets: NewBet[]): Minor {
  let t = 0n;
  for (const b of bets) {
    if (b.type === 'SYSTEM') {
      const type = SYSTEM_TYPES.find((x) => x.id === b.systemType);
      const lines = type ? BigInt(systemLines(type, b.legs.length).length) : 1n;
      t += systemUnit(b.stakeMinor, b.systemType!, b.legs.length) * lines;
    } else t += b.stakeMinor;
  }
  return t;
}

export function cashOut(ctx: Ctx, wallet: WalletRow, bet: BetRow, fraction: number, quotes: (LegQuote | null)[], expected: Minor): Change & { bet: BetRow; paid: Minor } {
  if (bet.userId !== ctx.userId) throw new BetError('Bet not found.');
  if (!(fraction > 0 && fraction <= 1)) throw new BetError('Choose how much to cash out.');
  const value = cashOutValue(bet, quotes);
  if (value === null) throw new BetError('Cash out is unavailable right now.', 'UNAVAILABLE');
  // protect the customer: if the value moved down by more than 2% since they saw it, ask again
  if (value * 100n < expected * 98n) throw new BetError('The cash out value changed. Check the new amount and try again.', 'VALUE_CHANGED');
  // never pay more than the player was shown
  const offered = expected > 0n && value > expected ? expected : value;
  const full = fraction >= 0.999;
  const { paid, remainingStake } = full ? { paid: offered, remainingStake: 0n } : partialCashOut(BigInt(bet.activeStakeMinor), offered, fraction);
  if (paid <= 0n) throw new BetError('Cash out amount is too small.');
  const d = new Draft(ctx, wallet);
  const amt = convertMinor(paid, bet.currency, wallet.currency);
  d.move(amt, 'CASHOUT', { refId: bet.id, note: `${full ? 'Cash out' : `Partial cash out (${Math.round(fraction * 100)}%)`} · ${bet.legs[0].home} v ${bet.legs[0].away}` });
  const next: BetRow = {
    ...bet,
    activeStakeMinor: remainingStake.toString(),
    cashedOutMinor: (BigInt(bet.cashedOutMinor) + paid).toString(),
    cashOuts: [...bet.cashOuts, { at: ctx.now, amountMinor: paid.toString(), fraction }],
    status: full ? 'CASHED_OUT' : 'PARTIALLY_CASHED_OUT',
  };
  if (full) {
    next.settledAt = ctx.now;
    next.returnMinor = next.cashedOutMinor;
  }
  next.potentialReturnMinor = potentialReturn(next).toString();
  d.bets.push(next);
  return { ...d.done(), bet: next, paid };
}

/**
 * Apply leg results to an open bet. Returns null if nothing changed. `alreadyPaid` is true
 * when the payout entry for this bet already exists (never pay twice).
 */
export function settleBet(ctx: Ctx, wallet: WalletRow | null, bet: BetRow, resultOf: (leg: BetLeg) => LegResult | null, alreadyPaid: boolean): (Change & { bet: BetRow; settled: boolean }) | null {
  if (bet.status !== 'OPEN' && bet.status !== 'PARTIALLY_CASHED_OUT') return null;
  let changed = false;
  const legs = bet.legs.map((l) => {
    if (l.result !== 'PENDING') return l;
    const r = resultOf(l);
    if (r && r !== 'PENDING') { changed = true; return { ...l, result: r }; }
    return l;
  });
  if (!changed) return null;
  const next: BetRow = { ...bet, legs };
  next.potentialReturnMinor = potentialReturn(next).toString();
  const out = decide(next);
  const base: WalletRow = wallet ?? { userId: ctx.userId, currency: bet.currency, balanceMinor: '0', updatedAt: ctx.now };
  const d = new Draft(ctx, base);
  if (out) {
    next.status = out.status;
    next.settledAt = ctx.now;
    next.returnMinor = out.returnMinor.toString();
    if (out.returnMinor > 0n && !alreadyPaid && wallet) {
      const amt = convertMinor(out.returnMinor, bet.currency, wallet.currency);
      const note = `${out.status === 'WON' ? 'Winnings' : 'Refund'} · ${matchLabel(legs)}${wallet.currency !== bet.currency ? ` (converted from ${formatMoney(out.returnMinor, bet.currency)})` : ''}`;
      d.move(amt, out.status === 'WON' ? 'BET_WON' : 'BET_REFUND', { id: `l_settle_${bet.id}`, refId: bet.id, note });
    }
  }
  d.bets.push(next);
  return { ...d.done(), bet: next, settled: !!out };
}

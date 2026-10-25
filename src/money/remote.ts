/**
 * The device's link to the server's money function. When set (a player is signed in to a
 * cloud account), every wallet, bet and cash-out change is made by the server, and the
 * device only stores what the server returns.
 */
import type { BetRow, LedgerRow, WalletRow } from '../db/db';

export interface MoneyResult {
  wallet?: WalletRow | null;
  ledger: LedgerRow[];
  bets: BetRow[];
  /** bet ids that reached a final result in this call */
  settled?: string[];
  /** minor units paid by a cash out */
  paid?: string;
}

export interface MoneyFailure {
  code: string;
  message: string;
  /** fresh prices when odds moved: selectionId → decimal odds (0 = unavailable) */
  prices?: Record<string, number>;
}

export class MoneyError extends Error {
  constructor(public failure: MoneyFailure) {
    super(failure.message);
  }
  get code() {
    return this.failure.code;
  }
}

export type MoneyCall = (action: string, body: Record<string, unknown>) => Promise<MoneyResult>;

let call: MoneyCall | null = null;
let apply: ((r: MoneyResult) => Promise<void>) | null = null;

export function setRemoteMoney(fn: MoneyCall | null, store: ((r: MoneyResult) => Promise<void>) | null): void {
  call = fn;
  apply = store;
}

export function remoteMoney(): boolean {
  return !!call;
}

/** Ask the server to make a change, then keep its answer on the device. */
export async function serverMoney(action: string, body: Record<string, unknown>): Promise<MoneyResult> {
  if (!call || !apply) throw new Error('Not connected');
  const r = await call(action, body);
  await apply(r);
  return r;
}

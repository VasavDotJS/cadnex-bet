/**
 * Server-side pricing and results, from the server's own copy of a match. Uses the same
 * models as the app's live engine, so prices and results agree with what players see.
 */
import { fairOddsFromTally } from '../engine/sport';
import type { LegResult } from '../lib/money';
import { roundOdds } from '../lib/odds';
import type { FeedEvent } from '../feed/types';
import { LiveEngine, MODELS } from '../live/engine';
import type { Memory, Model } from '../live/model';

export interface Prepared {
  ev: FeedEvent;
  mem: Memory;
  model: Model;
  now: number;
}

/** Build the engine's per-match memory (pre-match strengths, goal order) from one snapshot. */
export function prepare(ev: FeedEvent, now: number): Prepared | null {
  const model = MODELS[ev.sport];
  if (!model) return null;
  const engine = new LiveEngine();
  engine.lastOk = now;
  engine.apply(ev, now);
  const it = engine.items.get(ev.id);
  if (!it) return null;
  return { ev: it.feed, mem: it.mem, model, now };
}

export interface Quote {
  /** decimal odds offered now (0 when unavailable) */
  odds: number;
  /** win-equivalent probability, as the app's `fair` */
  fair: number;
  available: boolean;
}

const NONE: Quote = { odds: 0, fair: 0, available: false };

/** The price the book offers right now for one selection, exactly as the live engine prices it. */
export function quote(p: Prepared, key: string, code: string): Quote {
  const { ev, mem, model, now } = p;
  if (ev.status !== 'SCHEDULED' && ev.status !== 'LIVE') return NONE;
  if (ev.status === 'SCHEDULED' && now > ev.startTime - 30_000) return NONE; // betting closes at kick-off
  const spec = model.spec(key, ev);
  if (!spec || !spec.sels.some((s) => s.code === code)) return NONE;
  if (model.settle(key, ev, mem, false)) return NONE; // already decided
  const tally = model.price(ev, mem, [spec]).get(key)?.[code];
  if (!tally) return NONE;
  const fairOdds = fairOddsFromTally(tally);
  const q = Number.isFinite(fairOdds) ? 1 / fairOdds : 0;
  const offered = q > 0 ? roundOdds(1 / (q * (1 + spec.margin))) : 0;
  const locked = q < 0.003 || q > 0.97 || offered <= 1.01;
  return { odds: locked ? 0 : offered, fair: q, available: !locked };
}

/** A selection's result, or null while it's still open. Mirrors the engine's settlement. */
export function result(p: Prepared, key: string, code: string): LegResult | null {
  const { ev, mem, model } = p;
  if (ev.status === 'POSTPONED' || ev.status === 'CANCELLED') return 'VOID';
  const final = ev.status === 'FINISHED';
  const spec = model.spec(key, ev);
  if (!spec) return final ? 'VOID' : null;
  const res = model.settle(key, ev, mem, final);
  if (res) return (res[code] as LegResult | undefined) ?? 'VOID';
  return final ? 'VOID' : null;
}

/** Label details from the server's own data, so a bet can't carry made-up names. */
export function describe(p: Prepared, key: string, code: string): { marketName: string; label: string } | null {
  const spec = p.model.spec(key, p.ev);
  const sel = spec?.sels.find((s) => s.code === code);
  return spec && sel ? { marketName: spec.name, label: sel.label } : null;
}

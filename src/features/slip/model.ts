/** Derived bet-slip state: live prices, conflicts, odds changes, totals and validation. */
import { useMemo } from 'react';
import type { EventPublic, Market, Selection } from '../../engine/types';
import { comboOddsE4, comboReturn, e4ToNumber, formatMoney, Minor, parseAmount, SYSTEM_TYPES, systemLines, systemReturn, toE4 } from '../../lib/money';
import { maxPayout, minStake } from '../../services/betService';
import { findSelection, useLive } from '../../store/live';
import { useSession } from '../../store/session';
import { SlipSel, useSlip } from '../../store/slip';

export interface SlipRow {
  sel: SlipSel;
  ev?: EventPublic;
  market?: Market;
  live?: Selection;
  available: boolean;
  liveOdds: number;
  changed: 'up' | 'down' | null;
  needsAccept: boolean;
  conflict: boolean;
  finished: boolean;
}

export interface SlipModel {
  rows: SlipRow[];
  currency: string;
  balance: Minor;
  mode: 'single' | 'parlay' | 'system';
  canParlay: boolean;
  parlayReason: string | null;
  systemTypes: typeof SYSTEM_TYPES;
  canSystem: boolean;
  totalOdds: number;
  totalStake: Minor;
  potential: Minor;
  lines: number;
  needsAccept: boolean;
  error: string | null;
  ready: boolean;
  stakes: { single: Record<string, Minor | null>; parlay: Minor | null; system: Minor | null };
}

export function useSlipModel(): SlipModel {
  const events = useLive((s) => s.events);
  const slip = useSlip();
  const wallet = useSession((s) => s.wallet);
  const policy = useSession((s) => s.settings?.oddsChange ?? 'higher');

  return useMemo(() => {
    const cur = wallet?.currency ?? 'USD';
    const balance = wallet ? BigInt(wallet.balanceMinor) : 0n;
    const byEvent = new Map<string, number>();
    for (const s of slip.sels) byEvent.set(s.eventId, (byEvent.get(s.eventId) ?? 0) + 1);
    const rows: SlipRow[] = slip.sels.map((sel) => {
      const ev = events[sel.eventId];
      const f = findSelection(ev, sel.marketKey, sel.code);
      const live = f?.selection;
      const market = f?.market;
      const finished = !ev || ev.status === 'FINISHED' || market?.status === 'SETTLED' || market?.status === 'VOID';
      const available = !!live && !!market && market.status === 'OPEN' && !market.closed && !live.locked && live.odds > 1 && !finished;
      const liveOdds = live?.odds ?? sel.odds;
      const changed = liveOdds > sel.odds ? 'up' : liveOdds < sel.odds ? 'down' : null;
      const needsAccept = !!changed && (policy === 'ask' || (policy === 'higher' && changed === 'down'));
      return { sel, ev, market, live, available, liveOdds, changed, needsAccept, conflict: (byEvent.get(sel.eventId) ?? 0) > 1, finished };
    });
    // the odds that will be used: accepted odds, or the live price when auto-accepted
    const effOdds = (r: SlipRow) => (r.changed && !r.needsAccept ? r.liveOdds : r.sel.odds);
    const n = rows.length;
    const conflicts = rows.some((r) => r.conflict);
    const canParlay = n >= 2 && !conflicts;
    const parlayReason = n < 2 ? 'Add another selection to build a parlay.' : conflicts ? 'Two selections are from the same match. Remove one to combine them.' : null;
    const systemTypes = SYSTEM_TYPES.filter((t) => t.legs === n);
    const canSystem = canParlay && systemTypes.length > 0;
    const mode = slip.mode === 'parlay' && !canParlay ? 'single' : slip.mode === 'system' && !canSystem ? (canParlay ? 'parlay' : 'single') : slip.mode;

    const single: Record<string, Minor | null> = {};
    for (const r of rows) single[r.sel.id] = parseAmount(slip.stakes[r.sel.id] ?? '', cur);
    const parlay = parseAmount(slip.parlayStake, cur);
    const system = parseAmount(slip.systemStake, cur);

    let totalStake = 0n;
    let potential = 0n;
    let totalOdds = 1;
    let lines = 0;
    if (mode === 'single') {
      for (const r of rows) {
        const st = single[r.sel.id];
        if (!st) continue;
        totalStake += st;
        potential += comboReturn(st, [toE4(effOdds(r))]);
        lines++;
      }
      totalOdds = rows.length === 1 ? effOdds(rows[0]) : 0;
    } else if (mode === 'parlay') {
      const e4 = rows.map((r) => toE4(effOdds(r)));
      totalOdds = e4ToNumber(comboOddsE4(e4));
      if (parlay) {
        totalStake = parlay;
        potential = comboReturn(parlay, e4);
      }
      lines = 1;
    } else {
      const type = SYSTEM_TYPES.find((t) => t.id === slip.systemType && t.legs === n) ?? systemTypes[0];
      lines = type ? systemLines(type, n).length : 0;
      if (system && type) {
        totalStake = system * BigInt(lines);
        potential = systemReturn(system, type, rows.map((r) => toE4(effOdds(r))));
      }
    }

    const needsAccept = rows.some((r) => r.needsAccept);
    const min = minStake(cur);
    const maxPay = maxPayout(cur);
    let error: string | null = null;
    if (!wallet) error = 'Log in to place bets.';
    else if (rows.some((r) => r.finished)) error = 'Remove settled or finished selections.';
    else if (rows.some((r) => !r.available)) error = 'A selection is suspended. Wait for it to reopen or remove it.';
    else if (mode === 'single' && rows.some((r) => single[r.sel.id] !== null && single[r.sel.id]! > 0n && single[r.sel.id]! < min)) error = `Minimum stake is ${formatMoney(min, cur)}.`;
    else if (mode === 'parlay' && parlay !== null && parlay > 0n && parlay < min) error = `Minimum stake is ${formatMoney(min, cur)}.`;
    else if (mode === 'system' && system !== null && system > 0n && system < min) error = `Minimum stake per line is ${formatMoney(min, cur)}.`;
    else if (potential > maxPay) error = `Potential return is over the ${formatMoney(maxPay, cur, { noDecimals: true })} limit.`;
    else if (totalStake > balance) error = 'Insufficient balance.';
    const ready = !!wallet && n > 0 && totalStake > 0n && !error && !needsAccept;
    return {
      rows, currency: cur, balance, mode, canParlay, parlayReason, systemTypes, canSystem, totalOdds, totalStake, potential, lines, needsAccept, error, ready,
      stakes: { single, parlay, system },
    };
  }, [events, slip, wallet, policy]);
}

/** Booking codes: share a slip on this device with a short code. */
const CODES = 'cadnex.codes.v1';
export function saveBooking(sels: SlipSel[]): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  const code = Array.from(b, (x) => alphabet[x % alphabet.length]).join('');
  try {
    const map = JSON.parse(localStorage.getItem(CODES) ?? '{}');
    map[code] = sels;
    localStorage.setItem(CODES, JSON.stringify(map));
  } catch {
    // storage unavailable
  }
  return code;
}

export function loadBooking(code: string): SlipSel[] | null {
  try {
    const map = JSON.parse(localStorage.getItem(CODES) ?? '{}');
    return map[code.trim().toUpperCase().replace(/^CDNX-?/, '')] ?? null;
  } catch {
    return null;
  }
}

/** Live sports state mirrored from the engine. Components subscribe by event id. */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { registerLeague } from '../data/leagues';
import { rememberLogos } from '../lib/logo';
import type { EventPublic, FeedHealth, Market, Selection } from '../engine/types';

function register(events: EventPublic[]): void {
  rememberLogos(events.flatMap((e) => [e.home, e.away]));
  for (const e of events) if (e.leagueName) registerLeague({ id: e.leagueId, sport: e.sport, name: e.leagueName, short: e.leagueName.length > 14 ? e.leagueName.split(/[\s·]+/).map((w) => w[0]).join('').slice(0, 6) : e.leagueName });
}

interface LiveState {
  ready: boolean;
  mode: 'worker' | 'main' | null;
  events: Record<string, EventPublic>;
  version: number;
  health: FeedHealth | null;
  setHealth(h: FeedHealth): void;
  setReady(events: EventPublic[], mode: 'worker' | 'main'): void;
  apply(events: EventPublic[], removed: string[]): void;
}

export const useLive = create<LiveState>((set) => ({
  ready: false,
  mode: null,
  events: {},
  version: 0,
  health: null,
  setHealth(health) {
    set({ health });
  },
  setReady(events, mode) {
    register(events);
    const map: Record<string, EventPublic> = {};
    for (const e of events) map[e.id] = e;
    set({ ready: true, mode, events: map, version: 1 });
  },
  apply(incoming, removed) {
    register(incoming);
    set((st) => {
      const next = { ...st.events };
      for (const e of incoming) {
        const prev = next[e.id];
        // markets are only sent when they changed; keep the previous array otherwise
        next[e.id] = prev && e.markets.length === 0 && prev.updatedAt === e.updatedAt ? { ...e, markets: prev.markets } : e;
      }
      for (const id of removed) delete next[id];
      return { events: next, version: st.version + 1 };
    });
  },
}));

const listCache = new WeakMap<Record<string, EventPublic>, EventPublic[]>();

/** All events as an array, built once per store update and shared by every selector. */
export function eventList(events: Record<string, EventPublic>): EventPublic[] {
  let l = listCache.get(events);
  if (!l) {
    l = Object.values(events);
    listCache.set(events, l);
  }
  return l;
}

/** Number of matches in play (re-renders only when the count changes). */
export function useLiveCount(): number {
  return useLive((s) => {
    let n = 0;
    for (const e of eventList(s.events)) if (e.status === 'LIVE') n++;
    return n;
  });
}

/**
 * Just the events with these ids: the component re-renders only when one of them changes,
 * not when any of the other ~1,000 matches ticks.
 */
export function useEventsFor(ids: readonly string[]): Record<string, EventPublic> {
  return useLive(useShallow((s) => {
    const out: Record<string, EventPublic> = {};
    for (const id of ids) {
      const e = s.events[id];
      if (e) out[id] = e;
    }
    return out;
  }));
}

const NO_EVENTS: Record<string, EventPublic> = {};
/** The whole event map only while `active` (closed sheets and palettes don't re-render on every tick). */
export function useEventsWhen(active: boolean): Record<string, EventPublic> {
  return useLive((s) => (active ? s.events : NO_EVENTS));
}

export function findSelection(ev: EventPublic | undefined, marketKey: string, code: string): { market: Market; selection: Selection } | null {
  if (!ev) return null;
  const market = ev.markets.find((m) => m.key === marketKey);
  const selection = market?.selections.find((s) => s.code === code);
  return market && selection ? { market, selection } : null;
}

export function parseSelectionId(id: string): { eventId: string; marketKey: string; code: string } {
  const [eventId, marketKey, code] = id.split('|');
  return { eventId, marketKey, code };
}

export function selectionOpen(ev: EventPublic | undefined, marketKey: string, code: string): boolean {
  const f = findSelection(ev, marketKey, code);
  return !!f && f.market.status === 'OPEN' && !f.market.closed && !f.selection.locked && f.selection.odds > 1 && ev!.status !== 'FINISHED';
}

export function mainMarket(ev: EventPublic): Market | undefined {
  const key = ev.sport === 'football' ? '1x2' : 'mw';
  return ev.markets.find((m) => m.key === key) ?? ev.markets.find((m) => m.key === 'ml');
}

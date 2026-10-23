/** Live sports state mirrored from the engine. Components subscribe by event id. */
import { create } from 'zustand';
import type { EventPublic, Market, Selection } from '../engine/types';

interface LiveState {
  ready: boolean;
  mode: 'worker' | 'main' | null;
  events: Record<string, EventPublic>;
  version: number;
  setReady(events: EventPublic[], mode: 'worker' | 'main'): void;
  apply(events: EventPublic[], removed: string[]): void;
}

export const useLive = create<LiveState>((set) => ({
  ready: false,
  mode: null,
  events: {},
  version: 0,
  setReady(events, mode) {
    const map: Record<string, EventPublic> = {};
    for (const e of events) map[e.id] = e;
    set({ ready: true, mode, events: map, version: 1 });
  },
  apply(incoming, removed) {
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

/** Bet slip: selections, stakes and mode. Persisted per device so a refresh keeps the slip. */
import { create } from 'zustand';
import type { SportId } from '../data/types';

export interface SlipSel {
  id: string; // selection id: event|market|code
  eventId: string;
  marketKey: string;
  code: string;
  sport: SportId;
  leagueId: string;
  home: string;
  away: string;
  marketName: string;
  label: string;
  odds: number; // odds the customer has accepted
  startTime: number;
}

export type SlipMode = 'single' | 'parlay' | 'system';

interface SlipState {
  sels: SlipSel[];
  mode: SlipMode;
  stakes: Record<string, string>; // single stakes by selection id
  sameStake: boolean;
  allStake: string;
  parlayStake: string;
  systemStake: string;
  systemType: string;
  bump: number; // increments when a selection is added (pill pop)
  add(s: SlipSel): void;
  remove(id: string): void;
  toggle(s: SlipSel): boolean; // returns true if added
  clear(): void;
  setMode(m: SlipMode): void;
  setStake(id: string, v: string): void;
  setAllStake(v: string): void;
  setSameStake(v: boolean): void;
  setParlayStake(v: string): void;
  setSystemStake(v: string): void;
  setSystemType(v: string): void;
  accept(id: string, odds: number): void;
  replace(sels: SlipSel[]): void;
}

const KEY = 'cadnex.slip.v1';

function load(): Partial<SlipState> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return { sels: v.sels ?? [], mode: v.mode ?? 'single', systemType: v.systemType ?? 'trixie' };
  } catch {
    return {};
  }
}

function save(s: SlipState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sels: s.sels, mode: s.mode, systemType: s.systemType }));
  } catch {
    // storage unavailable: the slip still works for this session
  }
}

export const MAX_SELECTIONS = 20;

export const useSlip = create<SlipState>((set, get) => ({
  sels: [],
  mode: 'single',
  stakes: {},
  sameStake: false,
  allStake: '',
  parlayStake: '',
  systemStake: '',
  systemType: 'trixie',
  bump: 0,
  ...load(),
  add(s) {
    if (get().sels.some((x) => x.id === s.id) || get().sels.length >= MAX_SELECTIONS) return;
    set((st) => {
      // replacing a selection in the same market (e.g. Home → Draw) swaps it
      const sels = st.sels.filter((x) => !(x.eventId === s.eventId && x.marketKey === s.marketKey));
      const nextSels = [...sels, s];
      const mode: SlipMode = st.mode === 'single' && nextSels.length > 1 && st.sels.length === 1 ? 'parlay' : st.mode;
      return { sels: nextSels, bump: st.bump + 1, mode };
    });
    save(get());
  },
  remove(id) {
    set((st) => {
      const stakes = { ...st.stakes };
      delete stakes[id];
      const sels = st.sels.filter((x) => x.id !== id);
      return { sels, stakes, mode: sels.length <= 1 ? 'single' : st.mode };
    });
    save(get());
  },
  toggle(s) {
    if (get().sels.some((x) => x.id === s.id)) {
      get().remove(s.id);
      return false;
    }
    get().add(s);
    return true;
  },
  clear() {
    set({ sels: [], stakes: {}, parlayStake: '', systemStake: '', allStake: '', mode: 'single' });
    save(get());
  },
  setMode(mode) {
    set({ mode });
    save(get());
  },
  setStake(id, v) {
    set((st) => ({ stakes: { ...st.stakes, [id]: v } }));
  },
  setAllStake(v) {
    set((st) => {
      const stakes: Record<string, string> = {};
      for (const s of st.sels) stakes[s.id] = v;
      return { allStake: v, stakes };
    });
  },
  setSameStake(sameStake) {
    set({ sameStake });
    if (sameStake) get().setAllStake(get().allStake);
  },
  setParlayStake(parlayStake) {
    set({ parlayStake });
  },
  setSystemStake(systemStake) {
    set({ systemStake });
  },
  setSystemType(systemType) {
    set({ systemType });
    save(get());
  },
  accept(id, odds) {
    set((st) => ({ sels: st.sels.map((x) => (x.id === id ? { ...x, odds } : x)) }));
    save(get());
  },
  replace(sels) {
    set((st) => ({ sels: sels.slice(0, MAX_SELECTIONS), stakes: {}, mode: sels.length > 1 ? 'parlay' : 'single', bump: st.bump + 1 }));
    save(get());
  },
}));

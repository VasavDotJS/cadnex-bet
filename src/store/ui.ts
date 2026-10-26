/** Transient UI state: toasts, sheets, celebrations, the flying selection chip. */
import { create } from 'zustand';

export interface Toast {
  id: number;
  tone: 'neutral' | 'win' | 'loss' | 'error' | 'demo';
  title: string;
  body?: string;
  action?: { label: string; to: string };
}

interface UiState {
  toasts: Toast[];
  slipSnap: 'closed' | 'half' | 'full';
  celebrate: number; // increments on a win
  mood: 'none' | 'win' | 'loss';
  fly: { id: number; x: number; y: number; label: string } | null;
  search: boolean;
  /** the Account sheet (switch accounts, profile, theme) */
  account: boolean;
  toast(t: Omit<Toast, 'id'>, ms?: number): void;
  dismiss(id: number): void;
  setSlip(s: UiState['slipSnap']): void;
  win(): void;
  loss(): void;
  flyFrom(x: number, y: number, label: string): void;
  setSearch(v: boolean): void;
  setAccount(v: boolean): void;
}

let tid = 1;

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  slipSnap: 'closed',
  celebrate: 0,
  mood: 'none',
  fly: null,
  search: false,
  account: false,
  toast(t, ms = 4200) {
    const id = tid++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
  },
  setSlip(slipSnap) {
    set({ slipSnap });
  },
  win() {
    set((s) => ({ celebrate: s.celebrate + 1, mood: 'win' }));
    setTimeout(() => set({ mood: 'none' }), 2600);
  },
  loss() {
    set({ mood: 'loss' });
    setTimeout(() => set({ mood: 'none' }), 1800);
  },
  flyFrom(x, y, label) {
    set({ fly: { id: tid++, x, y, label } });
  },
  setAccount(account) {
    set({ account });
  },
  setSearch(search) {
    set({ search });
  },
}));

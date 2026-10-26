/** What is being shared as a story. Kept apart from the sheet so the sheet loads only when opened. */
import { create } from 'zustand';

export type Source = { kind: 'bet'; betId: string } | { kind: 'slip' } | { kind: 'event'; eventId: string };

export const useShare = create<{ source: Source | null; open(s: Source): void; close(): void }>((set) => ({
  source: null,
  open: (source) => set({ source }),
  close: () => set({ source: null }),
}));

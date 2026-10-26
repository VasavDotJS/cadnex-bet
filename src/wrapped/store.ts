/** Which recap is open. Kept apart from the player so opening it doesn't load it up front. */
import { create } from 'zustand';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';
import type { Period } from './stats';

export const useWrapped = create<{ period: Period | null; open(p: Period): void; close(): void }>((set) => ({
  period: null,
  open: (period) => set({ period }),
  close: () => set({ period: null }),
}));

export function useOpenWrapped() {
  const open = useWrapped((s) => s.open);
  return (p: Period) => {
    if (!useSession.getState().wallet) { useUi.getState().toast({ tone: 'neutral', title: 'Log in to see your Wrapped' }); return; }
    open(p);
  };
}

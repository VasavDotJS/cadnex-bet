/**
 * One clock for the whole app. Components ask for the time at the precision they show
 * (a countdown: seconds; a kick-off label: minutes), and only re-render when that changes.
 * The clock pauses while the page is hidden.
 */
import { create } from 'zustand';

export const useClock = create<{ now: number }>(() => ({ now: Date.now() }));

let timer: ReturnType<typeof setInterval> | null = null;

function run(): void {
  if (timer || typeof window === 'undefined') return;
  useClock.setState({ now: Date.now() });
  timer = setInterval(() => useClock.setState({ now: Date.now() }), 1000);
}

function pause(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? pause() : run()));
  run();
}

/** The current time, rounded down to `ms` (the component re-renders once per `ms`). */
export function useNow(ms = 1000): number {
  return useClock((s) => Math.floor(s.now / ms) * ms);
}

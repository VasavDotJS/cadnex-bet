/** The app tells the loading screen it has booted and drawn its first screen. */
declare global {
  interface Window {
    __cdnxReady?: boolean;
  }
}

export const READY_EVENT = 'cdnx-ready';

export function markReady(): void {
  if (typeof window === 'undefined' || window.__cdnxReady) return;
  // wait one frame so the first screen is painted underneath before the splash leaves
  requestAnimationFrame(() => {
    window.__cdnxReady = true;
    window.dispatchEvent(new Event(READY_EVENT));
  });
}

export function isReady(): boolean {
  return typeof window !== 'undefined' && window.__cdnxReady === true;
}

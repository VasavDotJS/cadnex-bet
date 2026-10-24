/**
 * Installable app support: registers the service worker, keeps the browser's install
 * prompt (Android, desktop Chrome and Edge), and works out what to tell people whose
 * browser has no prompt (iPhone and iPad, Firefox, in-app browsers).
 */
import { create } from 'zustand';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __cdnxBip?: InstallPromptEvent | null;
    __cdnxInstalled?: boolean;
  }
  interface Navigator {
    standalone?: boolean;
  }
}

export type Platform = 'ios' | 'android' | 'desktop';
/** Which browser on iOS: Safari, another browser (Chrome, Firefox, Edge), or an in-app view. */
export type IosBrowser = 'safari' | 'other' | 'inapp';

export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function iosBrowser(): IosBrowser {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|TikTok|LinkedInApp|GSA\//.test(ua)) return 'inapp';
  if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/.test(ua)) return 'other';
  return 'safari';
}

/** True when CADNEX is running as the installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
}

interface InstallState {
  /** The browser's own install prompt, when it has offered one. */
  prompt: InstallPromptEvent | null;
  installed: boolean;
  /** The "how to install" sheet. */
  sheet: boolean;
  /** Shows the browser prompt if there is one, otherwise opens the instructions sheet. */
  install(): Promise<'accepted' | 'dismissed' | 'manual'>;
  close(): void;
}

export const useInstall = create<InstallState>((set, get) => ({
  prompt: null,
  installed: false,
  sheet: false,
  async install() {
    const p = get().prompt;
    if (!p) {
      set({ sheet: true });
      return 'manual';
    }
    await p.prompt();
    const { outcome } = await p.userChoice;
    window.__cdnxBip = null;
    set({ prompt: null, installed: outcome === 'accepted' });
    return outcome;
  },
  close() {
    set({ sheet: false });
  },
}));

/** Whether to offer installing at all: not already installed, and a route exists. */
export function useCanInstall(): boolean {
  const prompt = useInstall((s) => s.prompt);
  const installed = useInstall((s) => s.installed);
  if (typeof window === 'undefined' || installed || isStandalone()) return false;
  return !!prompt || platform() !== 'desktop';
}

const DISMISS_KEY = 'cdnx-install-dismissed';
const DISMISS_FOR = 14 * 86_400_000;

export function bannerDismissed(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_FOR;
  } catch {
    return false;
  }
}

export function dismissBanner(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: the banner simply comes back next visit */
  }
}

let started = false;

/** Call once on startup. Safe to call again. */
export function startPwa(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  // the prompt usually fires before React mounts; a tiny script in <head> keeps it for us
  if (window.__cdnxBip) useInstall.setState({ prompt: window.__cdnxBip });
  if (window.__cdnxInstalled) useInstall.setState({ installed: true });
  window.addEventListener('cdnx-bip', () => useInstall.setState({ prompt: window.__cdnxBip ?? null }));
  window.addEventListener('cdnx-installed', () => useInstall.setState({ installed: true, prompt: null, sheet: false }));

  if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // files this page already loaded arrived before the worker existed: hand them over
        // so the app opens offline from the next launch
        const urls = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.startsWith(`${location.origin}/_next/static/`));
        reg.active?.postMessage({ type: 'cache-urls', urls });
      })
      .catch(() => {
        /* no offline support in this browser; the app still works online */
      });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

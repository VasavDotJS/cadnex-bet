'use client';

/**
 * Decides, on the home URL, between the public landing page (server-rendered, for visitors and
 * search engines) and the app. A tiny script in the layout marks <html data-app> before the
 * first paint when the app should open straight away: a link into the app (/#/…), a saved
 * login, or the installed app. Otherwise the landing stays, and the app loads the moment a
 * visitor follows a link into it.
 */
import dynamic from 'next/dynamic';
import { ReactNode, useEffect, useState } from 'react';
import { Splash } from '../splash/Splash';

const loadApp = () => import('../App');
const App = dynamic(() => loadApp().then((m) => m.App), { ssr: false, loading: () => null });

type Mode = 'start' | 'app' | 'landing' | 'entered';

/** `children` is the server-rendered landing page; it is removed once the app takes over. */
export function AppMount({ children }: { children: ReactNode }) {
  // 'start' renders the launch screen exactly as the server did (hidden by CSS on the landing)
  const [mode, setMode] = useState<Mode>('start');

  useEffect(() => {
    const root = document.documentElement;
    if (root.hasAttribute('data-app')) {
      setMode('app');
      return;
    }
    setMode('landing');
    const enter = () => {
      if (location.hash.length <= 2) return;
      root.setAttribute('data-app', '1');
      window.scrollTo(0, 0);
      setMode('entered');
    };
    window.addEventListener('hashchange', enter);
    // warm the app's code as soon as a visitor heads for a link into it (or after a while),
    // so the tap opens it instantly without slowing the landing page's first load
    let warmed = false;
    const warm = () => {
      if (warmed) return;
      warmed = true;
      void loadApp().catch(() => {});
    };
    const intent = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="/#/"]');
      if (a) warm();
    };
    const opts = { passive: true, capture: true } as const;
    for (const t of ['pointerover', 'touchstart', 'focusin'] as const) window.addEventListener(t, intent, opts);
    const later = setTimeout(warm, 9000);
    return () => {
      window.removeEventListener('hashchange', enter);
      for (const t of ['pointerover', 'touchstart', 'focusin'] as const) window.removeEventListener(t, intent, opts);
      clearTimeout(later);
    };
  }, []);

  if (mode === 'landing') return <>{children}</>;
  return (
    <>
      {mode === 'start' && children}
      {(mode === 'app' || mode === 'entered') && <App />}
      {/* the launch animation plays when the app opens directly, not after a tap on the landing */}
      {(mode === 'start' || mode === 'app') && <Splash />}
    </>
  );
}

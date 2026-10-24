'use client';

/**
 * CADNEX is a client-side app: live data comes from /api, and every account, wallet and
 * bet is stored on the device (IndexedDB). Next.js serves it as one page,
 * and the app handles its own screens with hash routes (/#/live, /#/wallet …).
 */
import dynamic from 'next/dynamic';
import { Splash } from '../src/splash/Splash';

// the launch screen covers loading; it leaves once the app signals it is ready
const App = dynamic(() => import('../src/App').then((m) => m.App), { ssr: false, loading: () => null });

export default function Page() {
  return (
    <>
      <App />
      <Splash />
    </>
  );
}

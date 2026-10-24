'use client';

/**
 * CADNEX is a client-side app: live data comes from /api, and every account, wallet and
 * bet is stored on the device (IndexedDB). Next.js serves it as one page,
 * and the app handles its own screens with hash routes (/#/live, /#/wallet …).
 */
import dynamic from 'next/dynamic';

const App = dynamic(() => import('../src/App').then((m) => m.App), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center">
      <span className="h-3 w-3 animate-pulse rounded-full bg-lime" aria-label="Loading" />
    </div>
  ),
});

export default function Page() {
  return <App />;
}

import type { MetadataRoute } from 'next';

/** Web app manifest: what Android, desktop Chrome and Edge use to install CADNEX as an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'CADNEX',
    short_name: 'CADNEX',
    description: 'Bet on real matches with virtual money. Live scores and live odds for football, NBA, tennis and cricket.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0A0A0C',
    theme_color: '#0A0A0C',
    categories: ['sports', 'entertainment', 'games'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Live now', short_name: 'Live', url: '/#/live', icons: [{ src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' }] },
      { name: 'My bets', short_name: 'Bets', url: '/#/bets', icons: [{ src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' }] },
      { name: 'Wallet', url: '/#/wallet', icons: [{ src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' }] },
    ],
  };
}

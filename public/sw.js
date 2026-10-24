/*
 * CADNEX service worker.
 * - The app shell (page, scripts, styles, fonts, icons) is cached so the installed app opens
 *   instantly and still opens with no connection. Your wallet and bets live on the device.
 * - Live data (/api/*) is never cached here: scores and odds always come from the network.
 * Bump VERSION to drop old caches.
 */
const VERSION = 'v1';
const SHELL = `cdnx-shell-${VERSION}`;
const ASSETS = `cdnx-assets-${VERSION}`;
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/apple-touch-icon.png', '/brand/cadnex-lockup-white.svg'];
const PAGE_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS]);
      for (const k of await caches.keys()) if (k.startsWith('cdnx-') && !keep.has(k)) await caches.delete(k);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'cache-urls' || !Array.isArray(msg.urls)) return;
  event.waitUntil(
    caches.open(ASSETS).then(async (c) => {
      for (const u of msg.urls) {
        try {
          const url = new URL(u);
          if (url.origin !== self.location.origin || !url.pathname.startsWith('/_next/static/')) continue;
          if (!(await c.match(u))) await c.add(u);
        } catch {
          /* skip anything that fails; it is fetched again when needed */
        }
      }
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // live data: straight to the network
  if (req.mode === 'navigate') {
    event.respondWith(page(event));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || /^\/(icons|splash|brand)\//.test(url.pathname)) {
    event.respondWith(cacheFirst(event, req));
    return;
  }
  event.respondWith(networkFirst(event, req));
});

/** Pages: fresh from the network, falling back to the cached app shell when offline or slow. */
async function page(event) {
  try {
    const res = await Promise.race([
      (async () => (await event.preloadResponse) || fetch(event.request))(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), PAGE_TIMEOUT)),
    ]);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(caches.open(SHELL).then((c) => c.put('/', copy)));
    }
    return res;
  } catch {
    const cached = await caches.match('/');
    return cached || new Response('<h1>You are offline</h1><p>Reconnect and open CADNEX again.</p>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
}

/** Fingerprinted build files and images never change: serve from cache, fetch once. */
async function cacheFirst(event, req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const copy = res.clone();
    event.waitUntil(caches.open(ASSETS).then((c) => c.put(req, copy)));
  }
  return res;
}

async function networkFirst(event, req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(caches.open(SHELL).then((c) => c.put(req, copy)));
    }
    return res;
  } catch {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw new Error('offline');
  }
}

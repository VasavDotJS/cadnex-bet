/** @type {import('next').NextConfig} */

const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['geist'],
  // the app ships no next/image; switching the optimizer off removes that endpoint entirely
  images: { unoptimized: true },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        // the service worker must always be re-checked, or app updates get stuck
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      // API answers are data, never pages
      { source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }, { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'; sandbox" }] },
      // the service worker only ever talks to this site
      { source: '/sw.js', headers: [{ key: 'Content-Security-Policy', value: "default-src 'self'" }] },
      // pages get their nonce-based policy from proxy.ts
    ];
  },
};
export default nextConfig;

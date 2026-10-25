/** @type {import('next').NextConfig} */

// Where the browser may connect: this site, and the project's Supabase (REST, auth, realtime).
const SUPABASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ahgwdlcrerxpgdybzwsh.supabase.co').replace(/\/$/, '');
const SUPABASE_WS = SUPABASE.replace(/^https:/, 'wss:');
const dev = process.env.NODE_ENV !== 'production';

// Next.js streams its page data as inline scripts, so scripts need 'unsafe-inline'; every
// other source is locked to this site. Nothing in the app renders user-supplied HTML.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self' blob: data: ${SUPABASE} ${SUPABASE_WS}${dev ? ' ws:' : ''}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
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
      { source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};
export default nextConfig;

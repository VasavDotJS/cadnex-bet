/**
 * Gives every page view a fresh, unguessable nonce and a Content-Security-Policy that only
 * runs scripts carrying it. Next.js stamps the nonce onto its own scripts automatically.
 */
import { NextRequest, NextResponse } from 'next/server';
import { pageCsp } from './src/server/csp';

export function proxy(request: NextRequest) {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  const csp = pageCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // pages only: not API routes, built assets or public files (anything with a dot)
      source: '/((?!api/|_next/|.*\\..*).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};

/**
 * Per-visitor rate limiting for the API routes, shared by every server instance through
 * Vercel's Runtime Cache (in-memory on a laptop). A quick local count answers first, so
 * floods are cut off without touching the shared cache on every request.
 */
import { getCache, ipAddress } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';

const local = new Map<string, { n: number; reset: number }>();

export function clientIp(req: NextRequest): string {
  // Vercel sets this from the real connection; a client can't forge it
  return (ipAddress(req) ?? req.headers.get('x-real-ip') ?? 'unknown').trim().slice(0, 64);
}

function tooMany(retryS: number): NextResponse {
  return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, retryS)), 'Cache-Control': 'no-store' } });
}

function countLocal(key: string, now: number, windowMs: number): { n: number; reset: number } {
  let b = local.get(key);
  if (!b || now > b.reset) {
    b = { n: 0, reset: now + windowMs };
    local.set(key, b);
    if (local.size > 5000) for (const [k, v] of local) if (now > v.reset) local.delete(k);
  }
  b.n++;
  return b;
}

/** Returns a 429 response when this visitor has made more than `limit` calls to `route` in the window. */
export async function rateLimit(req: NextRequest, route: string, limit: number, windowMs = 60_000): Promise<NextResponse | null> {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const key = `${route}|${clientIp(req)}|${window}`;
  const mine = countLocal(key, now, windowMs);
  if (mine.n > limit) return tooMany(Math.ceil((mine.reset - now) / 1000));
  // the shared count across instances (best effort: a missing cache never blocks anyone)
  try {
    const cache = getCache({ namespace: 'cdnx-rl' });
    const seen = Number((await cache.get(key)) ?? 0) + 1;
    await cache.set(key, seen, { ttl: Math.ceil(windowMs / 1000) + 5, name: '' });
    if (seen > limit) return tooMany(Math.ceil(((window + 1) * windowMs - now) / 1000));
  } catch {
    /* no shared cache here: the local count still applies */
  }
  return null;
}

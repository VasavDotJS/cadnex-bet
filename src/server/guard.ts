/**
 * Lightweight per-IP rate limiting for the API routes. Counts live in each serverless
 * instance's memory, so this blunts floods from one client (and protects the upstream ESPN
 * quota) without any paid service. Vercel's own firewall sits in front for the rest.
 */
import { NextRequest, NextResponse } from 'next/server';

const buckets = new Map<string, { n: number; reset: number }>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') ?? 'unknown').trim().slice(0, 64);
}

/** Returns a 429 response when `ip` has made more than `limit` calls to `route` in the window. */
export function rateLimit(req: NextRequest, route: string, limit: number, windowMs = 60_000): NextResponse | null {
  const now = Date.now();
  const key = `${route}|${clientIp(req)}`;
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    return null;
  }
  if (++b.n <= limit) return null;
  const retry = Math.ceil((b.reset - now) / 1000);
  return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retry), 'Cache-Control': 'no-store' } });
}

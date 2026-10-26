import { NextRequest, NextResponse } from 'next/server';
import { allowedPhoto } from '../../../src/server/players';
import { rateLimit } from '../../../src/server/guard';

/**
 * GET /api/photo?u=<Wikimedia Commons file or ESPN tennis headshot>
 * Same-origin copies of player photos (so the halftone canvas can read their pixels), cached
 * hard at the edge. Locked to those two sources, raster images only, 3 MB max, sandboxed.
 */
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 3_000_000;

const deny = (status: number, msg: string) => new NextResponse(msg, { status, headers: { 'Cache-Control': 'public, s-maxage=3600', 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, 'photo', 400);
  if (limited) return limited;
  const url = allowedPhoto(req.nextUrl.searchParams.get('u'));
  if (!url) return deny(400, 'not a player photo');
  try {
    const wiki = url.hostname.endsWith('wikimedia.org');
    const r = await fetch(url, {
      headers: { 'User-Agent': wiki ? 'CADNEX/1.0 (https://github.com/VasavDotJS/cadnex-bet)' : 'Mozilla/5.0 (compatible; CADNEX/1.0)' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!r.ok || !TYPES.has(type) || Number(r.headers.get('content-length') ?? 0) > MAX_BYTES) return deny(r.status === 429 ? 503 : 404, 'photo unavailable');
    const body = await r.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return deny(404, 'photo unavailable');
    return new NextResponse(body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  } catch {
    return deny(502, 'photo unavailable');
  }
}

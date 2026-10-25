import { NextRequest, NextResponse } from 'next/server';
import { cleanLogo } from '../../../src/lib/logo';

/**
 * GET /api/logo?u=<espncdn logo url>&w=<64|128|256|500>
 * Proxies official team logos from ESPN's CDN only, resized by ESPN's image service, and
 * caches them hard at the edge. Same-origin so the share canvas can draw them.
 */
const SIZES = new Set([64, 128, 256, 500]);
const LONG = 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000';

async function get(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (CADNEX)' }, next: { revalidate: 2592000 } });
    const type = r.headers.get('content-type') ?? '';
    return r.ok && type.startsWith('image/') ? r : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const u = cleanLogo(req.nextUrl.searchParams.get('u'));
  const w = Number(req.nextUrl.searchParams.get('w'));
  if (!u) return new NextResponse('bad logo url', { status: 400 });
  const size = SIZES.has(w) ? w : 128;
  const { pathname } = new URL(u);
  // ESPN's combiner resizes on their side; fall back to the original file if it refuses
  const combined = pathname.startsWith('/i/')
    ? `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(pathname)}&w=${size}&h=${size}&scale=crop&cquality=80&location=origin`
    : null;
  const r = (combined && (await get(combined))) || (await get(u));
  if (!r) return new NextResponse('logo unavailable', { status: 404, headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  return new NextResponse(r.body, {
    headers: {
      'Content-Type': r.headers.get('content-type') ?? 'image/png',
      'Cache-Control': LONG,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

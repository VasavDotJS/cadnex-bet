import { NextRequest, NextResponse } from 'next/server';
import { cleanLogo } from '../../../src/lib/logo';
import { rateLimit } from '../../../src/server/guard';

/**
 * GET /api/logo?u=<espncdn team logo url>&w=<64|128|256|500>
 * Proxies official team logos from ESPN's CDN, resized by ESPN's image service, and caches
 * them hard at the edge. Same-origin so the share canvas can draw them.
 *
 * Locked down so it can't be used as a general proxy: logo folders on ESPN's image hosts
 * only, raster images only (never SVG, which could carry script), 2 MB max, and the
 * response is sandboxed and not embeddable by other sites.
 */
const SIZES = new Set([64, 128, 256, 500]);
const HOST = /^a\d?\.espncdn\.com$/;
const PATH = /^\/i\/(teamlogos|leaguelogos|countries)\/[A-Za-z0-9_\-/]+\.(png|jpe?g|webp|gif)$/i;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_BYTES = 2_000_000;
const LONG = 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000';

async function get(url: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (CADNEX)' }, redirect: 'error', signal: AbortSignal.timeout(6000), next: { revalidate: 2592000 } });
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!r.ok || !TYPES.has(type)) return null;
    if (Number(r.headers.get('content-length') ?? 0) > MAX_BYTES) return null;
    const body = await r.arrayBuffer();
    return body.byteLength > MAX_BYTES ? null : { body, type };
  } catch {
    return null;
  }
}

const deny = (status: number, msg: string) => new NextResponse(msg, { status, headers: { 'Cache-Control': 'public, s-maxage=3600', 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, 'logo', 400);
  if (limited) return limited;
  const u = cleanLogo(req.nextUrl.searchParams.get('u'));
  if (!u) return deny(400, 'bad logo url');
  const url = new URL(u);
  if (!HOST.test(url.hostname) || !PATH.test(url.pathname) || url.pathname.includes('..') || url.search) return deny(400, 'not a team logo');
  const w = Number(req.nextUrl.searchParams.get('w'));
  const size = SIZES.has(w) ? w : 128;
  // ESPN's combiner resizes on their side; fall back to the original file if it refuses
  const combined = `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(url.pathname)}&w=${size}&h=${size}&scale=crop&cquality=80&location=origin`;
  const img = (await get(combined)) ?? (await get(url.toString()));
  if (!img) return deny(404, 'logo unavailable');
  return new NextResponse(img.body, {
    headers: {
      'Content-Type': img.type,
      'Cache-Control': LONG,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

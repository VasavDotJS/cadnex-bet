import { NextRequest, NextResponse } from 'next/server';
import { findPlayerPhoto, PLAYER_NAME, UpstreamBusy } from '../../../src/server/players';
import { rateLimit } from '../../../src/server/guard';

/**
 * GET /api/player?name=<player>&id=<espn athlete id>
 * → { photo: "/api/photo?u=…" | null, credit?, source? }, cached at the edge for a week.
 */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, 'player', 300);
  if (limited) return limited;
  const name = (req.nextUrl.searchParams.get('name') ?? '').trim();
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!PLAYER_NAME.test(name) || /^(tbd|tba|bye|qualifier)\b/i.test(name) || (id && !/^\d{1,10}$/.test(id))) {
    return NextResponse.json({ photo: null }, { status: 400, headers: { 'Cache-Control': 'public, s-maxage=86400' } });
  }
  try {
    const found = await findPlayerPhoto(name, id || undefined);
    const body = found ? { photo: `/api/photo?u=${encodeURIComponent(found.url)}`, credit: found.credit, source: found.source } : { photo: null };
    // a found photo is good for a week; "no photo" is re-checked daily
    return NextResponse.json(body, { headers: { 'Cache-Control': found ? 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800' : 'public, max-age=3600, s-maxage=86400' } });
  } catch (e) {
    // the photo sources are busy or unreachable: say "try again later" (200, so browsers don't log an error)
    const busy = e instanceof UpstreamBusy;
    return NextResponse.json({ photo: null, retry: true, busy }, { headers: { 'Cache-Control': 'public, s-maxage=60' } });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../../../src/server/guard';
import { loadFeed } from '../../../src/feed/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, 'feed', 120);
  if (limited) return limited;
  const feed = await loadFeed();
  return NextResponse.json(feed, {
    headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
  });
}

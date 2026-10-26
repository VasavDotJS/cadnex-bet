import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../../../src/server/guard';
import { loadFeed } from '../../../src/feed/server';
import type { FeedEvent } from '../../../src/feed/types';

export const dynamic = 'force-dynamic';

const HOUR = 3_600_000;

/**
 * `?scope=live` keeps only what changes minute to minute: matches in play, starting in the
 * next 6 hours, or finished in the last 12. The app polls that every 15 s and the full
 * two-week list once a minute, so phones download a fraction of the data.
 */
function liveScope(e: FeedEvent, now: number): boolean {
  if (e.status === 'LIVE') return true;
  if (e.status === 'SCHEDULED') return e.startTime < now + 6 * HOUR;
  return e.startTime > now - 12 * HOUR;
}

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, 'feed', 240);
  if (limited) return limited;
  const feed = await loadFeed();
  const live = req.nextUrl.searchParams.get('scope') === 'live';
  const now = Date.now();
  const body = live ? { ...feed, events: feed.events.filter((e) => liveScope(e, now)) } : feed;
  return NextResponse.json(body, {
    headers: { 'Cache-Control': live ? 'public, s-maxage=10, stale-while-revalidate=20' : 'public, s-maxage=30, stale-while-revalidate=60' },
  });
}

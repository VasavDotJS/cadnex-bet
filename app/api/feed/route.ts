import { NextResponse } from 'next/server';
import { loadFeed } from '../../../src/feed/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const feed = await loadFeed();
  return NextResponse.json(feed, {
    headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
  });
}

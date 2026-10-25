import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '../../../src/server/guard';
import { loadFeed } from '../../../src/feed/server';

export const dynamic = 'force-dynamic';

/** Quick check that every upstream feed answers and parses. Open /api/health in a browser. */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, 'health', 20);
  if (limited) return limited;
  const feed = await loadFeed();
  const bySport: Record<string, { total: number; live: number }> = {};
  for (const e of feed.events) {
    bySport[e.sport] ??= { total: 0, live: 0 };
    bySport[e.sport].total++;
    if (e.status === 'LIVE') bySport[e.sport].live++;
  }
  const live = feed.events.filter((e) => e.status === 'LIVE').slice(0, 8).map((e) => ({
    league: e.leagueName, match: `${e.home.name} ${e.home.scoreText ?? e.home.score}–${e.away.scoreText ?? e.away.score} ${e.away.name}`, clock: e.clock || e.detail,
    hasOdds: !!e.odds, stats: Object.keys(e.home.stats).length, incidents: e.incidents.length,
  }));
  return NextResponse.json({
    ok: feed.sources.some((s) => s.ok),
    checkedAt: new Date(feed.updatedAt).toISOString(),
    totals: bySport,
    sources: feed.sources.map((s) => ({ league: s.league, ok: s.ok, events: s.count, ms: s.ms, error: s.error })),
    liveSample: live,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

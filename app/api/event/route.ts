import { NextRequest, NextResponse } from 'next/server';
import { loadDetail, loadEvent } from '../../../src/feed/server';

export const dynamic = 'force-dynamic';

/** GET /api/event?id=<league~espnId~yyyymmdd>[&detail=1] */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const detail = req.nextUrl.searchParams.get('detail') === '1';
  const ev = detail ? await loadDetail(id) : await loadEvent(id);
  if (!ev) return NextResponse.json({ error: 'not found', id }, { status: 404, headers: { 'Cache-Control': 'public, s-maxage=30' } });
  return NextResponse.json(ev, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } });
}

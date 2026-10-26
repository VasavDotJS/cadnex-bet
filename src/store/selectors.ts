/** Memoised event lists. Only ids/statuses drive these, so they re-sort rarely. */
import { useMemo } from 'react';
import type { SportId } from '../data/types';
import type { EventPublic } from '../engine/types';
import { eventList, mainMarket, useLive } from './live';

/**
 * Each hook computes a small string key inside the store selector: the component only
 * re-renders when the key changes (a match starts, ends or is added), not on every tick.
 */
function useKey(fn: (list: EventPublic[]) => string): string[] {
  const key = useLive((s) => fn(eventList(s.events)));
  return useMemo(() => (key ? key.split(',') : []), [key]);
}

export function useLiveIds(sport?: SportId): string[] {
  return useKey((list) => list.filter((e) => e.status === 'LIVE' && (!sport || e.sport === sport)).sort((a, b) => a.startTime - b.startTime || (a.id < b.id ? -1 : 1)).map((e) => e.id).join(','));
}

export function useUpcomingIds(limit = 8, sport?: SportId): string[] {
  return useKey((list) => {
    const now = Date.now();
    return list
      .filter((e) => e.status === 'SCHEDULED' && e.startTime > now - 5000 && (!sport || e.sport === sport))
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, limit)
      .map((e) => e.id)
      .join(',');
  });
}

export function useDayIds(dayOffset: number, sport: SportId | 'all', leagueId?: string): string[] {
  return useKey((list) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const from = start.getTime() + dayOffset * 86_400_000;
    const to = from + 86_400_000;
    return list
      .filter((e) => (sport === 'all' || e.sport === sport) && (!leagueId || e.leagueId === leagueId))
      .filter((e) => (dayOffset === 0 ? e.status === 'LIVE' || (e.startTime < to && e.status !== 'FINISHED') : e.startTime >= from && e.startTime < to))
      .sort((a, b) => (a.status === 'LIVE' ? 0 : 1) - (b.status === 'LIVE' ? 0 : 1) || a.startTime - b.startTime)
      .map((e) => e.id)
      .join(',');
  });
}

export function useFinishedIds(limit = 10, sport?: SportId): string[] {
  return useKey((list) =>
    list
      .filter((e) => e.status === 'FINISHED' && (!sport || e.sport === sport))
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .slice(0, limit)
      .map((e) => e.id)
      .join(','),
  );
}

export interface AccaLeg { ev: EventPublic; marketKey: string; code: string; label: string; odds: number; marketName: string }

/** System-built "popular accas": short-priced favourites from different upcoming events. */
export function usePopularAccas(): { title: string; legs: AccaLeg[] }[] {
  const hourKey = Math.floor(Date.now() / 600_000);
  const ids = useLive((s) => eventList(s.events).filter((e) => e.status === 'SCHEDULED' && e.markets.length && e.startTime - Date.now() < 3 * 3_600_000).map((e) => e.id).sort().join(','));
  return useMemo(() => {
    const events = useLive.getState().events;
    const pool: AccaLeg[] = [];
    for (const id of ids.split(',')) {
      const ev = events[id];
      if (!ev) continue;
      const mm = mainMarket(ev);
      if (!mm || mm.status !== 'OPEN') continue;
      const fav = [...mm.selections].filter((s) => s.code !== 'X' && !s.locked && s.odds > 1).sort((a, b) => a.odds - b.odds)[0];
      if (fav && fav.odds >= 1.25 && fav.odds <= 2.1) pool.push({ ev, marketKey: mm.key, code: fav.code, label: fav.label, odds: fav.odds, marketName: mm.name });
    }
    const bySport = (s: SportId) => pool.filter((p) => p.ev.sport === s).sort((a, b) => a.ev.startTime - b.ev.startTime);
    const out: { title: string; legs: AccaLeg[] }[] = [];
    const fb = bySport('football').slice(0, 4);
    if (fb.length >= 3) out.push({ title: 'Football favourites', legs: fb });
    const mix = [bySport('basketball')[0], bySport('tennis')[0], bySport('football')[4], bySport('cricket')[0]].filter(Boolean) as AccaLeg[];
    if (mix.length >= 3) out.push({ title: 'Across the board', legs: mix });
    const tn = bySport('tennis').slice(0, 3);
    if (tn.length >= 3) out.push({ title: 'Tennis treble', legs: tn });
    return out;
  }, [ids, hourKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

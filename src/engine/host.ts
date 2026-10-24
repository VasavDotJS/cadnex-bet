/**
 * Runs the live engine: polls the CADNEX feed API, follows matches that carry open bets
 * after they leave the feed, refreshes the match being viewed with richer detail, and
 * posts changes to the page. Used by the worker and by the main-thread fallback.
 */
import type { FeedEvent, FeedResponse } from '../feed/types';
import { LiveEngine } from '../live/engine';
import type { FeedHealth, FromEngine, ToEngine } from './types';

const POLL_MS = 15_000;
const TICK_MS = 1_000;
const POST_MS = 600;
const SNAPSHOT_MS = 15_000;
const TRACK_MS = 60_000;
const DETAIL_MS = 20_000;

export function createHost(post: (m: FromEngine) => void, base = '') {
  const engine = new LiveEngine();
  const pending = new Set<string>();
  let removed: string[] = [];
  let lastPost = 0;
  let lastSnap = 0;
  let lastTrack = 0;
  let lastDetail = 0;
  let started = false;
  let polling = false;
  const health: FeedHealth = { ok: false, lastOk: 0, lastTry: 0, provider: 'ESPN' };

  async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${base}${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  function flush(force = false): void {
    const now = Date.now();
    if (!force && now - lastPost < POST_MS) return;
    lastPost = now;
    if (!pending.size && !removed.length) return;
    const events = [];
    for (const id of pending) {
      const it = engine.items.get(id);
      if (!it) continue;
      const withMarkets = it.postedMv !== it.mv;
      events.push(engine.view(it, withMarkets));
      it.postedMv = it.mv;
    }
    pending.clear();
    post({ type: 'update', events, removed });
    removed = [];
  }

  function ingest(events: FeedEvent[], full: boolean): void {
    const r = engine.ingest(events, Date.now(), { full });
    r.changed.forEach((id) => pending.add(id));
    removed.push(...r.removed);
  }

  async function poll(): Promise<void> {
    if (polling) return;
    polling = true;
    health.lastTry = Date.now();
    try {
      const feed = await getJson<FeedResponse>('/api/feed');
      const anyOk = feed.sources.some((s) => s.ok);
      if (anyOk) {
        engine.lastOk = Date.now();
        health.ok = true;
        health.lastOk = engine.lastOk;
        health.error = undefined;
        ingest(feed.events, true);
      } else {
        health.ok = false;
        health.error = 'The score provider is not answering right now.';
      }
    } catch (e) {
      health.ok = false;
      health.error = `Can't reach live scores (${(e as Error).message}).`;
    } finally {
      polling = false;
      post({ type: 'status', health: { ...health } });
    }
    await followTracked();
  }

  /** Matches with open bets that the main feed no longer lists. */
  async function followTracked(): Promise<void> {
    const now = Date.now();
    if (now - lastTrack < TRACK_MS) return;
    lastTrack = now;
    const want = [...engine.tracked].filter((id) => {
      const it = engine.items.get(id);
      return !it || (it.feed.status !== 'FINISHED' && now - it.lastSeen > POLL_MS * 2) || (it.feed.status === 'FINISHED' && it.markets.some((m) => m.status !== 'SETTLED' && m.status !== 'VOID'));
    }).slice(0, 12);
    for (const id of want) {
      try {
        const ev = await getJson<FeedEvent>(`/api/event?id=${encodeURIComponent(id)}`);
        ingest([ev], false);
      } catch {
        // not found yet; try again next cycle
      }
    }
  }

  async function refreshFocus(): Promise<void> {
    const id = engine.focus;
    const now = Date.now();
    if (!id || now - lastDetail < DETAIL_MS) return;
    lastDetail = now;
    try {
      const ev = await getJson<FeedEvent>(`/api/event?id=${encodeURIComponent(id)}&detail=1`);
      const cur = engine.items.get(id);
      // only take the detail copy if it isn't behind the scoreboard
      if (!cur || cur.feed.status !== 'FINISHED' || ev.status === 'FINISHED') ingest([ev], false);
    } catch {
      // detail is optional
    }
  }

  function loop(): void {
    const now = Date.now();
    engine.tick(now).forEach((id) => pending.add(id));
    flush();
    if (now - lastSnap > SNAPSHOT_MS) {
      lastSnap = now;
      post({ type: 'snapshot', snapshot: { savedAt: now, version: 2, events: engine.snapshot(now) } });
    }
    void refreshFocus();
  }

  return {
    handle(msg: ToEngine): void {
      switch (msg.type) {
        case 'init': {
          if (msg.snapshot?.version === 2) engine.restore(msg.snapshot.events);
          post({ type: 'ready', events: [...engine.items.values()].map((it) => { it.postedMv = it.mv; return engine.view(it, true); }) });
          if (!started) {
            started = true;
            void poll();
            setInterval(() => void poll(), POLL_MS);
            setInterval(loop, TICK_MS);
          }
          break;
        }
        case 'focus':
          engine.focus = msg.eventId;
          lastDetail = 0;
          void refreshFocus();
          break;
        case 'track':
          engine.tracked = new Set(msg.ids);
          lastTrack = 0;
          void followTracked().then(() => flush(true));
          break;
        case 'refresh':
          void poll().then(() => flush(true));
          break;
        case 'snapshot-request':
          post({ type: 'snapshot', snapshot: { savedAt: Date.now(), version: 2, events: engine.snapshot(Date.now()) } });
          break;
      }
    },
  };
}

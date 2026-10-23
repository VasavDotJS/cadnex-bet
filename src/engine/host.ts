/** Drives the engine loop and speaks the worker protocol. Used by the worker and the fallback. */
import { Engine } from './engine';
import type { FromEngine, ToEngine } from './types';

const TICK_MS = 250;
const POST_MS = 500;
const SNAPSHOT_MS = 10_000;

export function createHost(post: (m: FromEngine) => void) {
  const engine = new Engine();
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastPost = 0;
  let lastSnap = Date.now();
  const pending = new Set<string>();
  let removed: string[] = [];

  function flush(now: number): void {
    lastPost = now;
    if (!pending.size && !removed.length) return;
    const events = [];
    for (const id of pending) {
      const ev = engine.events.get(id);
      if (!ev) continue;
      const withMarkets = ev.postedMv !== ev.mv;
      events.push(engine.view(ev, withMarkets));
      ev.postedMv = ev.mv;
    }
    pending.clear();
    post({ type: 'update', events, removed });
    removed = [];
  }

  function loop(): void {
    const now = Date.now();
    try {
      const r = engine.tick(now);
      r.changed.forEach((id) => pending.add(id));
      removed.push(...r.removed);
    } catch (e) {
      post({ type: 'log', msg: `engine tick failed: ${(e as Error).message}` });
    }
    if (now - lastPost >= POST_MS) flush(now);
    if (now - lastSnap >= SNAPSHOT_MS) {
      lastSnap = now;
      post({ type: 'snapshot', snapshot: engine.snapshot(now) });
    }
  }

  return {
    handle(msg: ToEngine): void {
      switch (msg.type) {
        case 'init': {
          engine.init(msg.snapshot, msg.settings, Date.now());
          const events = [...engine.events.values()].map((ev) => {
            ev.postedMv = ev.mv;
            return engine.view(ev, true);
          });
          post({ type: 'ready', events });
          if (timer) clearInterval(timer);
          timer = setInterval(loop, TICK_MS);
          break;
        }
        case 'settings':
          engine.setSettings(msg.settings);
          break;
        case 'focus':
          engine.focus = msg.eventId;
          break;
        case 'snapshot-request':
          post({ type: 'snapshot', snapshot: engine.snapshot(Date.now()) });
          break;
      }
    },
  };
}

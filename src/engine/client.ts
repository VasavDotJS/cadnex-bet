/**
 * Main-thread side of the engine. Runs the engine in a Web Worker; if the environment
 * refuses workers, falls back to running the same host on the main thread.
 */
import type { FromEngine, ToEngine } from './types';

export interface EngineHandle {
  send(m: ToEngine): void;
  mode: 'worker' | 'main';
}

export async function startEngine(onMessage: (m: FromEngine) => void): Promise<EngineHandle> {
  try {
    // bundlers (Next.js/webpack) turn this into a separate worker chunk
    const w: Worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    let alive = false;
    const ok = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(alive), 2500);
      w.onmessage = (e: MessageEvent<FromEngine>) => {
        if (!alive) {
          alive = true;
          clearTimeout(t);
          resolve(true);
        }
        onMessage(e.data);
      };
      w.onerror = () => {
        clearTimeout(t);
        resolve(false);
      };
      // probe: answers immediately once the worker script runs
      w.postMessage({ type: 'ping' } satisfies ToEngine);
    });
    if (ok) {
      w.onmessage = (e: MessageEvent<FromEngine>) => onMessage(e.data);
      return { send: (m) => w.postMessage(m), mode: 'worker' };
    }
    w.terminate();
  } catch {
    // fall through to main thread
  }
  const { createHost } = await import('./host');
  const host = createHost((m) => setTimeout(() => onMessage(m), 0));
  return { send: (m) => host.handle(m), mode: 'main' };
}

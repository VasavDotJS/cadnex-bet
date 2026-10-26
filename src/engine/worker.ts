/// <reference lib="webworker" />
import { db } from '../db/db';
import { createHost, SnapshotStore } from './host';
import type { EngineSnapshot, ToEngine } from './types';

const SNAP_KEY = 'live-v2';

/** The engine saves its own snapshot here, so the page never has to copy it. */
const store: SnapshotStore = {
  load: async () => ((await db.engine.get(SNAP_KEY))?.snapshot as EngineSnapshot | undefined) ?? null,
  save: async (snapshot) => { await db.engine.put({ id: SNAP_KEY, snapshot }); },
};

const host = createHost((m) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m), '', store);
self.onmessage = (e: MessageEvent<ToEngine>) => host.handle(e.data);

/// <reference lib="webworker" />
import { createHost } from './host';
import type { ToEngine } from './types';

const host = createHost((m) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m));
self.onmessage = (e: MessageEvent<ToEngine>) => host.handle(e.data);

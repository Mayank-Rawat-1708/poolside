// Per-request state that any code on the request's async path can read
// without threading it through every function signature.
import { AsyncLocalStorage } from 'node:async_hooks';

export interface Timings {
  acquireMs: number; // waiting for a pool connection
  queryMs: number; // executing SQL
  downstreamMs: number; // waiting on the payments provider
}

export interface RequestContext {
  requestId: string;
  traceId: string | undefined;
  timings: Timings;
  openTransactions: number; // BEGIN without COMMIT/ROLLBACK yet, see tx-guard.ts
}

const storage = new AsyncLocalStorage<RequestContext>();

export function newContext(requestId: string, traceId: string | undefined): RequestContext {
  return { requestId, traceId, timings: { acquireMs: 0, queryMs: 0, downstreamMs: 0 }, openTransactions: 0 };
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

// No-op outside a request (e.g. background work, tests).
export function addTiming(kind: keyof Timings, ms: number): void {
  const ctx = storage.getStore();
  if (ctx) ctx.timings[kind] += ms;
}

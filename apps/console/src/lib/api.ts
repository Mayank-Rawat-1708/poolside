// Calls to the stack through the console's same-origin proxies.
// Admin routes get the bearer token added by nginx (or the Vite dev proxy).

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export interface DownstreamBehaviour {
  latencyMs: number;
  jitterMs: number;
  errorRate: number;
}

export type StrategyName = 'hold' | 'release';

export interface DbSessionRow {
  state: string;
  count: number;
  longestInStateSec: number;
  oldestXactSec: number;
}

export interface RequestRecord {
  requestId: string;
  traceId?: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  timings: { acquireMs: number; queryMs: number; downstreamMs: number };
  errorClass?: string;
  finishedAt: string;
}

export const api = {
  getDownstream: (signal?: AbortSignal) => request<DownstreamBehaviour>('/downstream/admin/latency', { signal }),
  setDownstream: (b: Partial<DownstreamBehaviour>) =>
    request<DownstreamBehaviour>('/downstream/admin/latency', { method: 'PUT', body: JSON.stringify(b) }),
  getStrategy: (signal?: AbortSignal) => request<{ strategy: StrategyName }>('/api/admin/strategy', { signal }),
  setStrategy: (strategy: StrategyName) =>
    request<{ strategy: StrategyName }>('/api/admin/strategy', { method: 'PUT', body: JSON.stringify({ strategy }) }),
  getDbSessions: (signal?: AbortSignal) =>
    request<{ sampledAt: string; sessions: DbSessionRow[] }>('/api/admin/db-sessions', { signal }),
  getRequests: (limit: number, signal?: AbortSignal) =>
    request<{ requests: RequestRecord[] }>(`/api/admin/requests?limit=${limit}`, { signal }),
};

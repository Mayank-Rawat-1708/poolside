// In-browser load generator for quick demos (k6 is the source of truth for
// evidence). Closed loop: each worker sends one request at a time.
//
// Browsers allow ~6 concurrent HTTP/1.1 connections per origin, which is
// too few to exhaust a 10-connection pool. When served from the console
// (localhost:8080) workers are spread over lg0..lg9.localhost, which
// browsers resolve to loopback and nginx serves with CORS.
import { useCallback, useEffect, useRef, useState } from 'react';

const SHARDS = 10;
const REQUEST_TIMEOUT_MS = 10_000;
const WINDOW_MS = 5_000;

type Outcome = '2xx' | '4xx' | '5xx' | 'timeout';
interface Sample {
  at: number;
  ms: number;
  outcome: Outcome;
}

export interface LoadStats {
  running: boolean;
  inFlight: number;
  rps: number;
  p95Ms: number | null;
  counts: Record<Outcome, number>; // last 5s
  sharded: boolean;
}

function shardBase(worker: number, sharded: boolean): string {
  return sharded ? `http://lg${worker % SHARDS}.localhost:${location.port}/api` : '/api';
}

async function probeShards(): Promise<boolean> {
  if (location.hostname !== 'localhost' || !location.port) return false;
  try {
    const res = await fetch(`http://lg0.localhost:${location.port}/api/health/live`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export function useLoadGenerator(concurrency: number) {
  const [stats, setStats] = useState<LoadStats>({
    running: false,
    inFlight: 0,
    rps: 0,
    p95Ms: null,
    counts: { '2xx': 0, '4xx': 0, '5xx': 0, timeout: 0 },
    sharded: false,
  });
  const running = useRef(false);
  const target = useRef(concurrency);
  const active = useRef(0); // workers currently looping
  const inFlight = useRef(0);
  const samples = useRef<Sample[]>([]);
  const recentIds = useRef<string[]>([]);
  const sharded = useRef(false);

  const worker = useCallback(async (id: number) => {
    active.current++;
    try {
      // A worker exits when stopped or when concurrency drops below its id.
      while (running.current && id < target.current) {
        await oneRequest(shardBase(id, sharded.current), recentIds.current, samples.current, inFlight);
      }
    } finally {
      active.current--;
    }
  }, []);

  const spawnUpTo = useCallback(
    (n: number) => {
      for (let id = active.current; id < n; id++) void worker(id);
    },
    [worker],
  );

  useEffect(() => {
    target.current = concurrency;
    if (running.current) spawnUpTo(concurrency);
  }, [concurrency, spawnUpTo]);

  const start = useCallback(async () => {
    if (running.current) return;
    sharded.current = await probeShards();
    running.current = true;
    spawnUpTo(target.current);
  }, [spawnUpTo]);

  const stop = useCallback(() => {
    running.current = false;
  }, []);

  // Summarise once a second instead of re-rendering per request.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const window = samples.current.filter((s) => now - s.at <= WINDOW_MS);
      samples.current = window;
      const counts = { '2xx': 0, '4xx': 0, '5xx': 0, timeout: 0 };
      for (const s of window) counts[s.outcome]++;
      const sorted = window.map((s) => s.ms).sort((a, b) => a - b);
      setStats({
        running: running.current,
        inFlight: inFlight.current,
        rps: window.length / (WINDOW_MS / 1000),
        p95Ms: sorted.length ? (sorted[Math.floor(sorted.length * 0.95)] ?? null) : null,
        counts,
        sharded: sharded.current,
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => stop, [stop]); // stop on unmount

  return { stats, start, stop };
}

// Same 70/20/10 mix as the k6 scripts.
async function oneRequest(base: string, recentIds: string[], samples: Sample[], inFlight: { current: number }) {
  const roll = Math.random();
  let url: string;
  let init: RequestInit = {};
  if (roll < 0.7 || recentIds.length === 0) {
    url = `${base}/orders`;
    init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerId: 'console', amountCents: 1000 + Math.floor(Math.random() * 500) }),
    };
  } else if (roll < 0.9) {
    url = `${base}/orders/${recentIds[Math.floor(Math.random() * recentIds.length)]}`;
  } else {
    url = `${base}/health`;
  }

  const startedAt = performance.now();
  inFlight.current++;
  let outcome: Outcome = 'timeout';
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    outcome = res.status >= 500 ? '5xx' : res.status >= 400 ? '4xx' : '2xx';
    if (init.method === 'POST' && res.status === 201) {
      const body = (await res.json()) as { id: string };
      recentIds.push(body.id);
      if (recentIds.length > 50) recentIds.shift();
    } else {
      await res.body?.cancel();
    }
  } catch {
    outcome = 'timeout';
    // Back off briefly so a dead endpoint doesn't spin the loop.
    await new Promise((r) => setTimeout(r, 200));
  } finally {
    inFlight.current--;
    samples.push({ at: Date.now(), ms: performance.now() - startedAt, outcome });
  }
}

// Prometheus metrics. One module-level registry; /metrics serves it.
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export const registry = new Registry();

// Event loop lag, heap, GC, CPU, open handles: answers "is the process itself unhealthy?"
collectDefaultMetrics({ register: registry });

// Covers 5ms (fast reads) up to 10s (client timeouts).
const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency as seen by the API',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: LATENCY_BUCKETS,
  registers: [registry],
});



// Every failed request, by error class: a new failure mode shows up as a new label.
export const appErrors = new Counter({
  name: 'app_errors_total',
  help: 'Requests that failed, by error class and route',
  labelNames: ['class', 'route'] as const,
  registers: [registry],
});

// --- Database ---------------------------------------------------------------

export const dbPoolAcquireWait = new Histogram({
  name: 'db_pool_acquire_wait_seconds',
  help: 'Time spent waiting for a pool connection',
  labelNames: ['outcome'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'SQL execution time, excluding pool wait',
  labelNames: ['query'] as const,
  buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const dbConnectionHold = new Histogram({
  name: 'db_pool_connection_hold_seconds',
  help: 'Time a connection stays checked out, from acquire to release',
  buckets: LATENCY_BUCKETS,
  registers: [registry],
});

// Connections killed under us (e.g. code 25P03 = idle_in_transaction_session_timeout).
export const dbClientErrors = new Counter({
  name: 'db_client_errors_total',
  help: 'Errors emitted by checked-out pg clients, by SQLSTATE',
  labelNames: ['code'] as const,
  registers: [registry],
});

// Gauges are read at scrape time from the live pool.
export function registerPoolGauges(read: () => { total: number; idle: number; waiting: number; max: number }) {
  const gauges = [
    ['db_pool_total', 'Open connections (idle + in use)', 'total'],
    ['db_pool_idle', 'Open connections not checked out', 'idle'],
    ['db_pool_waiting', 'Callers queued waiting for a connection', 'waiting'],
    ['db_pool_max', 'Configured pool size', 'max'],
  ] as const;
  for (const [name, help, field] of gauges) {
    registry.removeSingleMetric(name);
    new Gauge({
      name,
      help,
      registers: [registry],
      collect() {
        this.set(read()[field]);
      },
    });
  }
}

// --- Downstream (payments provider) ------------------------------------------

export const downstreamDuration = new Histogram({
  name: 'downstream_request_duration_seconds',
  help: 'Latency of calls to the payments provider, per attempt',
  labelNames: ['outcome'] as const,
  buckets: LATENCY_BUCKETS,
  registers: [registry],
});

// outcome: success | http_error | network_error | timeout
export const downstreamRequests = new Counter({
  name: 'downstream_requests_total',
  help: 'Calls to the payments provider, per attempt, by outcome',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const downstreamRetries = new Counter({
  name: 'downstream_retries_total',
  help: 'Retries of calls to the payments provider, by reason of the failed attempt',
  labelNames: ['reason'] as const,
  registers: [registry],
});

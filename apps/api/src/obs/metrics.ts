// Prometheus metrics. One module-level registry; /metrics serves it.
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';

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

export { LATENCY_BUCKETS };

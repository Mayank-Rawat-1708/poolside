// The same PromQL as the Grafana "Service Overview" dashboard.
const W = '[15s]';
const http = 'http_request_duration_seconds';
const q = (quantile: number, metric: string) => `histogram_quantile(${quantile}, sum by (le) (rate(${metric}_bucket${W})))`;

export const QUERIES = {
  rps: `sum(rate(${http}_count${W}))`,
  errorRps: `sum(rate(${http}_count{status=~"5.."}${W})) or vector(0)`,
  // Empty (not 0) when there is no traffic, so the UI shows "—".
  errorRatio: `(sum(rate(${http}_count{status=~"5.."}${W})) or vector(0)) / (sum(rate(${http}_count${W})) > 0)`,
  p50: q(0.5, http),
  p95: q(0.95, http),
  p99: q(0.99, http),
  poolInUse: 'db_pool_total - db_pool_idle',
  poolMax: 'db_pool_max',
  poolWaiting: 'db_pool_waiting',
  acquireP99: q(0.99, 'db_pool_acquire_wait_seconds'),
  queryP99: q(0.99, 'db_query_duration_seconds'),
  downstreamP99: q(0.99, 'downstream_request_duration_seconds'),
} as const;

export type QueryKey = keyof typeof QUERIES;

#!/usr/bin/env node
// Prints the current value of the key metrics, one per line, so a moment of
// an incident can be saved as text evidence.  Usage: node scripts/prom-snapshot.mjs
const PROM = process.env.PROM_URL ?? 'http://localhost:9090';
const W = '[15s]';
const q = (p, m) => `histogram_quantile(${p}, sum by (le) (rate(${m}_bucket${W})))`;

const QUERIES = [
  ['requests/s', `sum(rate(http_request_duration_seconds_count${W}))`, ''],
  ['5xx ratio', `sum(rate(http_request_duration_seconds_count{status=~"5.."}${W})) / sum(rate(http_request_duration_seconds_count${W}))`, ''],
  ['http p95', q(0.95, 'http_request_duration_seconds'), 's'],
  ['http p99', q(0.99, 'http_request_duration_seconds'), 's'],
  ['pool in use', 'db_pool_total - db_pool_idle', ''],
  ['pool max', 'db_pool_max', ''],
  ['pool waiting', 'db_pool_waiting', ''],
  ['acquire wait p99', q(0.99, 'db_pool_acquire_wait_seconds'), 's'],
  ['connection hold p99', q(0.99, 'db_pool_connection_hold_seconds'), 's'],
  ['db query p99', q(0.99, 'db_query_duration_seconds'), 's'],
  ['downstream p99', q(0.99, 'downstream_request_duration_seconds'), 's'],
  ['downstream retries/s', `sum(rate(downstream_retries_total${W})) or vector(0)`, ''],
  ['event loop lag p99', 'nodejs_eventloop_lag_p99_seconds', 's'],
  ['api cpu (cores)', `rate(process_cpu_seconds_total{job="api"}${W})`, ''],
  ['api heap used', 'nodejs_heap_size_used_bytes', 'bytes'],
  ['pg idle in transaction', 'sum(pg_stat_activity_count{datname="poolside",state="idle in transaction"})', ''],
  ['pg active', 'sum(pg_stat_activity_count{datname="poolside",state="active"})', ''],
];

function format(value, unit) {
  if (!Number.isFinite(value)) return String(value);
  if (unit === 's') return value >= 1 ? `${value.toFixed(3)} s` : `${(value * 1000).toFixed(1)} ms`;
  if (unit === 'bytes') return `${(value / 1024 / 1024).toFixed(1)} MiB`;
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

const lines = [`# Prometheus snapshot ${new Date().toISOString()}`];
for (const [label, expr, unit] of QUERIES) {
  const res = await fetch(`${PROM}/api/v1/query?${new URLSearchParams({ query: expr })}`);
  const body = await res.json();
  const raw = body.data?.result?.[0]?.value?.[1];
  lines.push(`${label.padEnd(24)} ${raw === undefined ? '(no data)' : format(Number(raw), unit)}`);
}
console.log(lines.join('\n'));

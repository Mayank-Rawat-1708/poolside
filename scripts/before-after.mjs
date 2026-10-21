#!/usr/bin/env node
// Builds the before/after table from the k6 JSON summaries written by
// scripts/evidence.sh.  Usage: node scripts/before-after.mjs <runs-dir>
import { existsSync, readFileSync } from 'node:fs';

const dir = process.argv[2] ?? 'docs/evidence/runs';
const SCENARIOS = [
  ['baseline', 'baseline: 5 rps, provider 50ms'],
  ['spike', 'spike: 10→40 rps, provider 1.5s ± 0.5s'],
  ['slow-downstream', 'steady 15 rps, provider 1.2s ± 0.4s'],
];

function load(strategy, scenario) {
  const file = `${dir}/${strategy}/${scenario}.json`;
  if (!existsSync(file)) return null;
  const m = JSON.parse(readFileSync(file, 'utf8')).metrics;
  const ok = (m['responses_by_status{status:201}']?.values.count ?? 0) + (m['responses_by_status{status:200}']?.values.count ?? 0);
  const seconds = m.http_reqs.values.count / m.http_reqs.values.rate;
  return {
    requests: m.http_reqs.values.count,
    p95: m.http_req_duration.values['p(95)'],
    p99: m.http_req_duration.values['p(99)'],
    errorRate: m.http_req_failed.values.rate,
    goodput: ok / seconds,
    s500: m['responses_by_status{status:500}']?.values.count ?? 0,
    s503: m['responses_by_status{status:503}']?.values.count ?? 0,
    s0: m['responses_by_status{status:0}']?.values.count ?? 0,
    healthP95: m['http_req_duration{endpoint:health}']?.values['p(95)'],
    readP95: m['http_req_duration{endpoint:get_order}']?.values['p(95)'],
  };
}

const ms = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(0)} ms`);
const pct = (v) => `${(v * 100).toFixed(1)}%`;

const rows = [
  '| Scenario | Strategy | Requests | p95 | p99 | Error rate | Successful req/s | GET /orders/:id p95 | /health p95 | 500 / 503 / timeout |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
];
for (const [scenario, label] of SCENARIOS) {
  for (const strategy of ['hold', 'release']) {
    const r = load(strategy, scenario);
    if (!r) continue;
    rows.push(
      `| ${label} | \`${strategy}\` | ${r.requests} | ${ms(r.p95)} | ${ms(r.p99)} | ${pct(r.errorRate)} | ${r.goodput.toFixed(1)} | ${ms(r.readP95)} | ${ms(r.healthP95)} | ${r.s500} / ${r.s503} / ${r.s0} |`,
    );
  }
}
console.log(rows.join('\n'));

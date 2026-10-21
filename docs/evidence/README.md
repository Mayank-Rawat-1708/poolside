# Evidence

Everything here was produced by running the system. Nothing is estimated or edited.

- **`runs/`, `screenshots/`, `before-after.md`**: `make down && make up && make evidence` at commit
  `00db6bb`, on 2026-10-21, on a MacBook (Apple Silicon, 8 CPUs, Docker Desktop with a 4 GB VM).
  Laptop numbers: absolute latencies will differ on other machines; the *shape* of the
  results should not.
- **`00-naive/`**: the first run against the original implementation, before any
  instrumentation existed (opaque 500s).
- **`observer-effect/`**: a discarded run where screenshots were taken *during* the measured
  spike. Rendering browsers starved the API of CPU and caused two 503s in `release` mode.
  Kept to explain why `evidence.sh` now separates the two.
- **`explain-analyze.txt`**: query plans for the service's three statements (hypothesis 1).
- **`traces/`**: one representative `POST /orders` trace per strategy (p90 of successful
  orders during the spike): Jaeger JSON plus a text waterfall.

## Before / after

| Scenario | Strategy | Requests | p95 | p99 | Error rate | Successful req/s | GET /orders/:id p95 | /health p95 | 500 / 503 / timeout |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline: 5 rps, provider 50ms | `hold` | 151 | 91 ms | 109 ms | 0.0% | 5.0 | 13 ms | 14 ms | 0 / 0 / 0 |
| baseline: 5 rps, provider 50ms | `release` | 150 | 89 ms | 96 ms | 0.0% | 5.0 | 8 ms | 9 ms | 0 / 0 / 0 |
| spike: 10→40 rps, provider 1.5s ± 0.5s | `hold` | 1897 | 2.69 s | 2.91 s | 66.3% | 8.8 | 1.01 s | 1.01 s | 0 / 1257 / 0 |
| spike: 10→40 rps, provider 1.5s ± 0.5s | `release` | 1897 | 1.93 s | 1.99 s | 0.0% | 26.7 | 9 ms | 10 ms | 0 / 0 / 0 |
| steady 15 rps, provider 1.2s ± 0.4s | `hold` | 902 | 2.42 s | 2.55 s | 20.5% | 11.5 | 1.01 s | 1.01 s | 0 / 185 / 0 |
| steady 15 rps, provider 1.2s ± 0.4s | `release` | 902 | 1.56 s | 1.60 s | 0.0% | 14.7 | 7 ms | 6 ms | 0 / 0 / 0 |

(`before-after.md` is generated from `runs/*/*.json` by `scripts/before-after.mjs`.)

How to read it:
- **Errors**: 66% → 0% in the spike, 20% → 0% at a steady 15 rps.
- **Reads and health checks**: ~1 s (the pool acquire timeout) → single-digit ms. They never
  call the provider. In `hold` they failed *more* often than orders (spike: `GET /orders/:id`
  69% failed, `/health` 73%, `POST /orders` 64%). They queue for a connection like everyone
  else, but with no head start.
- **p95 in `release` still tracks the provider** (~1.5–2 s): an order can't be faster than
  the payment call it waits for. The fix removes the *amplification* (provider latency →
  everyone's latency, then errors), not the provider's latency itself. The k6 `create_order`
  p95 threshold (1 s) still fails in `release` for that reason.
- **Successful throughput**: 8.8 → 26.7 req/s with identical offered load.
- `hold` errors are 503 `POOL_ACQUIRE_TIMEOUT` because the fail-fast defense is active in
  both strategies. On the original build the same failure was a 500 (`00-naive/`).

## At the peak of the spike (≈30 s in)

| | `hold` | `release` |
|---|---:|---:|
| requests/s | 37.8 | 37.9 |
| 5xx ratio | 0.751 | 0 |
| pool in use / max | 10 / 10 | 1 / 10 |
| **pool waiting** | **40** | 0 |
| **acquire wait p99** | **2.480 s** | 6.9 ms |
| connection hold p99 | 2.479 s | 43.0 ms |
| db query p99 | 14.1 ms | 43.0 ms |
| downstream p99 | 2.485 s | 2.485 s |
| event loop lag p99 | 16.7 ms | 50.0 ms |
| API CPU | 0.24 cores | 0.28 cores |
| **pg `idle in transaction`** | **10** | 0 |

From `runs/<strategy>/prometheus-during-spike.txt` and `pg-activity-during-spike.txt`.
**Caveat on the p99 values:** they come from `histogram_quantile` over buckets
(…, 1 s, 2.5 s, …), and Prometheus interpolates linearly inside a bucket. `2.48 s` therefore
means "near the top of the 1–2.5 s bucket", not an observed 2.48 s. Acquire waits in fact
cannot exceed ~1 s (`DB_ACQUIRE_TIMEOUT_MS=1000`, and the trace shows 995 ms), and the
provider's latency is at most 2 s. The comparisons hold (acquire ≈ hold ≈ downstream, all
≫ query), but exact tail values come from k6 and traces. In `release`, query p99 equals hold p99
(43 ms): connections are held only while SQL runs. The 43 ms is the API-side measurement at
~38 rps on a laptop (it includes event-loop scheduling); the plans in `explain-analyze.txt`
execute in under 1 ms.

`docker stats` at the same moment: API container 28% of one core and Postgres 20% (`hold`) /
6% (`release`), with 8 cores available. Nothing is CPU-bound.

## Files

```
runs/<strategy>/
  baseline|spike|slow-downstream.{txt,json}   k6 summaries (txt = human, json = raw)
  *.stdout.txt                                k6 console output
  pg-activity-during-spike.txt                make pg-activity at the peak
  db-sessions-during-spike.json               GET /admin/db-sessions at the peak
  prometheus-during-spike.txt                 scripts/prom-snapshot.mjs at the peak
  docker-stats-during-spike.txt               container CPU / memory at the peak
screenshots/<strategy>-spike-{console,grafana}-{light,dark}.png
traces/<strategy>-post-orders.json, <strategy>-waterfall.txt
```

Screenshots come from a second, unmeasured spike per strategy (same scenario), taken
≈35 s in. Things to know when reading them:
- The console's incident timeline is empty because the browser opened mid-incident.
- Charts show the last 5 minutes, so the `release` screenshots still include the tail of
  the preceding `hold` spike (the hump about two minutes before the right edge). The
  current state is the right-hand edge plus the KPI cards: 0% errors, 0 waiting.
- The console status reads **Failing** in `release` because p95 ≥ 2 s (the provider is
  still slow). Errors and pool waiting are 0.

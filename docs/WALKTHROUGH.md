# Walkthrough: see the failure and the fix yourself in ~5 minutes

The numbers below come from the recorded runs in [`docs/evidence/`](evidence/README.md)
(a laptop with 8 CPUs, Docker Desktop with a 4 GB VM). Yours will vary with the machine,
and with anything else it's doing at the time. The *shape* should not: pool pinned,
callers waiting, connections idle in transaction.

## Prerequisites

- Docker with Compose v2, and `make`.
- Free local ports: 3000, 3001, 4001, 5432, 8080, 9090, 16686.
- k6 runs in a container, so there is nothing else to install.

## 1. Start the stack (~1–2 minutes the first time)

```bash
make up
```

Open:

| | URL | Look at |
|---|---|---|
| Console | http://localhost:8080 | KPI row, "Connection pool", "Where request time goes", Postgres sessions, request explorer |
| Grafana | http://localhost:3001 | "Service Overview" dashboard (anonymous, read-only), read top to bottom |
| Jaeger | http://localhost:16686 | service `poolside-api`, operation `POST /orders` |

Optional sanity check: `make load-baseline` (5 rps, provider at 50 ms) gives 0% errors and
p95 ≈ 90 ms. Light load is fine.

## 2. Break it

```bash
make break         # payments provider → 1.5 s ± 0.5 s
make load-spike    # 10 → 40 rps for ~70 s (70% POST /orders, 20% GET /orders/:id, 10% /health)
```

While the spike runs (the plateau is ~20–50 s in), look at:

| Where | What you should see | Recorded value |
|---|---|---|
| Console status / k6 summary | **Failing**; about two thirds of requests fail, including reads and `/health` | 66.3% failed; `GET /orders/:id` 69%, `/health` 73% |
| Console "Pool in use" / Grafana row 2 | **Pool pinned at max** | 10 / 10 |
| "Pool waiting" | **Callers queued** | 40 |
| "Acquire wait p99" vs "DB query p99" | **Acquire wait dominates**; SQL is fast | acquire ≈ 1 s (capped by the timeout) vs query 14 ms |
| "Connection hold time p99" (Grafana) | Hold ≈ provider latency ≫ query time | top of the 1–2.5 s bucket vs 14 ms |
| Console "Postgres sessions" / `make pg-activity` | **`idle in transaction`** sessions whose last statement is the INSERT | 10 sessions, oldest ~1.8 s |
| Grafana row 4 | CPU, event loop, heap flat: the process isn't the problem | 0.24 cores, lag 17 ms, heap 41 MiB |
| Any failing response | `503 {"error":"service_unavailable","code":"POOL_ACQUIRE_TIMEOUT"}`: *what* ran out, not *why* | — |

Then open one slow request. In the console's request explorer, filter `≥ 1s`, select a row,
and choose "Open trace in Jaeger" (or search Jaeger for `POST /orders`, min duration 2s). The
waterfall shows the cause directly:

```
POST /orders                 2778 ms
├─ db.pool.acquire            995 ms   ← waiting for a connection
├─ BEGIN, INSERT                2 ms
├─ db.connection.held        1781 ms   ← connection checked out…
│  └─ downstream.charge      1776 ms   ← …during the payments HTTP call
└─ UPDATE, COMMIT               3 ms
```

(`docs/evidence/traces/hold-waterfall.txt`)

The Grafana p99 panels read "≈ 2.48 s" because Prometheus interpolates inside the 1–2.5 s
histogram bucket. Real acquire waits stop at the 1 s timeout; the trace shows the actual value.

## 3. Fix it

```bash
make fix           # TX_STRATEGY=release at runtime, no restart
make load-spike    # same load, provider still slow
```

| | `hold` | `release` (recorded) |
|---|---:|---:|
| Error rate | 66.3% | **0.0%** |
| Successful req/s | 8.8 | **26.7** |
| `GET /orders/:id` p95 | 1.01 s | **9 ms** |
| `/health` p95 | 1.01 s | **10 ms** |
| Pool in use at peak | 10 / 10 | **1 / 10** |
| `idle in transaction` | 10 | **0** |
| Acquire wait p99 | ≈ 1 s | **6.9 ms** |
| Connection hold p99 vs query p99 | ≈ provider latency vs 14 ms | **43 ms vs 43 ms** (held only for SQL) |

Order p95 stays ≈ 1.9 s, because an order can't finish before its payment does, so the
console status may still read Failing on its p95 threshold. What changed is that errors,
reads and health checks are no longer affected by the slow provider. The `release` trace
(`docs/evidence/traces/release-waterfall.txt`) shows two short checkouts (1.6 ms, 2.3 ms)
on either side of the provider call.

In `release`, "Pool waiting" can still blip above 0 for a moment under load: inserts and
updates do hold connections, just very briefly. The meaningful signal is the wait *time*
(milliseconds), not the count.

## 4. Clean up

```bash
make reset         # provider back to 50 ms, TX_STRATEGY=hold
make down          # stop everything and delete volumes
```

## Where to read more

- Code diff of the fix: `apps/api/src/orders/strategies/hold.ts` vs `release.ts`.
- The diagnosis as a timeline with refuted hypotheses: [INVESTIGATION.md](INVESTIGATION.md).
- All captured outputs: [evidence/README.md](evidence/README.md). Full matrix: `make evidence` (~13 min).

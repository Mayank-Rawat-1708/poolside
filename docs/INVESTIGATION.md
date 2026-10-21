# Investigation

Written as it would be done without knowing the cause. Every observation points to a
recorded artifact in `docs/evidence/`. Numbers are from those files, not from memory.

## T+0: Symptoms

A spike in traffic coincides with reports of failed checkouts. The load test reproduces
it (`00-naive/spike-slow-downstream.txt`, original build):

- **64% of requests fail**, every one of them `500 {"error":"internal_error"}`.
- Failures are not limited to placing orders. `GET /orders/:id` and `GET /health` fail too.
- Under light load (`00-naive/baseline.txt`) nothing fails: p95 ≈ 94 ms.
- The only server-side clue, repeated for each failure:
  `Error: timeout exceeded when trying to connect at pg-pool/index.js`.

The response is useless and identical for every route. The log message *sounds* like the
database is unreachable.

## T+5 min: Narrow the search space

What all failing routes share: the process, the database, and the pg pool. What they do
**not** share: the payments call (only `POST /orders` makes it). So the cause is probably
in something shared, and the provider is at most a trigger.

The original build had no way to tell "waiting for a connection" from "running SQL" from
"waiting for the provider". Before guessing further, I added instrumentation in this order
(see the git history): request ids and per-request timing logs → HTTP and process metrics →
pool gauges plus separate acquire-wait / query / hold-time histograms → downstream metrics
→ traces with a manual span around pool acquire → the Grafana dashboard →
`pg_stat_activity` snapshots.

Then I re-ran the same scenario and went through hypotheses in order of prior probability.

## Hypothesis 0: The database is down or unreachable (from the log message)

| | |
|---|---|
| **Checked** | `psql` straight to Postgres while the incident runs (`make pg-activity`); `/health/ready` on a separate small pool; postgres_exporter scrapes. |
| **Observed** | `make pg-activity` returns during the peak (`runs/hold/pg-activity-during-spike.txt`). `/health/ready` returns `200` in milliseconds **during** the incident, reporting `{"total":10,"idle":0,"waiting":39}` (`responses-during-incident.txt`). The exporter scrapes fine throughout. |
| **Verdict** | **Refuted.** Postgres is reachable. pg says "timeout exceeded when trying to *connect*" when it timed out waiting for a **pool slot**, not for a TCP connection. The message is misleading, and the `waiting: 39` is the first real clue. |

## Hypothesis 1: Slow query or missing index

| | |
|---|---|
| **Checked** | `db_query_duration_seconds` by query name (timed *after* acquire, so it excludes pool wait); `EXPLAIN (ANALYZE, BUFFERS)` of all three statements; session states. |
| **Observed** | At the peak, **query p99 = 14.1 ms** across all queries, while API p99 is 4.7 s (`runs/hold/prometheus-during-spike.txt`). Plans: `GET /orders/:id` is an Index Scan on `orders_pkey` in **1.0 ms**, INSERT **0.6 ms**, UPDATE **0.17 ms** (`explain-analyze.txt`). Postgres sessions are not `active`; they are `idle in transaction`. |
| **Verdict** | **Refuted.** The SQL is fast. Nothing is waiting *inside* Postgres. |

Grafana showed a brief query-p99 blip right after a restart. It was the first queries on
fresh connections (connection setup and cold caches), and it doesn't recur under load.

## Hypothesis 2: The API process is saturated (CPU, memory, event loop)

| | |
|---|---|
| **Checked** | `process_cpu_seconds_total`, `nodejs_eventloop_lag_p99_seconds`, `nodejs_heap_size_used_bytes`, `docker stats`. |
| **Observed** | At the peak: **0.24 cores** of CPU, **event-loop lag p99 16.7 ms**, **heap 41 MiB** (`runs/hold/prometheus-during-spike.txt`). `docker stats`: API 28% of one core, Postgres 20%, with 8 cores available (`runs/hold/docker-stats-during-spike.txt`). |
| **Verdict** | **Refuted.** The process is mostly idle. Requests are *waiting*, not computing. |

One trap here: in an earlier run, event-loop lag spiked to ~250 ms. Lining it up with
`db_pool_waiting` showed the spike arrived **~40 s after** the queue had built up, when
~50 queued requests timed out in the same tick and were serialized as errors together. It
was an effect of the incident, not its cause. Order of events matters.

## Hypothesis 3: The payments provider is failing

| | |
|---|---|
| **Checked** | `downstream_requests_total{outcome}`, `downstream_request_duration_seconds`, provider logs, and the API latency/error *shape* compared with the provider's. |
| **Observed** | Every provider call returns 200 (`outcome="success"` only, 0 retries). The provider **is slow**: 1.5 s ± 0.5 s, so at most ~2 s. But (a) the failing requests take **≈ 1.0 s** and fail without any provider call (`GET /orders/:id` p95 **1.01 s**, 69% failed); (b) orders take up to **3.08 s** (`create_order` p99 2.93 s, max 3.08 s in `runs/hold/spike.txt`), *longer* than the provider ever takes; (c) at a steady 15 rps the provider is just as slow and 20% of requests still fail, reads included. |
| **Verdict** | **Refuted as the cause.** The provider isn't returning errors, and its latency alone can't explain reads failing or API latency exceeding provider latency. Something between our request and the provider call adds the extra wait. The provider's slowness is the **trigger**. |

## Hypothesis 4: Pool exhaustion, with connections held across I/O

| | |
|---|---|
| **Checked** | Pool gauges, acquire wait vs hold time vs query time, `pg_stat_activity`, traces. |
| **Observed** | **Pool 10/10 in use, 40 callers waiting.** **Acquire wait ≈ connection hold time ≈ downstream latency** (all in the top bucket: p99 ≈ 2.48 s, interpolated; see the caveat in `evidence/README.md`), against a query p99 of 14 ms. Connections are checked out ~100× longer than the SQL they run. `pg_stat_activity` shows **10 sessions `idle in transaction`**, each with last statement `INSERT INTO orders …` and transaction age 1–2 s (`runs/hold/pg-activity-during-spike.txt`). The p90 trace (`traces/hold-waterfall.txt`): `db.pool.acquire` **995 ms** → BEGIN, INSERT → `db.connection.held` **1781 ms**, which contains `downstream.charge` **1775 ms** → UPDATE, COMMIT. |
| **Verdict** | **Confirmed.** |

```
# hold: POST /orders (p90 of successful orders during the spike)
start_ms  dur_ms  span
     0.0  2777.7  POST /orders
     1.0   995.4  db.pool.acquire           ← queued behind other orders
   997.0  1781.0  db.connection.held        ← connection checked out…
   997.0     1.1  pg.query:INSERT
   999.0  1775.5  downstream.charge         ← …while the HTTP call runs
  2774.0     2.0  pg.query:UPDATE
  2776.0     1.2  pg.query:COMMIT
```

## Root cause

`POST /orders` opens a transaction, inserts the order, **calls the payments provider over
HTTP while the transaction and its pool connection stay open**, then updates and commits.
Every order therefore holds one of 10 connections for the full provider latency. When
order rate × provider latency exceeds 10, the pool is exhausted. Every caller queues,
including reads and health checks that never touch the provider, and requests fail once
their wait passes the acquire timeout.

Little's law makes the threshold explicit: at 1.5 s per order, 10 connections sustain
≈ 6.7 orders/s. The spike offers ~28 orders/s. At a 50 ms provider latency the same code
needs a fraction of one connection, which is why it "works normally under light load".

## Fix and verification

`TX_STRATEGY=release` (commit `fix(api): release db connection before calling payments`):
insert `pending` in a short checkout, release, call the provider with no connection held,
then update in a second short checkout. Same scenario, same machine (`before-after.md`):

| Spike, provider 1.5 s ± 0.5 s | `hold` | `release` |
|---|---:|---:|
| Error rate | 66.3% | **0.0%** |
| Successful req/s | 8.8 | **26.7** |
| `GET /orders/:id` p95 | 1.01 s | **9 ms** |
| `/health` p95 | 1.01 s | **10 ms** |
| Pool waiting at peak | 40 | **0** |
| `idle in transaction` at peak | 10 | **0** |
| Connection hold p99 vs query p99 | ≈ 2.5 s vs 14 ms | **43 ms vs 43 ms** |

Order p95 is still ≈ 1.9 s in `release`, because an order can't finish before its payment
does. What's gone is the amplification: one slow dependency no longer takes down unrelated
routes.

## Things I tripped over on the way (worth knowing)

- `pool.query()` checks out a connection implicitly. Timing it would have reported pool
  wait as "slow query" and sent the investigation to the database (hypothesis 1). All
  access goes through an explicit, separately timed acquire.
- pg-pool counts a caller as *waiting* while a new connection is being opened, so small
  "waiting" blips at startup are not contention.
- Taking browser screenshots during a measured run on the same laptop starved the API's CPU
  and produced 503s even in `release` (`evidence/observer-effect/`). Measurement and
  screenshots are now separate.
- pg uses one `connectionTimeoutMillis` for two situations with two different messages:
  waiting for a free connection ("timeout exceeded when trying to connect") and opening a
  new one ("Connection terminated due to connection timeout"). Only the first was mapped to
  the typed 503 at first. On a cold CI runner, 4 of 902 requests hit the second case and
  surfaced as untyped 500s. Both are now classified (`isPoolTimeout`, with a unit test).

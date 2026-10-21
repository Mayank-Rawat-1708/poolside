# Instrumentation

Everything here exists to answer one question quickly: **where is the time going, and
what is it waiting on?** None of it is specific to the pool bug. The last section shows
how the same signals expose other failure classes.

## Metrics (`GET /metrics`, prom-client)

| Metric | Type / labels | Question it answers |
|---|---|---|
| `http_request_duration_seconds` | histogram; `method`, `route` (template, e.g. `/orders/:id`), `status` | How fast and how successful is each route, as the server sees it? (Client timeouts are not visible here.) |
| `app_errors_total` | counter; `class`, `route` | Which kinds of failure are happening? A new failure mode appears as a new `class` (`PoolAcquireTimeoutError`, `DownstreamError`, `Error`…). |
| `db_pool_total` / `db_pool_idle` / `db_pool_waiting` / `db_pool_max` | gauges, read at scrape time | How many connections are open, free and checked out (`total − idle`), and how many callers are queued? |
| `db_pool_acquire_wait_seconds` | histogram; `outcome` = ok \| timeout \| error | How long do requests wait for a connection before any SQL runs? |
| `db_pool_connection_hold_seconds` | histogram | How long is a connection checked out? Compare it with query time: a large gap means the connection is held while the code does something else. |
| `db_query_duration_seconds` | histogram; `query` (fixed names: `insert_order`, `mark_order`, `find_order`, `begin`, `commit`, …) | Is the SQL itself slow? This excludes pool wait on purpose. |
| `db_client_errors_total` | counter; `code` (SQLSTATE) | Is the server killing our connections? `25P03` = idle-in-transaction timeout. |
| `downstream_request_duration_seconds` | histogram; `outcome` | How slow is the payments provider, per attempt? |
| `downstream_requests_total` | counter; `outcome` = success \| http_error \| network_error \| timeout | How often does the provider fail, and how? |
| `downstream_retries_total` | counter; `reason` | Are we retrying, and is that turning into a retry storm? |
| `app_network_io_in_transaction_total` | counter; `target` | Did code make an outbound call while a transaction was open? Any non-zero value is this incident's root cause in the making (`obs/tx-guard.ts`; `TX_IO_GUARD=throw` makes it fatal in tests/staging). |
| `app_tx_strategy` | gauge; `strategy` | Which `POST /orders` strategy is active? Grafana annotates its changes. |
| prom-client defaults | `nodejs_eventloop_lag_*`, `nodejs_heap_*`, `process_cpu_seconds_total`, GC, handles | Is the process itself unhealthy (CPU-bound, blocking the loop, leaking)? |
| `pg_stat_activity_count{state}` | from postgres_exporter | What are the database sessions doing? |

Two design choices matter:

- **Pool wait and SQL time are measured separately.** `pool.query()` checks out a
  connection implicitly, so timing it would report pool wait as "slow query" and point
  the investigation at the database. All access goes through `InstrumentedPool.acquire()`
  and `timedQuery()` instead.
- **Labels are bounded.** Routes are templates, query names are fixed strings, and error
  classes come from code. No raw URLs, SQL text or IDs, so cardinality can't explode.

## Logs (pino, JSON, one line per request)

```json
{"level":30,"time":"…","service":"api","requestId":"7f3c…","traceId":"8b61…",
 "method":"POST","route":"/orders","status":503,"durationMs":1006.8,
 "errorClass":"PoolAcquireTimeoutError",
 "timings":{"acquireMs":1003.1,"queryMs":0,"downstreamMs":0},
 "pool":{"total":10,"idle":0,"waiting":27,"max":10},"msg":"request completed"}
```

| Field | Why |
|---|---|
| `requestId` | Taken from a valid `x-request-id` header or generated (UUID), echoed in the response header and forwarded to the payments provider, so one id joins the client, our logs and theirs. |
| `traceId` | Jumps from a log line to the trace in Jaeger. |
| `route`, `status`, `durationMs` | The basic who / what / how long. |
| `errorClass` | The typed error name; it groups failures without parsing messages. |
| `timings` | Where this request's time went. If `acquireMs` dominates, the request was waiting for a connection, not doing work. |
| `pool` | Pool state at the moment the request finished, so pool exhaustion shows up even without metrics. |

Error details (stack, `cause`) are logged at `warn` for typed errors and `error` for
unexpected ones. Clients only ever see `{"error": "...", "code": "..."}`.
Prometheus scrapes aren't logged, and console polling (`/admin/*`) is logged at `debug`.

## Traces (OpenTelemetry → Jaeger)

Auto-instrumentation: incoming HTTP (span named after the route template), outgoing
`fetch` (undici) and `pg` queries. Manual spans:

| Span | Shows |
|---|---|
| `db.pool.acquire` | Time queued for a connection, with `db.pool.waiting` / `idle` / `total` at the start. |
| `db.connection.held` | Acquire → release. In `hold` mode it visibly contains the `downstream.charge` span. That is the bug, drawn as a waterfall. |
| `downstream.charge` | The provider call; retries appear as span events with attempt, delay and reason. |

`hold` mode under load (`docs/evidence/traces/hold-waterfall.txt`):

```
POST /orders                 2778 ms
├─ db.pool.acquire            995 ms   ← waiting for a connection
├─ pg BEGIN / INSERT            2 ms
├─ db.connection.held        1781 ms   ← held while…
│  └─ downstream.charge      1776 ms   ← …the payments call runs
└─ pg UPDATE / COMMIT           3 ms
```

## Health checks

| Endpoint | Checks | Used by |
|---|---|---|
| `GET /health/live` | Nothing outside the process. | Liveness: restart only if the process is wedged. |
| `GET /health/ready` | `SELECT 1` on the **ops pool** (2 connections, 500ms acquire timeout); returns pool stats for information. | Readiness / compose healthcheck. |
| `GET /health` | `SELECT 1` on the **main pool**. | Kept on purpose as the original "deep" check, to show the trap. |

**Why a readiness check that shares the main pool is a trap.** During pool exhaustion it
queues behind traffic and times out, so the orchestrator marks the pod unready. Every
replica is exhausted for the same reason at the same moment, so they all get pulled from
the load balancer together. Load then piles onto whatever is left (or onto nothing), and
replicas flap in and out. If liveness shares the pool, the orchestrator also restarts
healthy processes, which throws away warm connections and in-flight work. The check turns
a slowdown into an outage. Readiness should answer "can this instance reach its
dependencies at all?". It should not answer "is it busy?", and it must not depend on the
resource that is saturated. Saturation belongs in metrics and alerts (or load shedding),
not in health checks.

## Postgres visibility

- `make pg-activity` (`scripts/pg-activity.sh`): sessions grouped by state, plus the
  oldest open transactions with their last statement.
- `GET /admin/db-sessions` and the console's Postgres panel: the same counts, live.
- Grafana "Postgres sessions by state" (postgres_exporter).

The tell for this incident is **many `idle in transaction` sessions whose last statement
(an INSERT) finished long ago**. The SQL is fast, but the transaction stays open while the
application does something else.

## How the same signals catch other failures

| Failure | First signal | Confirming signal |
|---|---|---|
| **Slow query / missing index** | `db_query_duration_seconds{query=…}` p99 rises for one query name | `pg_stat_activity` shows `active` (not idle in transaction); hold time ≈ query time; trace shows a long `pg.query` span; `EXPLAIN ANALYZE` shows a seq scan. Pool may also saturate, but the time is *in* SQL. |
| **Downstream outage (5xx / errors)** | `downstream_requests_total{outcome="http_error"}` and `app_errors_total{class="DownstreamError"}`, API 502s | Downstream latency is normal or fast; retries rise; the pool is fine in `release` mode. |
| **Downstream slowness** | `downstream_request_duration_seconds` p99 up | In `hold`: pool pinned, acquire wait up, `idle in transaction`. In `release`: API latency ≈ downstream latency, pool fine. |
| **Retry storm** | `downstream_retries_total` rate rising relative to `downstream_requests_total` | Provider sees roughly 3× traffic; outcome `timeout` dominates; latency ≈ attempts × timeout; retry events on spans. |
| **Memory leak** | `nodejs_heap_size_used_bytes` climbs across GC cycles without returning | GC time rises, then event loop lag, then latency for every route at once; restarts reset it. |
| **CPU-bound / blocking code** | `nodejs_eventloop_lag_p99_seconds` and `process_cpu_seconds_total` rise | All routes slow down together, including `/health/live`; spans show gaps not attributed to DB or downstream ("other" in the console breakdown). |
| **Connection leak (missing `release()`)** | `db_pool_total − db_pool_idle` stays at max **with no traffic** | Acquire timeouts; `db.connection.held` spans never end; `pg_stat_activity` idle sessions held by the API with no activity. |
| **DB down / failover** | `/health/ready` 503; `app_errors_total{class="Error"}` with `ECONNREFUSED`/`ENOTFOUND` | `db_client_errors_total`; postgres_exporter `pg_up == 0`. |

# Runbook: API latency high / 5xx spike

For whoever is on call. Work top to bottom and stop when the cause is clear.
Links assume the local stack: Grafana http://localhost:3001 (Service Overview),
Jaeger http://localhost:16686, console http://localhost:8080.

## 0. Stabilize first (2 minutes)

- Is it still happening? Grafana row 1: error rate and p99 over the last 15 min.
- Did anything just change? Check deploys, config, feature flags, and the Grafana annotations
  (`TX_STRATEGY` changes are annotated). If a change lines up with the start, **roll it back
  first** and investigate after.
- Is one dependency known to be degraded (provider status page)?

## 1. What do clients see? (row 1: Symptoms)

| Look at | Tells you |
|---|---|
| Error rate stacked by route | Only `POST /orders` failing → a problem in the write path. **Reads and `/health` failing too** → a shared resource (pool, DB, process). |
| Errors by class | `PoolAcquireTimeoutError` → pool exhaustion. `DownstreamError` → provider. `Error` (generic) → read the logs. |
| Status codes | 503 + `POOL_ACQUIRE_TIMEOUT` = overload; 502 `PAYMENTS_UNAVAILABLE` = provider; 500 = unexpected. |
| Latency p50 vs p99 | Everything slow → saturation or process problem. Only the tail slow → a subset of requests waiting on something. |

## 2. Where are requests waiting? (row 2: Saturation)

| Signal | If high |
|---|---|
| Pool in use = max **and** pool waiting > 0 | Pool exhausted; go to 2a. |
| Acquire wait p99 ≫ query p99 | Requests wait for connections, not for SQL. |
| Connection hold p99 ≫ query p99 | Connections are held while doing something other than SQL. **I/O inside a transaction.** |
| Postgres sessions: many `idle in transaction` | Same conclusion, from the database's side. |

### 2a. Confirm pool exhaustion and find who holds the connections

```bash
make pg-activity        # sessions by state + oldest transactions and their last statement
```

- `idle in transaction` with a fast last statement (INSERT/UPDATE) and an age of seconds:
  code holds an open transaction while waiting on something else.
- `active` with long runtimes: slow SQL. Go to 3a.
- `idle` (not in transaction) but pool pinned with no traffic: connection leak (missing `release()`).

Then open one slow request: console **Request explorer**, filter `≥ 1s`, select a row, and
open its trace in Jaeger. The trace shows what ran inside `db.connection.held`.
`app_network_io_in_transaction_total` > 0 means outbound HTTP is happening inside a transaction.

## 3. Is the work itself slow? (row 3: Dependencies)

### 3a. SQL

`DB query p99 by query`: if one query name is slow, run `EXPLAIN (ANALYZE, BUFFERS)` on it
(`make psql`) and look for sequential scans, lock waits (`pg_locks`) or bloat.

### 3b. Payments provider

`Downstream latency` and `outcomes & retries`:
- Latency up, outcomes success: provider slow. With I/O inside a transaction, this alone
  exhausts the pool (see the postmortem).
- `http_error` / `timeout` up: provider failing. Check that retries are bounded
  (`downstream_retries_total` should stay ≤ 2 × requests).
- Retries ≈ 2× requests and the provider is overloaded: retry storm. Lower `DOWNSTREAM_RETRIES`, or shed load.

## 4. Is the process unhealthy? (row 4: Resources)

- Event loop lag p99 > 100ms sustained: CPU-bound or blocking code. Every route slows down, including `/health/live`.
- Heap rising across GCs: leak. A restart buys time; a heap snapshot finds it.
- CPU near 1 core: saturated single thread.

Spikes in lag that come **after** a pool queue has built up are usually the effect (a burst of timeouts being
serialized at once), not the cause. Check the order of events.

## 5. Mitigations (pick by cause)

| Cause | Immediate | Then |
|---|---|---|
| I/O inside a transaction + slow provider | `make fix` / `PUT /admin/strategy {"strategy":"release"}` | Postmortem; the code change; the guard and alerts. |
| Provider slow / failing, pool fine | Shorter provider timeout; disable non-critical calls | Talk to the provider; circuit breaker. |
| Slow query | Kill runaway queries (`pg_cancel_backend`); add the index (`CREATE INDEX CONCURRENTLY`) | Query review. |
| Traffic spike beyond capacity | Scale out, **checking `replicas × pool_max < max_connections`**; rate limit | Capacity plan (Little's law, PREVENTION.md). |
| Memory leak | Rolling restart | Heap snapshot, fix. |

**Do not** raise `DB_POOL_MAX` as the first move. If connections are held across I/O, a
bigger pool shifts the queue to Postgres (`max_connections`), holds more open snapshots and
locks, and fails again at the next latency step. Only raise it once hold time ≈ query time.

## 6. After

- Confirm recovery on the same panels that showed the problem: error rate back to 0, pool
  waiting at 0, no `idle in transaction`.
- Write the timeline while it's fresh (the console's incident timeline helps).
- Blameless postmortem within 48h ([template: POSTMORTEM.md](POSTMORTEM.md)).

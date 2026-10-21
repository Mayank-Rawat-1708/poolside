# Prevention and detection

## 1. Capacity math (Little's law)

Little's law: **average items in a system = arrival rate × average time in the system**.
Applied to a connection pool:

```
connections in use = (checkouts per second) × (average hold time per checkout)
```

For this service, with `POST /orders` at 70% of traffic and reads/health at 30%:

| | `hold` | `release` |
|---|---|---|
| Hold time per order | provider latency + ~5 ms SQL ≈ **1.5 s** (slow provider) | 2 checkouts × ~3 ms ≈ **0.006 s** |
| Orders/s one pool of 10 can sustain | 10 / 1.5 ≈ **6.7** | 10 / 0.006 ≈ **1,600** (other limits hit first) |
| Connections needed at 40 rps (28 orders/s) | 28 × 1.5 ≈ **42**, so callers queue | 28 × 0.006 ≈ **0.2** |
| At 5 rps baseline, provider 50 ms | 3.5 × 0.055 ≈ 0.2 | ≈ 0.02 |

This explains why the failure is "intermittent": at normal provider latency even `hold`
needs well under one connection, so everything looks fine. The service sits close to a
cliff, and the cliff edge moves with **someone else's** latency. A provider slowdown from
50 ms to 1.5 s cuts capacity by 30×.

**Why "just raise the pool size" is not the fix.** At 1.5 s you would need ~42
connections per replica just for today's peak. Each extra connection is a Postgres backend
(≈ 5–10 MB, plus lock-table and snapshot overhead), and `max_connections` is shared by
every replica (100 by default). Three replicas × 50 connections already exceeds it.
Capacity would still scale with provider latency, so a 3 s day halves it again. Meanwhile
every held transaction is an open snapshot that holds back vacuum, and any row locks it
holds block other writers for the duration of an HTTP call. Raising the pool size only
treats the symptom. The fix makes hold time independent of the network.

For sizing, use measured values and keep headroom:

```
pool_max ≥ peak_checkouts_per_sec × p99_hold_seconds × 1.5
replicas × pool_max (+ ops pools, migrations, humans) < max_connections × 0.8
```

## 2. Alerts (Prometheus rules)

Thresholds assume `DB_POOL_MAX=10` and a 1 s acquire timeout. Tune them from a baseline.

```yaml
groups:
  - name: poolside-saturation
    rules:
      # Warning: sustained high utilization (headroom is gone before errors start).
      - alert: DbPoolHighUtilization
        expr: (db_pool_total - db_pool_idle) / db_pool_max > 0.8
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "DB pool >80% in use for 5m on {{ $labels.instance }}"

      # Page: callers are queueing for connections.
      - alert: DbPoolAcquireWaitHigh
        expr: |
          histogram_quantile(0.99, sum by (le, instance) (rate(db_pool_acquire_wait_seconds_bucket[5m]))) > 0.1
        for: 5m
        labels: { severity: page }
        annotations:
          summary: "p99 wait for a DB connection > 100ms"

      # Page: requests are being rejected because no connection was free.
      - alert: DbPoolAcquireTimeouts
        expr: sum by (instance) (rate(db_pool_acquire_wait_seconds_count{outcome="timeout"}[5m])) > 0.1
        for: 2m
        labels: { severity: page }

      # Ticket: connections are held far longer than the SQL they run, which is the
      # signature of I/O inside a transaction. Fires before load makes it an incident.
      - alert: DbConnectionsHeldNotQuerying
        expr: |
          histogram_quantile(0.99, sum by (le) (rate(db_pool_connection_hold_seconds_bucket[15m])))
            /
          histogram_quantile(0.99, sum by (le) (rate(db_query_duration_seconds_bucket[15m]))) > 20
        for: 15m
        labels: { severity: ticket }

      - alert: PostgresIdleInTransaction
        expr: sum(pg_stat_activity_count{datname="poolside", state="idle in transaction"}) > 5
        for: 2m
        labels: { severity: warning }

  - name: poolside-slo
    # SLO: 99.5% of requests succeed (non-5xx) over 30 days, an error budget of 0.5%.
    # Multi-window, multi-burn-rate alerts (Google SRE workbook, ch. 5).
    rules:
      - record: job:http_errors:ratio_rate5m
        expr: sum(rate(http_request_duration_seconds_count{status=~"5.."}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))
      - record: job:http_errors:ratio_rate1h
        expr: sum(rate(http_request_duration_seconds_count{status=~"5.."}[1h])) / sum(rate(http_request_duration_seconds_count[1h]))
      - record: job:http_errors:ratio_rate30m
        expr: sum(rate(http_request_duration_seconds_count{status=~"5.."}[30m])) / sum(rate(http_request_duration_seconds_count[30m]))
      - record: job:http_errors:ratio_rate6h
        expr: sum(rate(http_request_duration_seconds_count{status=~"5.."}[6h])) / sum(rate(http_request_duration_seconds_count[6h]))

      # Page: burning 2% of the monthly budget per hour (14.4x).
      - alert: ErrorBudgetFastBurn
        expr: job:http_errors:ratio_rate1h > (14.4 * 0.005) and job:http_errors:ratio_rate5m > (14.4 * 0.005)
        labels: { severity: page }
      # Ticket: 5% of the budget per 6h (6x).
      - alert: ErrorBudgetSlowBurn
        expr: job:http_errors:ratio_rate6h > (6 * 0.005) and job:http_errors:ratio_rate30m > (6 * 0.005)
        labels: { severity: ticket }

      # Latency SLO for orders: 99% under 1s.
      - alert: OrdersLatencySLO
        expr: |
          1 - (
            sum(rate(http_request_duration_seconds_bucket{route="/orders", method="POST", le="1"}[30m]))
            / sum(rate(http_request_duration_seconds_count{route="/orders", method="POST"}[30m]))
          ) > 0.01 * 6
        for: 10m
        labels: { severity: ticket }
```

The first three alerts are the ones that would have caught this incident. The burn-rate
alerts catch any cause of failure, including ones nobody anticipated.

## 3. Code review rule: no network I/O inside a transaction

**The rule:** between `BEGIN` and `COMMIT`/`ROLLBACK`, code may only talk to the database.
No HTTP, queues, caches, file uploads or sleeps. If two writes must agree with an external
side effect, record intent first (pending row / outbox), do the I/O outside the
transaction, then record the outcome. Make the external call idempotent.

Review checklist for any change touching a transaction:

- [ ] Is there an `await` on anything but the transaction's client between BEGIN and COMMIT?
- [ ] Does any function called inside the transaction (directly or transitively) do I/O?
- [ ] Is the external call idempotent (idempotency key) so it can be retried or reconciled?
- [ ] What happens if the process dies after the external call but before COMMIT?

**Making it mechanical.** A purely static lint rule can't see through function calls, so
use two layers:

1. **Structural.** All transactions go through a single helper, e.g.
   `db.transaction(async (tx) => { … })`, whose callback receives only a narrowed `Tx` type
   (`query` only). A cheap ESLint `no-restricted-syntax` rule can then ban raw
   `'BEGIN'` strings outside that helper, so every transaction is easy to find and review:

   ```js
   // eslint.config.js
   { rules: { 'no-restricted-syntax': ['error', {
       selector: "Literal[value=/^\\s*BEGIN\\b/i]",
       message: 'Open transactions via db.transaction(); never do network I/O inside one.' }] } }
   ```

2. **Runtime guard in tests and staging.** Count open transactions in the request context
   (`BEGIN` increments, `COMMIT`/`ROLLBACK` decrements). The outbound HTTP client then
   checks it on every call, logs a warning, increments a metric
   (`app_network_io_in_transaction_total`) and throws when `NODE_ENV=test`. Any test that
   exercises such a path fails, and production gets a metric that fires on the first
   occurrence rather than at saturation. This repo implements the guard
   (`apps/api/src/obs/tx-guard.ts`). It fires on every `hold` order.

## 4. Load testing in CI

Unit tests can't catch this. The code is correct, and it only fails under concurrency
plus dependency latency. Two layers:

- **Every PR:** the integration test (`apps/api/test/strategies.integration.test.ts`)
  runs both strategies against real Postgres with a 300 ms fake provider and asserts that
  `pool.waitingCount` stays 0. Cheap (~2 s) and deterministic.
- **Nightly / on demand:** the `load-test` job in `.github/workflows/ci.yml` brings up the
  stack with compose and runs `load/slow-downstream.js` (provider at 1.2 s ± 0.4 s,
  15 rps) against the default strategy. k6 thresholds (`http_req_failed < 1%`,
  per-endpoint p95) fail the job. It catches regressions that reintroduce I/O inside
  transactions, and also unrelated capacity regressions. Run it against a
  **pessimistic** dependency profile (latency well above normal), because that is where
  this class of bug lives.

## 5. Other defenses now in the code

| Defense | Effect |
|---|---|
| `DB_ACQUIRE_TIMEOUT_MS=1000` + typed `PoolAcquireTimeoutError` → 503 + `Retry-After` | Exhaustion fails fast and is labelled as overload, not a generic 500; the queue can't grow without bound. |
| Downstream timeout (3 s per attempt) + ≤ 2 jittered retries | A hung provider can't hold requests forever; transient failures are absorbed without synchronized retry waves. |
| `idle_in_transaction_session_timeout = 10s` | Postgres reclaims a stuck transaction even if application code never returns. |
| Separate ops pool for readiness/admin | Health and diagnostics keep working during exhaustion. |
| Error listener on checked-out clients | A server-side connection kill fails one request instead of crashing the process. |

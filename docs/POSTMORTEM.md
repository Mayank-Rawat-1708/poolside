# Postmortem: Order API failing under load when the payments provider slows down

Blameless format. "We" is the team. The design that caused this was a reasonable
first implementation that was never tested against a slow dependency.

## Summary

When the payments provider's latency rose from ~50 ms to ~1.5 s during a traffic spike, the
order API failed about two thirds of all requests. That included order lookups and health
checks, which never call the provider. Each order held a database connection inside an
open transaction for the full duration of the HTTP call to the provider, so a 10-connection
pool was exhausted and every route queued behind it. We moved the provider call outside
the transaction (`TX_STRATEGY=release`). Under the same conditions, errors went to 0%.

## Impact (reproduced scenario, `docs/evidence/`)

| | Spike, provider 1.5 s ± 0.5 s | Steady 15 rps, provider 1.2 s ± 0.4 s |
|---|---|---|
| Failed requests | 66.3% (1,257 of 1,897) | 20.5% (185 of 902) |
| Reads / health affected | yes: 69% / 73% failed, p95 ≈ 1 s | yes: p95 ≈ 1 s |
| Successful throughput | 8.8 req/s for 26 req/s offered | 11.5 req/s for 15 offered |
| Data integrity | none lost: failed orders were rolled back (never committed) | same |

Customers saw failed checkouts and order pages that wouldn't load. Before the
instrumentation work, the API answered every failure with an identical opaque
`500 internal_error`.

## Timeline (reproduction)

| | |
|---|---|
| Provider latency rises (`make break`) | no visible effect at low traffic |
| Traffic ramps from 10 to 40 rps | once orders/s × provider latency passes 10, the pool pins at 10/10 and callers queue (40 waiting at the peak) |
| Shortly after | queued requests start failing at the 1 s acquire timeout; reads and `/health` fail too |
| Investigation | hypotheses (DB down, slow query, saturated process, provider errors) refuted in turn; pool exhaustion with connections held `idle in transaction` across the provider call confirmed ([INVESTIGATION.md](INVESTIGATION.md)) |
| `make fix` (runtime toggle, no restart) | new orders stop holding connections; the queue drains and errors stop (observed live in the console run); a full re-run under the same spike shows 0% errors and reads at ~10 ms |

## Root cause

```ts
// strategies/hold.ts (original)
const client = await db.acquire();
await client.query('BEGIN');
const pending = await insertPendingOrder(client, …);
const { paymentRef } = await payments.charge(pending.id, amountCents);  // HTTP inside the transaction
await markOrder(client, pending.id, 'paid', paymentRef);
await client.query('COMMIT');
client.release();
```

Pool demand = orders/s × hold time, and hold time ≈ provider latency. With 10 connections
and a 1.5 s provider, capacity is ≈ 6.7 orders/s. The spike offered ≈ 28.

## Trigger vs underlying cause

- **Trigger:** the provider became slow (1.5 s ± 0.5 s) at the same time as a traffic spike.
  Neither is unusual or under our control.
- **Underlying cause:** our capacity was a function of someone else's latency, because we
  held a scarce shared resource (a DB connection inside an open transaction) during network
  I/O. That turned a slow dependency into a full outage, including routes that never use
  the dependency.
- **Contributing factors:**
  - One shared pool for all routes and for the health check, so the blast radius was everything.
  - No acquire timeout tuned for overload, and failures surfaced as opaque 500s.
  - pg's error text ("timeout exceeded when trying to connect") points at the network, not the pool.
  - No metric separated "waiting for a connection" from "running SQL".
  - Load tests only ran with a fast provider.

## The fix, and why it addresses the cause rather than the symptom

```ts
// strategies/release.ts
const pending = await db.withClient((c) => insertPendingOrder(c, …));        // short checkout
const { paymentRef } = await payments.chargeWithRetry(pending.id, amount);  // no connection held
return db.withClient((c) => markOrder(c, pending.id, 'paid', paymentRef));  // short checkout
```

Hold time per order drops from ~1.5 s to two checkouts of a few milliseconds. Pool demand
no longer depends on provider latency at all: at the same spike, peak pool usage was 1 of
10 with 0 waiting, and connection hold p99 equalled query p99.

Correctness trade-off: the order and the charge are no longer one atomic transaction.
`pending` becomes a real, visible state. Charges carry `Idempotency-Key = order id`, so a
retried or reconciled charge returns the original result instead of charging twice. A
provider failure marks the order `failed`. A crash between the charge and the final UPDATE
leaves a `pending` row. A reconciler that re-queries the provider by idempotency key would
resolve it; it is **not built** (see Known limitations in the README).

**Why not just raise the pool size?** At 1.5 s you'd need ~42 connections per replica for
this spike, and twice that on a 3 s day. Postgres `max_connections` (100 by default) is
shared by all replicas. Every connection is a backend process with memory, and every held
transaction is an open snapshot (holding back vacuum) and a set of locks held during a
network call. A bigger pool moves the queue into Postgres and delays the failure to the
next latency step. It treats the symptom (not enough connections) instead of the cause
(connections held while doing something other than database work).

## Defense in depth (also shipped)

| Change | What it prevents |
|---|---|
| `DB_ACQUIRE_TIMEOUT_MS=1000`, typed `PoolAcquireTimeoutError` → `503` + `Retry-After` | Unbounded queueing; overload mistaken for a bug or a DB outage. |
| Downstream timeout (AbortController, 3 s per attempt) + ≤ 2 retries with full-jitter backoff (release only) | A hung provider holding requests forever; synchronized retry waves. Retries are safe because of the idempotency key, and confined to the path that holds nothing scarce. |
| `idle_in_transaction_session_timeout = 10s` | Any future code path that leaves a transaction open: Postgres reclaims the session. |
| Error listener on every checked-out client | Testing the previous item revealed that a server-killed connection crashed the process (unhandled `'error'` event). Now it fails one request. |
| Readiness on a separate 2-connection ops pool | Health checks going blind (or getting healthy instances killed) during pool exhaustion. |
| `app_network_io_in_transaction_total` + `TX_IO_GUARD=throw` | Reintroducing I/O inside a transaction: counted in production, fatal in tests/staging. |

## Detection: what would have caught it

See [PREVENTION.md](PREVENTION.md) for the rules. In short: pool utilization > 80% for 5m,
acquire-wait p99 > 100 ms, acquire timeouts > 0, connection hold ≫ query time, any
`idle in transaction` build-up, and SLO burn-rate alerts as the cause-agnostic backstop.

## Action items

| Action | Status |
|---|---|
| Move the provider call out of the transaction (`release`) | Done |
| Fail fast on pool exhaustion with a typed 503 | Done |
| Timeouts and bounded retries on the provider call | Done |
| `idle_in_transaction_session_timeout` safety net; guard checked-out clients | Done |
| Separate liveness/readiness; readiness off the main pool | Done |
| Pool, acquire, hold-time, query and downstream metrics; traces; dashboard | Done |
| Runtime guard + metric for network I/O inside transactions | Done |
| Integration test asserting release waits stay far below provider latency; nightly load test with a slow provider | Done |
| Reconciler for orders stuck in `pending` | Open |
| Overall request deadline (propagated budget) and circuit breaker for the provider | Open |
| Deploy the alert rules (Alertmanager) | Open |

## What went well / what didn't

- **Well:** once pool wait and SQL time were measured separately, the cause was visible in one
  dashboard row. `pg_stat_activity` and a single trace each confirmed it independently.
- **Didn't:** the original error handling and the pg error text actively misled. The health
  check shared the failing resource. The load tests assumed a healthy dependency.

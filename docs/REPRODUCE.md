# Reproducing the failure

Requirements: Docker with Compose v2 and `make`. Node 20+ is only needed for tests and the
evidence/screenshot scripts. k6 runs in a container, so no local install is needed.

## Three commands

```bash
make up                         # build and start everything (~1–2 min the first time)
make break && make load-spike   # slow the payments provider, then send a traffic spike
make fix && make load-spike     # switch POST /orders to TX_STRATEGY=release, same load
```

`make reset` puts everything back: provider at 50 ms ± 20 ms and `TX_STRATEGY=hold`.

## Step by step, with what you should see

1. **`make up`**, then open the console (http://localhost:8080) and Grafana
   (http://localhost:3001). After ~30s the API reports healthy.
2. **`make load-baseline`** (5 rps, 30 s, provider at 50 ms). Everything passes: 0% errors,
   p95 ≈ 90 ms (`docs/evidence/runs/hold/baseline.txt`).
3. **`make break`** sets the provider to 1500 ms ± 500 ms. Nothing changes yet, because
   there is no load.
4. **`make load-spike`** (10 → 40 rps over 70 s; 70% `POST /orders`, 20% `GET /orders/:id`,
   10% `GET /health`). Expected:
   - k6 reports roughly **two thirds of requests failing**, including `GET /orders/:id` and
     `/health`, which never call the provider (recorded run: 66.3% overall; 64% / 69% / 73%
     for orders / reads / health).
   - Failed requests take ≈ 1 s (the pool acquire timeout). Successful orders take 1.5–3 s.
   - Console status **Failing**. Pool in use 10/10, pool waiting ~40, Postgres sessions
     panel shows 10 × `idle in transaction`.
   - `make pg-activity` during the spike lists 10 sessions `idle in transaction` whose last
     statement is the `INSERT INTO orders …`.
   - The same symptoms at a modest *steady* rate: `make load-slow` (15 rps, provider
     1.2 s ± 0.4 s), with ~20% errors.
5. **`make fix`** flips the strategy at runtime (no restart). Run `make load-spike` again:
   0% errors, reads/health p95 ≈ 10 ms, pool waiting 0, no `idle in transaction`. Order p95
   stays ≈ 2 s because the provider is still slow.

It also reproduces with a fast provider and enough concurrency: in the console, keep
`hold`, set latency to Normal, and start the load generator with 20 workers. The pool
reaches 10/10 with callers waiting. Hold time is short, but at ~150 req/s it adds up.

Full scenario matrix with real numbers: `make evidence` (~13 min) writes
`docs/evidence/runs/` and `docs/evidence/before-after.md`.

## What the API response looks like (deliberately unhelpful)

On the **original** build (`git checkout 59fb383`, before any instrumentation), every
failure looked like this. There was no request id, no detail, and the same body for every
route (`docs/evidence/00-naive/`):

```
HTTP/1.1 500 Internal Server Error
content-type: application/json; charset=utf-8

{"error":"internal_error"}
```

The only server-side clue was one log line, which points at the network rather than the pool:

```
"err":{"type":"Error","message":"timeout exceeded when trying to connect", … pg-pool/index.js …}
```

On the **current** build the fail-fast defense types the error. Recorded during an incident
(`docs/evidence/responses-during-incident.txt`):

```
$ curl -si -XPOST localhost:3000/orders -H "content-type: application/json" -d '{"customerId":"c1","amountCents":1299}'
HTTP/1.1 503 Service Unavailable
x-request-id: 670a4213-ee40-4c6f-bc9c-781bdad91285
retry-after: 1

{"error":"service_unavailable","code":"POOL_ACQUIRE_TIMEOUT"}

$ curl -si localhost:3000/orders/<id>          # a read that never calls the provider
HTTP/1.1 503 Service Unavailable
{"error":"service_unavailable","code":"POOL_ACQUIRE_TIMEOUT"}

$ curl -si localhost:3000/health/ready         # separate ops pool: still answers
HTTP/1.1 200 OK
{"status":"ok","pool":{"total":10,"idle":0,"waiting":39,"max":10}}
```

That says *what* ran out (connections) but not *why*: the database is reachable, the SQL
is fast, and nothing in the response mentions the payments provider. Finding the why is
[INVESTIGATION.md](INVESTIGATION.md).

## Knobs

| Variable (`.env`) | Default | Effect |
|---|---|---|
| `DB_POOL_MAX` | 10 | Main pool size. |
| `TX_STRATEGY` | `hold` | Boot value; `PUT /admin/strategy` / `make fix` / `make hold` change it at runtime. |
| `DB_ACQUIRE_TIMEOUT_MS` | 1000 | Max wait for a connection before a 503. |
| `DB_IDLE_IN_TX_TIMEOUT_MS` | 10000 | Postgres terminates sessions idle in a transaction this long. |
| `DOWNSTREAM_TIMEOUT_MS` / `DOWNSTREAM_RETRIES` | 3000 / 2 | Per-attempt timeout and retries (release only). |
| `TX_IO_GUARD` | `warn` | `throw` makes network I/O inside a transaction an error. |
| `BREAK_LATENCY_MS` / `BREAK_JITTER_MS` (make) | 1500 / 500 | What `make break` sets. |

Runtime provider control: `PUT http://localhost:4001/admin/latency {"latencyMs":…, "jitterMs":…, "errorRate":0..1}`
with `Authorization: Bearer $ADMIN_TOKEN`, or the console's Scenario panel.

# Demo script (3–5 minutes)

Setup before recording: `make up`, wait ~30s, `make reset`. Open three windows side by side:
console (http://localhost:8080), Grafana Service Overview (http://localhost:3001), and a
terminal in the repo. Close other heavy apps. Keep the laptop **plugged in**.

| # | Time | Show | Say (roughly) |
|---|---|---|---|
| 1 | 0:00–0:20 | README architecture diagram | "An order API in Fastify, with Postgres behind a 10-connection pool and a payments provider it calls on every order. Prometheus, Grafana and Jaeger for observability, plus a small operator console." |
| 2 | 0:20–0:40 | Console, then `make load-baseline` | "Under light load everything is healthy: p95 around 100 ms, 0% errors, pool barely used." |
| 3 | 0:40–1:10 | `make break && make load-spike` in the terminal; console turns **Failing** | "The provider gets slow, which is outside our control, and traffic spikes. Two thirds of requests fail…" |
| 4 | 1:10–1:30 | `docs/evidence/00-naive/` (the original build answered `500 {"error":"internal_error"}`), then a k6 line showing `GET /orders/:id` failing | "On the original build the response told you nothing. Today it's a typed 503 `POOL_ACQUIRE_TIMEOUT`, which says *what* is exhausted but not *why*. And reads and `/health`, which never call the provider, fail too. That's the confusing part." |
| 5 | 1:30–2:10 | Grafana top to bottom | "Ruling things out: CPU, event loop and heap are flat (row 4). SQL p99 is milliseconds (row 3). The provider is slow but returns 200s, and API latency is higher than provider latency, so requests wait somewhere else. Row 2 shows where: pool pinned at 10, 40 callers waiting, acquire wait ≈ hold time ≈ provider latency." |
| 6 | 2:10–2:40 | Console: Postgres sessions panel (10 × `idle in transaction`), then `make pg-activity` | "From the database's side: every connection is idle **inside a transaction**, and the last statement was an INSERT a second ago. We're holding transactions open while doing something else." |
| 7 | 2:40–3:05 | Console request explorer: filter ≥ 1s, select a row, open the trace in Jaeger | "The trace shows what that something is: `db.connection.held` contains the whole `downstream.charge`. We hold a DB connection across an HTTP call." |
| 8 | 3:05–3:30 | `git show <fix commit> -- apps/api/src/orders/strategies/release.ts` (or split diff hold.ts vs release.ts) | "The fix: write the order as pending, release the connection, call the provider, write the outcome. The pending state plus an idempotency key keeps it correct." |
| 9 | 3:30–4:00 | `make fix` with the spike still running; console goes back to Healthy/Degraded, errors at 0, pool ~0, timeline shows the toggle | "Same load, same slow provider: 0% errors, reads back to ~15 ms. p95 now just follows the provider, which is honest." |
| 10 | 4:00–4:30 | README before/after table, then PREVENTION.md alert list | "Real numbers from k6. Then defense in depth: fail-fast 503s, timeouts and bounded retries, `idle_in_transaction_session_timeout`, a runtime guard that flags network I/O inside a transaction, and the alerts that would have paged us before customers noticed." |
| 11 | 4:30–4:45 | — | "And why not just raise the pool size: capacity would still scale with someone else's latency. Details in the postmortem." |

Fallbacks: if Grafana is slow to render, use the console charts (same PromQL). If k6
output scrolls too fast, show `docs/evidence/runs/hold/spike.txt`.

# First run against the naive service

Captured on 2026-10-21 at commit "feat(api): POST/GET /orders with transactional
order+payment flow", before any instrumentation existed. These are raw k6 outputs.

| File | Conditions |
|---|---|
| `baseline.txt` | downstream 50ms ± 20ms, 5 rps for 30s |
| `spike-slow-downstream.{txt,json}` | `make break` (downstream 1500ms ± 500ms), then `make load-spike` (10 → 40 rps) |

What the client saw: 64% of requests failed with `500 {"error":"internal_error"}`.
That includes `GET /orders/:id` and `GET /health`, which never call the provider.
The only server-side clue was a log line: `timeout exceeded when trying to connect`.

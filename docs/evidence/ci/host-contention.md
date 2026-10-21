# Host contention on the laptop (2026-10-21, ~14:22–14:24 UTC)

After the laptop woke from sleep, a `make load-slow` run in `release` mode showed slow reads
(`GET /orders/:id` p95 718 ms) although the code was unchanged. Prometheus recorded:

| Query | Value |
|---|---|
| `max_over_time(nodejs_eventloop_lag_p99_seconds{job="api"}[1m])`, peak | **1.933 s** at 14:23:44 UTC |
| `max_over_time(db_pool_waiting[90s])` | 32 |
| acquire wait p99 / query p99 (90 s) | 0.311 s / 0.306 s |
| API CPU, max | 0.53 cores |

Host at the same time: load average ≈ 10 on 8 cores; top processes `kernel_task` 69%,
`fileproviderd` 57% (iCloud), Chrome helpers, `bird` (iCloud) 43%; on battery.

Interpretation: the API used half a core yet its event loop stalled for ~2 s, so the
VM was starved by the host, not by the app. The same scenario on GitHub Actions
(`github-actions-excerpts.md`, run 39617721171) gave reads p95 2.06 ms. That run is not
used as evidence for anything else; the recorded evidence in `../runs/` was captured on an
otherwise idle machine.

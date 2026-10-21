| Scenario | Strategy | Requests | p95 | p99 | Error rate | Successful req/s | GET /orders/:id p95 | /health p95 | 500 / 503 / timeout |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline: 5 rps, provider 50ms | `hold` | 151 | 91 ms | 109 ms | 0.0% | 5.0 | 13 ms | 14 ms | 0 / 0 / 0 |
| baseline: 5 rps, provider 50ms | `release` | 150 | 89 ms | 96 ms | 0.0% | 5.0 | 8 ms | 9 ms | 0 / 0 / 0 |
| spike: 10→40 rps, provider 1.5s ± 0.5s | `hold` | 1897 | 2.69 s | 2.91 s | 66.3% | 8.8 | 1.01 s | 1.01 s | 0 / 1257 / 0 |
| spike: 10→40 rps, provider 1.5s ± 0.5s | `release` | 1897 | 1.93 s | 1.99 s | 0.0% | 26.7 | 9 ms | 10 ms | 0 / 0 / 0 |
| steady 15 rps, provider 1.2s ± 0.4s | `hold` | 902 | 2.42 s | 2.55 s | 20.5% | 11.5 | 1.01 s | 1.01 s | 0 / 185 / 0 |
| steady 15 rps, provider 1.2s ± 0.4s | `release` | 902 | 1.56 s | 1.60 s | 0.0% | 14.7 | 7 ms | 6 ms | 0 / 0 / 0 |

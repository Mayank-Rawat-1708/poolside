| Scenario | Strategy | Requests | p95 | p99 | Error rate | Successful req/s | GET /orders/:id p95 | /health p95 | 500 / 503 / timeout |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline: 5 rps, provider 50ms | `hold` | 150 | 94 ms | 103 ms | 0.0% | 5.0 | 44 ms | 8 ms | 0 / 0 / 0 |
| baseline: 5 rps, provider 50ms | `release` | 151 | 90 ms | 102 ms | 0.0% | 5.0 | 12 ms | 23 ms | 0 / 0 / 0 |
| spike: 10→40 rps, provider 1.5s ± 0.5s | `hold` | 1886 | 2.74 s | 2.99 s | 65.7% | 9.0 | 1.10 s | 1.02 s | 0 / 1239 / 0 |
| spike: 10→40 rps, provider 1.5s ± 0.5s | `release` | 1829 | 2.61 s | 3.88 s | 0.1% | 25.6 | 144 ms | 220 ms | 0 / 2 / 0 |
| steady 15 rps, provider 1.2s ± 0.4s | `hold` | 903 | 2.41 s | 2.54 s | 22.3% | 11.2 | 1.01 s | 1.01 s | 0 / 201 / 0 |
| steady 15 rps, provider 1.2s ± 0.4s | `release` | 902 | 1.56 s | 1.60 s | 0.0% | 14.7 | 6 ms | 8 ms | 0 / 0 / 0 |

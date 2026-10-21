import { describe, expect, it } from 'vitest';
import { RecentRequests, type RequestRecord } from '../src/obs/recent-requests.js';

const record = (n: number): RequestRecord => ({
  requestId: `r${n}`,
  traceId: undefined,
  method: 'GET',
  route: '/orders/:id',
  status: 200,
  durationMs: n,
  timings: { acquireMs: 0, queryMs: 0, downstreamMs: 0 },
  errorClass: undefined,
  finishedAt: new Date(0).toISOString(),
});

describe('RecentRequests', () => {
  it('returns newest first, up to limit', () => {
    const recent = new RecentRequests(10);
    [1, 2, 3].forEach((n) => recent.push(record(n)));
    expect(recent.latest(2).map((r) => r.requestId)).toEqual(['r3', 'r2']);
  });

  it('drops the oldest beyond capacity', () => {
    const recent = new RecentRequests(3);
    [1, 2, 3, 4, 5].forEach((n) => recent.push(record(n)));
    expect(recent.latest(10).map((r) => r.requestId)).toEqual(['r5', 'r4', 'r3']);
  });
});

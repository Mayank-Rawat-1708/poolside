// Fixed-size in-memory log of the last N requests and where their time went.
// Feeds the console's request explorer; not a substitute for log storage.
import type { Timings } from './request-context.js';

export interface RequestRecord {
  requestId: string;
  traceId: string | undefined;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  timings: Timings;
  errorClass: string | undefined;
  finishedAt: string;
}

export class RecentRequests {
  private readonly items: RequestRecord[] = [];

  constructor(private readonly capacity = 500) {}

  push(record: RequestRecord): void {
    this.items.push(record);
    if (this.items.length > this.capacity) this.items.shift();
  }

  // Newest first.
  latest(limit: number): RequestRecord[] {
    return this.items.slice(-limit).reverse();
  }
}

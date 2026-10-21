import { performance } from 'node:perf_hooks';
import { downstreamDuration, downstreamRequests } from '../obs/metrics.js';
import { addTiming, currentContext } from '../obs/request-context.js';

export interface ChargeResult {
  paymentRef: string;
}

export class PaymentsClient {
  constructor(private readonly baseUrl: string) {}

  async charge(orderId: string, amountCents: number): Promise<ChargeResult> {
    const start = performance.now();
    let outcome = 'network_error';
    try {
      const res = await fetch(`${this.baseUrl}/charge`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Lets the provider's logs be joined with ours.
          'x-request-id': currentContext()?.requestId ?? '',
        },
        body: JSON.stringify({ orderId, amountCents }),
      });
      outcome = res.ok ? 'success' : 'http_error';
      if (!res.ok) throw new Error(`payments responded ${res.status}`);
      return (await res.json()) as ChargeResult;
    } finally {
      const ms = performance.now() - start;
      downstreamDuration.labels(outcome).observe(ms / 1000);
      downstreamRequests.labels(outcome).inc();
      addTiming('downstreamMs', ms);
    }
  }
}

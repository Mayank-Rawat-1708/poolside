import { performance } from 'node:perf_hooks';
import { downstreamDuration, downstreamRequests } from '../obs/metrics.js';
import { addTiming, currentContext } from '../obs/request-context.js';
import { inSpan } from '../obs/spans.js';

export interface ChargeResult {
  paymentRef: string;
}

export class PaymentsClient {
  constructor(private readonly baseUrl: string) {}

  charge(orderId: string, amountCents: number): Promise<ChargeResult> {
    return inSpan('downstream.charge', { 'order.id': orderId }, () => this.attempt(orderId, amountCents));
  }

  private async attempt(orderId: string, amountCents: number): Promise<ChargeResult> {
    const start = performance.now();
    let outcome = 'network_error';
    try {
      const res = await fetch(`${this.baseUrl}/charge`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // The provider dedupes on this, so a repeated charge for the same order is safe.
          'idempotency-key': orderId,
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

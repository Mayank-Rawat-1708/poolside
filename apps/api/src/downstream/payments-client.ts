import { performance } from 'node:perf_hooks';
import { trace } from '@opentelemetry/api';
import { DownstreamError } from '../errors.js';
import { downstreamDuration, downstreamRequests, downstreamRetries } from '../obs/metrics.js';
import { addTiming, currentContext } from '../obs/request-context.js';
import { inSpan } from '../obs/spans.js';
import { retry } from './retry.js';

export interface ChargeResult {
  paymentRef: string;
}

export interface ChargePolicy {
  timeoutMs: number; // per attempt
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export class PaymentsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly policy: ChargePolicy,
  ) {}

  // Original behaviour: one attempt, no timeout. Used by TX_STRATEGY=hold.
  charge(orderId: string, amountCents: number): Promise<ChargeResult> {
    return inSpan('downstream.charge', { 'order.id': orderId }, () => this.attempt(orderId, amountCents));
  }

  // Each attempt has its own timeout; failures that may be transient are
  // retried a bounded number of times. Safe because the provider dedupes on
  // the idempotency key. Used by TX_STRATEGY=release.
  chargeWithRetry(orderId: string, amountCents: number): Promise<ChargeResult> {
    const { timeoutMs, retries, baseDelayMs, maxDelayMs } = this.policy;
    return inSpan('downstream.charge', { 'order.id': orderId }, () =>
      retry(() => this.attempt(orderId, amountCents, timeoutMs), {
        retries,
        baseDelayMs,
        maxDelayMs,
        shouldRetry: (err) => err instanceof DownstreamError && err.retryable,
        onRetry: ({ attempt, delayMs, err }) => {
          const reason = err instanceof DownstreamError ? err.failure : 'unknown';
          downstreamRetries.labels(reason).inc();
          trace.getActiveSpan()?.addEvent('retry', { attempt, delayMs, reason });
        },
      }),
    );
  }

  private async attempt(orderId: string, amountCents: number, timeoutMs?: number): Promise<ChargeResult> {
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    const start = performance.now();
    let outcome: 'success' | DownstreamError['failure'] = 'network_error';
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
        signal: controller.signal,
      });
      if (!res.ok) {
        outcome = 'http_error';
        throw new DownstreamError('http_error', res.status);
      }
      const body = (await res.json()) as ChargeResult;
      outcome = 'success';
      return body;
    } catch (err) {
      if (err instanceof DownstreamError) throw err;
      outcome = controller.signal.aborted ? 'timeout' : 'network_error';
      throw new DownstreamError(outcome, undefined, { cause: err });
    } finally {
      clearTimeout(timer);
      const ms = performance.now() - start;
      downstreamDuration.labels(outcome).observe(ms / 1000);
      downstreamRequests.labels(outcome).inc();
      addTiming('downstreamMs', ms);
    }
  }
}

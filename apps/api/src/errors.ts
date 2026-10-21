// Errors the API knows how to answer. Anything else is a 500.
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  abstract readonly publicError: string;
  override readonly name = this.constructor.name;
}

// The pool had no free connection within DB_ACQUIRE_TIMEOUT_MS.
// 503 + Retry-After tells clients and load balancers this is load, not a bug.
export class PoolAcquireTimeoutError extends AppError {
  readonly statusCode = 503;
  readonly code = 'POOL_ACQUIRE_TIMEOUT';
  readonly publicError = 'service_unavailable';

  constructor(
    readonly waitedMs: number,
    readonly pool: { total: number; idle: number; waiting: number },
    options?: ErrorOptions,
  ) {
    super(`no pool connection within ${Math.round(waitedMs)}ms`, options);
  }
}

export type DownstreamFailure = 'timeout' | 'http_error' | 'network_error';

// The payments provider failed, timed out or was unreachable.
export class DownstreamError extends AppError {
  readonly statusCode = 502;
  readonly code = 'PAYMENTS_UNAVAILABLE';
  readonly publicError = 'bad_gateway';

  constructor(
    readonly failure: DownstreamFailure,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(`payments ${failure}${status ? ` (${status})` : ''}`, options);
  }

  // 5xx, 429, timeouts and network errors may succeed on retry; other 4xx won't.
  get retryable(): boolean {
    if (this.failure !== 'http_error') return true;
    return this.status === 429 || (this.status ?? 0) >= 500;
  }
}

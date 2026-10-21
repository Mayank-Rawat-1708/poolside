// Errors the API knows how to answer. Anything else is a 500.
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  override readonly name = this.constructor.name;
}

// The pool had no free connection within DB_ACQUIRE_TIMEOUT_MS.
// 503 + Retry-After tells clients and load balancers this is load, not a bug.
export class PoolAcquireTimeoutError extends AppError {
  readonly statusCode = 503;
  readonly code = 'POOL_ACQUIRE_TIMEOUT';

  constructor(
    readonly waitedMs: number,
    readonly pool: { total: number; idle: number; waiting: number },
    options?: ErrorOptions,
  ) {
    super(`no pool connection within ${Math.round(waitedMs)}ms`, options);
  }
}

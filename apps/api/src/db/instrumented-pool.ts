// Every DB access goes through here so we can tell apart the three ways
// a "slow database call" can actually be slow:
//   1. waiting for a free connection  (db_pool_acquire_wait_seconds)
//   2. the SQL itself                 (db_query_duration_seconds)
//   3. holding a connection too long  (db_pool_connection_hold_seconds)
// pool.query() is deliberately not used: it acquires implicitly, which
// would fold pool wait into "query time" and hide exactly that difference.
import type pg from 'pg';
import { performance } from 'node:perf_hooks';
import type { Span } from '@opentelemetry/api';
import { PoolAcquireTimeoutError } from '../errors.js';
import { addTiming, currentContext } from '../obs/request-context.js';
import { inSpan, tracer } from '../obs/spans.js';
import {
  dbClientErrors,
  dbConnectionHold,
  dbPoolAcquireWait,
  dbQueryDuration,
  registerPoolGauges,
} from '../obs/metrics.js';

export type Queryable = Pick<pg.PoolClient, 'query'>;

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
  max: number;
}

export class InstrumentedPool {
  private readonly acquiredAt = new WeakMap<pg.PoolClient, number>();
  // Spans covering the whole checkout, so traces show what ran while a connection was held.
  private readonly heldSpans = new WeakMap<pg.PoolClient, Span>();
  private readonly guarded = new WeakSet<pg.PoolClient>();

  constructor(readonly pool: pg.Pool) {
    registerPoolGauges(() => this.stats());
    // pg emits these around every checkout, including ones we don't make ourselves.
    pool.on('acquire', (client) => this.acquiredAt.set(client, performance.now()));
    pool.on('release', (_err, client) => {
      const start = this.acquiredAt.get(client);
      if (start !== undefined) dbConnectionHold.observe((performance.now() - start) / 1000);
      this.heldSpans.get(client)?.end();
      this.heldSpans.delete(client);
    });
  }

  stats(): PoolStats {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
      max: this.pool.options.max ?? 10,
    };
  }

  async acquire(): Promise<pg.PoolClient> {
    const before = this.stats();
    const start = performance.now();
    let outcome = 'ok';
    try {
      const client = await inSpan(
        'db.pool.acquire',
        { 'db.pool.waiting': before.waiting, 'db.pool.idle': before.idle, 'db.pool.total': before.total },
        () => this.pool.connect(),
      );
      this.heldSpans.set(client, tracer.startSpan('db.connection.held'));
      this.guard(client);
      return client;
    } catch (err) {
      // Turn pg's untyped pool timeouts into a typed error so they can't be
      // mistaken for a DB outage or a bug.
      if (isPoolTimeout(err)) {
        outcome = 'timeout';
        throw new PoolAcquireTimeoutError(performance.now() - start, this.stats(), { cause: err });
      }
      outcome = 'error';
      throw err;
    } finally {
      const ms = performance.now() - start;
      dbPoolAcquireWait.labels(outcome).observe(ms / 1000);
      addTiming('acquireMs', ms);
    }
  }

  // pg only listens for errors on *idle* clients. If the server kills a
  // checked-out connection (idle_in_transaction_session_timeout, failover,
  // pg_terminate_backend) the client emits 'error' with no listener and
  // Node exits. The pending query still rejects, so logging is enough here.
  private guard(client: pg.PoolClient) {
    if (this.guarded.has(client)) return;
    this.guarded.add(client);
    client.on('error', (err) => {
      dbClientErrors.labels((err as { code?: string }).code ?? 'unknown').inc();
      console.error(JSON.stringify({ level: 50, msg: 'checked-out pg client error', err: err.message }));
    });
  }

  // Acquire, run fn, always release.
  async withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.acquire();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
}

// `name` is a fixed label (e.g. "insert_order"), never raw SQL.
export async function timedQuery<R extends pg.QueryResultRow = pg.QueryResultRow>(
  db: Queryable,
  name: string,
  text: string,
  values?: unknown[],
): Promise<pg.QueryResult<R>> {
  const start = performance.now();
  try {
    const result = await db.query<R>(text, values);
    trackTransaction(name);
    return result;
  } catch (err) {
    if (name === 'rollback') trackTransaction(name);
    throw err;
  } finally {
    const ms = performance.now() - start;
    dbQueryDuration.labels(name).observe(ms / 1000);
    addTiming('queryMs', ms);
  }
}

// Open-transaction count for the request, used by obs/tx-guard.ts.
function trackTransaction(name: string) {
  const ctx = currentContext();
  if (!ctx) return;
  if (name === 'begin') ctx.openTransactions++;
  else if (name === 'commit' || name === 'rollback') ctx.openTransactions = Math.max(0, ctx.openTransactions - 1);
}

// connectionTimeoutMillis covers both ways to get a connection, and pg words
// them differently:
//   - waiting for a free one:  "timeout exceeded when trying to connect"
//   - opening a new one:       "Connection terminated due to connection timeout"
// Either way the caller had no usable connection within the budget.
export function isPoolTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('timeout exceeded when trying to connect') ||
    err.message.includes('Connection terminated due to connection timeout')
  );
}

// Every DB access goes through here so we can tell apart the three ways
// a "slow database call" can actually be slow:
//   1. waiting for a free connection  (db_pool_acquire_wait_seconds)
//   2. the SQL itself                 (db_query_duration_seconds)
//   3. holding a connection too long  (db_pool_connection_hold_seconds)
// pool.query() is deliberately not used: it acquires implicitly, which
// would fold pool wait into "query time" and hide exactly that difference.
import type pg from 'pg';
import { performance } from 'node:perf_hooks';
import { addTiming } from '../obs/request-context.js';
import {
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

  constructor(readonly pool: pg.Pool) {
    registerPoolGauges(() => this.stats());
    // pg emits these around every checkout, including ones we don't make ourselves.
    pool.on('acquire', (client) => this.acquiredAt.set(client, performance.now()));
    pool.on('release', (_err, client) => {
      const start = this.acquiredAt.get(client);
      if (start !== undefined) dbConnectionHold.observe((performance.now() - start) / 1000);
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
    const start = performance.now();
    let outcome = 'ok';
    try {
      return await this.pool.connect();
    } catch (err) {
      outcome = 'error';
      throw err;
    } finally {
      const ms = performance.now() - start;
      dbPoolAcquireWait.labels(outcome).observe(ms / 1000);
      addTiming('acquireMs', ms);
    }
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
    return await db.query<R>(text, values);
  } finally {
    const ms = performance.now() - start;
    dbQueryDuration.labels(name).observe(ms / 1000);
    addTiming('queryMs', ms);
  }
}

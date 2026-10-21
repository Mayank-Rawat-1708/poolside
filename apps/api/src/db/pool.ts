import pg from 'pg';
import type { Config } from '../config.js';

export function createPool(db: Config['db']): pg.Pool {
  return new pg.Pool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    max: db.poolMax,
    idleTimeoutMillis: 30_000,
    // Fail fast when the pool is exhausted instead of letting callers pile up.
    connectionTimeoutMillis: db.acquireTimeoutMs,
    application_name: 'poolside-api',
  });
}

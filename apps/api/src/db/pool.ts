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
    // Safety net enforced by Postgres itself: a session left idle inside an
    // open transaction this long is terminated, releasing its locks and its
    // connection slot even if application code forgets to commit or roll back.
    options: `-c idle_in_transaction_session_timeout=${db.idleInTxTimeoutMs}`,
  });
}

// A tiny pool reserved for operational queries (readiness, admin views).
// If these shared the main pool they would queue behind the very traffic
// that is starving it, and go blind exactly when they are needed.
import pg from 'pg';
import type { Config } from '../config.js';

export function createOpsPool(db: Config['db']): pg.Pool {
  return new pg.Pool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    max: 2,
    connectionTimeoutMillis: 500,
    idleTimeoutMillis: 30_000,
    application_name: 'poolside-ops',
  });
}

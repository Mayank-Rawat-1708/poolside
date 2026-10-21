// All runtime configuration in one place, read once at startup.
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
}

const txStrategy = process.env.TX_STRATEGY ?? 'hold';

export const config = {
  txStrategy,
  port: num('PORT', 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  db: {
    host: process.env.PGHOST ?? 'localhost',
    port: num('PGPORT', 5432),
    user: process.env.PGUSER ?? 'poolside',
    password: process.env.PGPASSWORD ?? 'poolside',
    database: process.env.PGDATABASE ?? 'poolside',
    poolMax: num('DB_POOL_MAX', 10),
    acquireTimeoutMs: num('DB_ACQUIRE_TIMEOUT_MS', 1000),
  },
  downstreamUrl: process.env.DOWNSTREAM_URL ?? 'http://localhost:4001',
  // Only applies to TX_STRATEGY=release; hold keeps its original single unbounded call.
  chargePolicy: {
    timeoutMs: num('DOWNSTREAM_TIMEOUT_MS', 3000),
    retries: num('DOWNSTREAM_RETRIES', 2),
    baseDelayMs: num('DOWNSTREAM_RETRY_BASE_MS', 100),
    maxDelayMs: num('DOWNSTREAM_RETRY_MAX_MS', 1000),
  },
  adminToken: process.env.ADMIN_TOKEN ?? '',
};

export type Config = typeof config;

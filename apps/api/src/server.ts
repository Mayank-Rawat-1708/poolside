import { buildApp } from './app.js';
import { config } from './config.js';
import { createOpsPool } from './db/ops-pool.js';
import { createPool } from './db/pool.js';

const pool = createPool(config.db);
// An idle client erroring (e.g. Postgres restart) must not crash the process.
pool.on('error', (err) => console.error('idle pg client error', err));
const opsPool = createOpsPool(config.db);
opsPool.on('error', (err) => console.error('idle ops pg client error', err));

const app = buildApp({ config, pool, opsPool });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await Promise.all([pool.end(), opsPool.end()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

app.listen({ port: config.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

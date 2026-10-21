import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { timedQuery, type InstrumentedPool } from '../db/instrumented-pool.js';

interface Deps {
  db: InstrumentedPool;
  opsPool: pg.Pool;
}

export async function healthRoutes(app: FastifyInstance, { db, opsPool }: Deps) {
  // Liveness: the process is up and the event loop answers. No dependencies,
  // so a slow database never gets a healthy process restarted.
  app.get('/health/live', async () => ({ status: 'ok' }));

  // Readiness: can we reach Postgres at all? Runs on the ops pool with a
  // 500ms acquire timeout, so it reports DB reachability instead of queueing
  // behind a saturated main pool. Pool stats are informational only:
  // failing readiness on saturation would pull every replica at once.
  app.get('/health/ready', async (_req, reply) => {
    try {
      await opsPool.query('SELECT 1');
      return { status: 'ok', pool: db.stats() };
    } catch (err) {
      return reply.code(503).send({ status: 'unavailable', reason: (err as Error).message });
    }
  });

  // The original deep health check, kept on purpose: it shares the main
  // pool, so it degrades with traffic. See docs/INSTRUMENTATION.md.
  app.get('/health', async () => {
    await db.withClient((c) => timedQuery(c, 'health_ping', 'SELECT 1'));
    return { status: 'ok' };
  });
}

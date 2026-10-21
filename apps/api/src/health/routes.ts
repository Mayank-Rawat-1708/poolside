import type { FastifyInstance } from 'fastify';
import { timedQuery, type InstrumentedPool } from '../db/instrumented-pool.js';

export async function healthRoutes(app: FastifyInstance, { db }: { db: InstrumentedPool }) {
  app.get('/health', async () => {
    await db.withClient((c) => timedQuery(c, 'health_ping', 'SELECT 1'));
    return { status: 'ok' };
  });
}

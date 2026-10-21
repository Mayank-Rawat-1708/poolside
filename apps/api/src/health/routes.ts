import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

export async function healthRoutes(app: FastifyInstance, { pool }: { pool: pg.Pool }) {
  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok' };
  });
}

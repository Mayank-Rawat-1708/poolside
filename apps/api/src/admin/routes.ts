import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

interface Deps {
  adminToken: string;
  opsPool: pg.Pool;
}

function tokenMatches(header: string | undefined, token: string): boolean {
  if (!token || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Same shape as scripts/pg-activity.sh: who holds connections, and in what state.
const SESSIONS_SQL = `
  SELECT coalesce(state, 'unknown') AS state,
         count(*)::int AS count,
         coalesce(extract(epoch FROM max(now() - state_change)), 0)::float AS "longestInStateSec",
         coalesce(extract(epoch FROM max(now() - xact_start)), 0)::float AS "oldestXactSec"
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND backend_type = 'client backend'
    AND application_name <> 'poolside-ops'
  GROUP BY 1
  ORDER BY 2 DESC`;

export async function adminRoutes(app: FastifyInstance, { adminToken, opsPool }: Deps) {
  app.addHook('onRequest', async (req, reply) => {
    if (!tokenMatches(req.headers.authorization, adminToken)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/admin/db-sessions', async () => {
    const { rows } = await opsPool.query(SESSIONS_SQL);
    return { sampledAt: new Date().toISOString(), sessions: rows };
  });
}

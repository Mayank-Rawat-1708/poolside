import Fastify, { type FastifyError } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { PaymentsClient } from './downstream/payments-client.js';
import { healthRoutes } from './health/routes.js';
import { orderRoutes } from './orders/routes.js';

export interface AppDeps {
  config: Config;
  pool: pg.Pool;
}

export function buildApp({ config, pool }: AppDeps) {
  const app = Fastify({ logger: { level: config.logLevel } });
  const payments = new PaymentsClient(config.downstreamUrl);

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.validation) {
      return reply.code(400).send({ error: 'bad_request', message: err.message });
    }
    req.log.error({ err }, 'request failed');
    // Never leak internals to clients.
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.register(healthRoutes, { pool });
  app.register(orderRoutes, { pool, payments });
  return app;
}

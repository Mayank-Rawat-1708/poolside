import Fastify, { type FastifyError } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { PaymentsClient } from './downstream/payments-client.js';
import { healthRoutes } from './health/routes.js';
import { orderRoutes } from './orders/routes.js';
import { loggingOptions, registerHttpHooks } from './obs/http-hooks.js';
import { registry } from './obs/metrics.js';

export interface AppDeps {
  config: Config;
  pool: pg.Pool;
}

export function buildApp({ config, pool }: AppDeps) {
  const app = Fastify(loggingOptions(config.logLevel));
  registerHttpHooks(app);
  const payments = new PaymentsClient(config.downstreamUrl);

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.validation) {
      return reply.code(400).send({ error: 'bad_request', message: err.message });
    }
    req.errorClass = err.name;
    req.log.error({ err }, 'request failed');
    // Never leak internals to clients.
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.get('/metrics', async (_req, reply) => {
    reply.type(registry.contentType);
    return registry.metrics();
  });

  app.register(healthRoutes, { pool });
  app.register(orderRoutes, { pool, payments });
  return app;
}

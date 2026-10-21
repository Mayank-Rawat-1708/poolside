import Fastify, { type FastifyError } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { adminRoutes } from './admin/routes.js';
import { AppError } from './errors.js';
import { InstrumentedPool } from './db/instrumented-pool.js';
import { PaymentsClient } from './downstream/payments-client.js';
import { healthRoutes } from './health/routes.js';
import { orderRoutes } from './orders/routes.js';
import { isStrategyName, StrategySwitch } from './orders/strategies/index.js';
import { loggingOptions, registerHttpHooks } from './obs/http-hooks.js';
import { appErrors, registry } from './obs/metrics.js';
import { RecentRequests } from './obs/recent-requests.js';

export interface AppDeps {
  config: Config;
  pool: pg.Pool;
  opsPool: pg.Pool;
}

export function buildApp({ config, pool, opsPool }: AppDeps) {
  const app = Fastify(loggingOptions(config.logLevel));
  const db = new InstrumentedPool(pool);
  const recent = new RecentRequests(500);
  registerHttpHooks(app, { poolStats: () => db.stats(), recent });
  const payments = new PaymentsClient(config.downstreamUrl, config.chargePolicy);
  if (!isStrategyName(config.txStrategy)) throw new Error(`unknown TX_STRATEGY "${config.txStrategy}"`);
  const strategy = new StrategySwitch(config.txStrategy);

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.validation) {
      return reply.code(400).send({ error: 'bad_request', message: err.message });
    }
    req.errorClass = err.name;
    appErrors.labels(err.name, req.routeOptions.url ?? 'unmatched').inc();
    if (err instanceof AppError) {
      req.log.warn({ err }, 'request failed');
      if (err.statusCode === 503) reply.header('retry-after', '1');
      return reply.code(err.statusCode).send({ error: err.publicError, code: err.code });
    }
    req.log.error({ err }, 'request failed');
    // Never leak internals to clients.
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.get('/metrics', async (_req, reply) => {
    reply.type(registry.contentType);
    return registry.metrics();
  });

  app.register(healthRoutes, { db, opsPool });
  app.register(orderRoutes, { db, payments, strategy });
  app.register(adminRoutes, { adminToken: config.adminToken, opsPool, strategy, recent });
  return app;
}

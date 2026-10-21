import type { FastifyInstance } from 'fastify';
import type { InstrumentedPool } from '../db/instrumented-pool.js';
import type { PaymentsClient } from '../downstream/payments-client.js';
import { findOrder } from './repo.js';
import type { StrategySwitch } from './strategies/index.js';

interface Deps {
  db: InstrumentedPool;
  payments: PaymentsClient;
  strategy: StrategySwitch;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function orderRoutes(app: FastifyInstance, { db, payments, strategy }: Deps) {
  app.post<{ Body: { customerId: string; amountCents: number } }>(
    '/orders',
    {
      schema: {
        body: {
          type: 'object',
          required: ['customerId', 'amountCents'],
          additionalProperties: false,
          properties: {
            customerId: { type: 'string', minLength: 1, maxLength: 64 },
            amountCents: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const order = await strategy.createOrder({ db, payments }, req.body);
      return reply.code(201).send(order);
    },
  );

  app.get<{ Params: { id: string } }>('/orders/:id', async (req, reply) => {
    if (!UUID_RE.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const order = await db.withClient((c) => findOrder(c, req.params.id));
    if (!order) return reply.code(404).send({ error: 'not_found' });
    return order;
  });
}

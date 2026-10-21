import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { PaymentsClient } from '../downstream/payments-client.js';
import { findOrder, insertPendingOrder, markOrder } from './repo.js';

interface Deps {
  pool: pg.Pool;
  payments: PaymentsClient;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function orderRoutes(app: FastifyInstance, { pool, payments }: Deps) {
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
      const { customerId, amountCents } = req.body;

      // The order and its payment are written atomically.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const pending = await insertPendingOrder(client, customerId, amountCents);
        const { paymentRef } = await payments.charge(pending.id, amountCents);
        const order = await markOrder(client, pending.id, 'paid', paymentRef);
        await client.query('COMMIT');
        return reply.code(201).send(order);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  );

  app.get<{ Params: { id: string } }>('/orders/:id', async (req, reply) => {
    if (!UUID_RE.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const order = await findOrder(pool, req.params.id);
    if (!order) return reply.code(404).send({ error: 'not_found' });
    return order;
  });
}

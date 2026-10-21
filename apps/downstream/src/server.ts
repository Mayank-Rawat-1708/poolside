// "payments" mock: a third-party provider we don't control.
// Latency, jitter and error rate are adjustable at runtime so we can
// simulate a provider having a bad day without restarting anything.
import Fastify, { LogController } from 'fastify';
import { randomUUID } from 'node:crypto';

interface Behaviour {
  latencyMs: number;
  jitterMs: number;
  errorRate: number; // 0..1, fraction of charges answered with a 500
}

const behaviour: Behaviour = {
  latencyMs: Number(process.env.DOWNSTREAM_LATENCY_MS ?? 50),
  jitterMs: Number(process.env.DOWNSTREAM_JITTER_MS ?? 20),
  errorRate: Number(process.env.DOWNSTREAM_ERROR_RATE ?? 0),
};

const adminToken = process.env.ADMIN_TOKEN ?? '';

// Real providers dedupe on an idempotency key, so a retried charge
// returns the original result instead of charging twice.
const MAX_IDEMPOTENCY_ENTRIES = 10_000;
const idempotency = new Map<string, { paymentRef: string }>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sampleDelay(): number {
  const jitter = (Math.random() * 2 - 1) * behaviour.jitterMs;
  return Math.max(0, behaviour.latencyMs + jitter);
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info', base: { service: 'downstream' } },
  requestIdHeader: 'x-request-id',
  logController: new LogController({ requestIdLogLabel: 'requestId' }),
});

app.post<{ Body: { orderId: string; amountCents: number } }>(
  '/charge',
  {
    schema: {
      body: {
        type: 'object',
        required: ['orderId', 'amountCents'],
        properties: {
          orderId: { type: 'string' },
          amountCents: { type: 'integer', minimum: 1 },
        },
      },
    },
  },
  async (req, reply) => {
    await sleep(sampleDelay());

    if (Math.random() < behaviour.errorRate) {
      return reply.code(500).send({ error: 'processor_error' });
    }

    const key = req.headers['idempotency-key'];
    if (typeof key === 'string') {
      const previous = idempotency.get(key);
      if (previous) return { ...previous, status: 'approved', replayed: true };
    }

    const result = { paymentRef: `pay_${randomUUID()}` };
    if (typeof key === 'string') {
      // Map keeps insertion order, so the first key is the oldest.
      if (idempotency.size >= MAX_IDEMPOTENCY_ENTRIES) {
        const oldest = idempotency.keys().next().value;
        if (oldest !== undefined) idempotency.delete(oldest);
      }
      idempotency.set(key, result);
    }
    return { ...result, status: 'approved', replayed: false };
  },
);

app.get('/health', async () => ({ status: 'ok' }));

// Admin routes require the shared bearer token.
app.register(async (admin) => {
  admin.addHook('onRequest', async (req, reply) => {
    if (!adminToken || req.headers.authorization !== `Bearer ${adminToken}`) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  admin.get('/admin/latency', async () => behaviour);

  admin.put<{ Body: Partial<Behaviour> }>(
    '/admin/latency',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            latencyMs: { type: 'integer', minimum: 0, maximum: 60_000 },
            jitterMs: { type: 'integer', minimum: 0, maximum: 60_000 },
            errorRate: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
    async (req) => {
      Object.assign(behaviour, req.body);
      req.log.info({ behaviour }, 'downstream behaviour updated');
      return behaviour;
    },
  );
});

const port = Number(process.env.PORT ?? 4001);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

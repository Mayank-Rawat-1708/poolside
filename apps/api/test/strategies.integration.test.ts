// Proves the fix at the level of the pool itself, against a real Postgres
// (the compose one: `make up` or `docker compose up -d postgres migrate`).
//
// 40 orders arrive 5ms apart while the payments provider takes 300ms.
//   hold:    each order pins a connection for ~300ms -> the pool (10) fills,
//            callers queue, and some wait about as long as the provider takes
//   release: each checkout lasts a few ms -> no caller waits anywhere near
//            provider latency
// The assertions compare waits with the provider latency rather than
// demanding exactly zero queueing: on a slow 2-vCPU CI runner, release still
// shows momentary blips of a few callers waiting for a few milliseconds.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../src/db/pool.js';
import { InstrumentedPool } from '../src/db/instrumented-pool.js';
import { PaymentsClient } from '../src/downstream/payments-client.js';
import { newContext, runWithContext } from '../src/obs/request-context.js';
import { STRATEGIES, type StrategyName } from '../src/orders/strategies/index.js';

const POOL_MAX = 10;
const ORDERS = 40;
const ARRIVAL_GAP_MS = 5;
const PROVIDER_LATENCY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let provider: http.Server;
let pool: ReturnType<typeof createPool>;
let db: InstrumentedPool;
let payments: PaymentsClient;

beforeAll(async () => {
  provider = http.createServer((req, res) => {
    req.resume();
    setTimeout(() => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ paymentRef: `pay_${Date.now()}` }));
    }, PROVIDER_LATENCY_MS);
  });
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const { port } = provider.address() as AddressInfo;

  pool = createPool({
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? 'poolside',
    password: process.env.PGPASSWORD ?? 'poolside',
    database: process.env.PGDATABASE ?? 'poolside',
    poolMax: POOL_MAX,
    acquireTimeoutMs: 10_000,
    idleInTxTimeoutMs: 10_000,
  });
  db = new InstrumentedPool(pool);
  payments = new PaymentsClient(`http://127.0.0.1:${port}`, {
    timeoutMs: 5000,
    retries: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
  });

  // Fail with a clear message rather than a timeout if Postgres isn't up.
  await pool.query('SELECT 1 FROM orders LIMIT 1').catch((err: Error) => {
    throw new Error(`integration tests need the compose Postgres with migrations applied: ${err.message}`);
  });
});

afterAll(async () => {
  await pool?.end();
  await new Promise((resolve) => provider?.close(resolve));
});

// Opening a connection takes a few ms and pg counts callers as waiting
// meanwhile, so start from a full, warm pool to measure only contention.
async function warmPool() {
  const clients = await Promise.all(Array.from({ length: POOL_MAX }, () => pool.connect()));
  clients.forEach((c) => c.release());
}

async function runScenario(strategy: StrategyName) {
  await warmPool();
  let maxWaiting = 0;
  const sampler = setInterval(() => {
    maxWaiting = Math.max(maxWaiting, pool.waitingCount);
  }, 2);

  // Each order runs in its own request context, which accumulates its acquire wait.
  const contexts = Array.from({ length: ORDERS }, (_, i) => newContext(`it-${strategy}-${i}`, undefined));
  const orders: Promise<unknown>[] = [];
  for (let i = 0; i < ORDERS; i++) {
    const input = { customerId: `it_${strategy}`, amountCents: 100 + i };
    orders.push(runWithContext(contexts[i]!, () => STRATEGIES[strategy]({ db, payments }, input)));
    await sleep(ARRIVAL_GAP_MS);
  }
  const results = await Promise.allSettled(orders);
  clearInterval(sampler);

  const maxAcquireMs = Math.max(...contexts.map((c) => c.timings.acquireMs));
  console.log(`${strategy}: max waiting ${maxWaiting}, max acquire wait ${maxAcquireMs.toFixed(1)}ms`);
  return { maxWaiting, maxAcquireMs, failed: results.filter((r) => r.status === 'rejected').length };
}

describe('transaction strategy under concurrency', () => {
  it('hold: connections are pinned across the provider call and callers queue', async () => {
    const { maxWaiting, maxAcquireMs, failed } = await runScenario('hold');
    expect(failed).toBe(0);
    expect(maxWaiting).toBeGreaterThanOrEqual(POOL_MAX);
    expect(maxAcquireMs).toBeGreaterThan(PROVIDER_LATENCY_MS / 2);
  });

  it('release: no caller waits anywhere near the provider latency', async () => {
    const { maxWaiting, maxAcquireMs, failed } = await runScenario('release');
    expect(failed).toBe(0);
    expect(maxWaiting).toBeLessThan(POOL_MAX);
    expect(maxAcquireMs).toBeLessThan(PROVIDER_LATENCY_MS / 3);
  });
});

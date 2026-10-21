import type { InstrumentedPool } from '../../db/instrumented-pool.js';
import type { PaymentsClient } from '../../downstream/payments-client.js';
import type { Order } from '../repo.js';

export interface CreateOrderDeps {
  db: InstrumentedPool;
  payments: PaymentsClient;
}

export interface CreateOrderInput {
  customerId: string;
  amountCents: number;
}

// One function per strategy, same contract: the HTTP layer doesn't know which runs.
export type CreateOrder = (deps: CreateOrderDeps, input: CreateOrderInput) => Promise<Order>;

// TX_STRATEGY=release: never hold a pool connection across network I/O.
//
//   1. INSERT the order as 'pending' (autocommit), release the connection
//   2. charge the provider with no connection held
//   3. UPDATE to 'paid' / 'failed' on a fresh, short checkout
//
// Each checkout lasts milliseconds, so pool demand no longer scales with
// provider latency. The cost is that 'pending' is now a visible state: a
// crash between 2 and 3 leaves a pending row that a reconciler must
// resolve using the idempotency key (see docs/POSTMORTEM.md).
import { insertPendingOrder, markOrder } from '../repo.js';
import type { CreateOrder } from './types.js';

export const createOrderRelease: CreateOrder = async ({ db, payments }, { customerId, amountCents }) => {
  const pending = await db.withClient((c) => insertPendingOrder(c, customerId, amountCents));

  let paymentRef: string;
  try {
    ({ paymentRef } = await payments.charge(pending.id, amountCents));
  } catch (err) {
    await db.withClient((c) => markOrder(c, pending.id, 'failed', null));
    throw err;
  }

  return db.withClient((c) => markOrder(c, pending.id, 'paid', paymentRef));
};

// TX_STRATEGY=hold: the original implementation.
// One transaction wraps the whole flow, including the network call to the
// payments provider. The pool connection is held (idle in transaction)
// for as long as the provider takes to answer.
import { timedQuery } from '../../db/instrumented-pool.js';
import { insertPendingOrder, markOrder } from '../repo.js';
import type { CreateOrder } from './types.js';

export const createOrderHold: CreateOrder = async ({ db, payments }, { customerId, amountCents }) => {
  const client = await db.acquire();
  try {
    await timedQuery(client, 'begin', 'BEGIN');
    const pending = await insertPendingOrder(client, customerId, amountCents);
    const { paymentRef } = await payments.charge(pending.id, amountCents); // network I/O inside the transaction
    const order = await markOrder(client, pending.id, 'paid', paymentRef);
    await timedQuery(client, 'commit', 'COMMIT');
    return order;
  } catch (err) {
    await timedQuery(client, 'rollback', 'ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

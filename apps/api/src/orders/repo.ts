import { timedQuery, type Queryable } from '../db/instrumented-pool.js';

export interface Order {
  id: string;
  customerId: string;
  amountCents: number;
  status: 'pending' | 'paid' | 'failed';
  paymentRef: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS = `id, customer_id AS "customerId", amount_cents AS "amountCents", status,
  payment_ref AS "paymentRef", created_at AS "createdAt", updated_at AS "updatedAt"`;

export async function insertPendingOrder(
  db: Queryable,
  customerId: string,
  amountCents: number,
): Promise<Order> {
  const { rows } = await timedQuery<Order>(
    db,
    'insert_order',
    `INSERT INTO orders (customer_id, amount_cents) VALUES ($1, $2) RETURNING ${COLUMNS}`,
    [customerId, amountCents],
  );
  return rows[0]!;
}

// clock_timestamp(), not now(): now() is frozen at transaction start.
export async function markOrder(
  db: Queryable,
  id: string,
  status: 'paid' | 'failed',
  paymentRef: string | null,
): Promise<Order> {
  const { rows } = await timedQuery<Order>(
    db,
    'mark_order',
    `UPDATE orders SET status = $2, payment_ref = $3, updated_at = clock_timestamp()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status, paymentRef],
  );
  return rows[0]!;
}

export async function findOrder(db: Queryable, id: string): Promise<Order | null> {
  const { rows } = await timedQuery<Order>(
    db,
    'find_order',
    `SELECT ${COLUMNS} FROM orders WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

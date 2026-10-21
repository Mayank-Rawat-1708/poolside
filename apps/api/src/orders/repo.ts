import type pg from 'pg';

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

// Accepts a Pool or a checked-out PoolClient so the same SQL works
// inside or outside a transaction.
type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export async function insertPendingOrder(
  db: Queryable,
  customerId: string,
  amountCents: number,
): Promise<Order> {
  const { rows } = await db.query<Order>(
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
  const { rows } = await db.query<Order>(
    `UPDATE orders SET status = $2, payment_ref = $3, updated_at = clock_timestamp()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status, paymentRef],
  );
  return rows[0]!;
}

export async function findOrder(db: Queryable, id: string): Promise<Order | null> {
  const { rows } = await db.query<Order>(`SELECT ${COLUMNS} FROM orders WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

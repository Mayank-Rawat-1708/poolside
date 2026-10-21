-- Orders placed through POST /orders. A row starts as 'pending' and becomes
-- 'paid' or 'failed' once the payments provider answers.
CREATE TABLE orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   text        NOT NULL,
  amount_cents  integer     NOT NULL CHECK (amount_cents > 0),
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'paid', 'failed')),
  payment_ref   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

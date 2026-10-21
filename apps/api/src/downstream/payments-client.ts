import { currentContext } from '../obs/request-context.js';

export interface ChargeResult {
  paymentRef: string;
}

export class PaymentsClient {
  constructor(private readonly baseUrl: string) {}

  async charge(orderId: string, amountCents: number): Promise<ChargeResult> {
    const res = await fetch(`${this.baseUrl}/charge`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Lets the provider's logs be joined with ours.
        'x-request-id': currentContext()?.requestId ?? '',
      },
      body: JSON.stringify({ orderId, amountCents }),
    });
    if (!res.ok) throw new Error(`payments responded ${res.status}`);
    return (await res.json()) as ChargeResult;
  }
}

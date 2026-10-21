export interface ChargeResult {
  paymentRef: string;
}

export class PaymentsClient {
  constructor(private readonly baseUrl: string) {}

  async charge(orderId: string, amountCents: number): Promise<ChargeResult> {
    const res = await fetch(`${this.baseUrl}/charge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId, amountCents }),
    });
    if (!res.ok) throw new Error(`payments responded ${res.status}`);
    return (await res.json()) as ChargeResult;
  }
}

import { describe, expect, it } from 'vitest';
import { newContext, runWithContext } from '../src/obs/request-context.js';
import { checkNetworkIo, NetworkIoInTransactionError } from '../src/obs/tx-guard.js';

describe('checkNetworkIo', () => {
  it('ignores calls outside a request or with no open transaction', () => {
    expect(() => checkNetworkIo('x', 'throw')).not.toThrow();
    expect(() => runWithContext(newContext('r1', undefined), () => checkNetworkIo('x', 'throw'))).not.toThrow();
  });

  it('throws in throw mode when a transaction is open', () => {
    const ctx = { ...newContext('r2', undefined), openTransactions: 1 };
    expect(() => runWithContext(ctx, () => checkNetworkIo('payments.charge', 'throw'))).toThrow(NetworkIoInTransactionError);
  });

  it('only counts in warn mode', () => {
    const ctx = { ...newContext('r3', undefined), openTransactions: 1 };
    expect(() => runWithContext(ctx, () => checkNetworkIo('payments.charge', 'warn'))).not.toThrow();
  });
});

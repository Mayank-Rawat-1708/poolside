// Detects network I/O while the current request has a transaction open:
// the pattern behind the pool-exhaustion incident (docs/POSTMORTEM.md).
// Production: counts and annotates the trace. TX_IO_GUARD=throw (tests,
// staging) turns it into an error so the offending code path fails loudly.
import { trace } from '@opentelemetry/api';
import { Counter } from 'prom-client';
import { registry } from './metrics.js';
import { currentContext } from './request-context.js';

const networkIoInTx = new Counter({
  name: 'app_network_io_in_transaction_total',
  help: 'Outbound network calls made while a DB transaction was open',
  labelNames: ['target'] as const,
  registers: [registry],
});

export class NetworkIoInTransactionError extends Error {
  override readonly name = 'NetworkIoInTransactionError';
}

export function checkNetworkIo(target: string, mode = process.env.TX_IO_GUARD ?? 'warn'): void {
  const ctx = currentContext();
  if (!ctx || ctx.openTransactions === 0) return;
  networkIoInTx.labels(target).inc();
  trace.getActiveSpan()?.addEvent('network_io_in_transaction', { target });
  if (mode === 'throw') throw new NetworkIoInTransactionError(`${target} called inside an open transaction`);
}

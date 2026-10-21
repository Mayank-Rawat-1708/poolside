import { Gauge } from 'prom-client';
import { registry } from '../../obs/metrics.js';
import { createOrderHold } from './hold.js';
import type { CreateOrder } from './types.js';

export const STRATEGIES = { hold: createOrderHold } satisfies Record<string, CreateOrder>;
export type StrategyName = keyof typeof STRATEGIES;

export function isStrategyName(value: unknown): value is StrategyName {
  return typeof value === 'string' && Object.hasOwn(STRATEGIES, value);
}

// 1 for the active strategy, 0 otherwise: lets dashboards show when it flipped.
const activeStrategy = new Gauge({
  name: 'app_tx_strategy',
  help: 'Active POST /orders transaction strategy',
  labelNames: ['strategy'] as const,
  registers: [registry],
});

// Runtime-switchable so the demo can flip it without a restart.
export class StrategySwitch {
  constructor(private current: StrategyName) {
    this.publish();
  }

  get name(): StrategyName {
    return this.current;
  }

  get createOrder(): CreateOrder {
    return STRATEGIES[this.current];
  }

  set(name: StrategyName): void {
    this.current = name;
    this.publish();
  }

  private publish() {
    for (const name of Object.keys(STRATEGIES)) activeStrategy.labels(name).set(name === this.current ? 1 : 0);
  }
}

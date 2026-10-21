// Moderate steady load while the payments provider is slow (~1.2s ± 0.4s).
// The script configures the provider itself and restores it afterwards.
import { DOWNSTREAM, setDownstream, summaryTrendStats, thresholds, trafficMix } from './lib/common.js';
import { summaryFor } from './lib/summary.js';

export const options = {
  scenarios: {
    steady: {
      executor: 'constant-arrival-rate',
      rate: 15,
      timeUnit: '1s',
      duration: __ENV.DURATION || '60s',
      preAllocatedVUs: 50,
      maxVUs: 300,
    },
  },
  thresholds,
  summaryTrendStats,
};

export function setup() {
  setDownstream({ latencyMs: 1200, jitterMs: 400 });
  console.log(`downstream at ${DOWNSTREAM} set to 1200ms ± 400ms`);
}

export default trafficMix;

export function teardown() {
  setDownstream({ latencyMs: 50, jitterMs: 20, errorRate: 0 });
}

export const handleSummary = summaryFor(__ENV.SUMMARY_NAME || 'slow-downstream');

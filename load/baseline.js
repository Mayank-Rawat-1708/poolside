// Light, steady load. Expected: everything healthy.
import { summaryTrendStats, thresholds, trafficMix } from './lib/common.js';
import { summaryFor } from './lib/summary.js';

export const options = {
  scenarios: {
    steady: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds,
  summaryTrendStats,
};

export default trafficMix;
export const handleSummary = summaryFor(__ENV.SUMMARY_NAME || 'baseline');

// Traffic burst: 10 rps -> 40 rps for 30s -> back down.
// With a fast provider this is comfortable; with a slow one it is not.
import { summaryTrendStats, thresholds, trafficMix } from './lib/common.js';
import { summaryFor } from './lib/summary.js';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 400,
      stages: [
        { target: 10, duration: '10s' },
        { target: 40, duration: '10s' },
        { target: 40, duration: '30s' },
        { target: 10, duration: '10s' },
        { target: 10, duration: '10s' },
      ],
    },
  },
  thresholds,
  summaryTrendStats,
};

export default trafficMix;
export const handleSummary = summaryFor(__ENV.SUMMARY_NAME || 'spike');

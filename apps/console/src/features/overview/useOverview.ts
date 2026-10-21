import { useCallback } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { lastValue, queryRange, type Series } from '../../lib/prom';
import { QUERIES, type QueryKey } from './queries';

export const WINDOW_SECONDS = 5 * 60;
const STEP_SECONDS = 2;

export type OverviewData = Record<QueryKey, Series[]>;

// One poll, every query in parallel: KPIs, charts and status share it.
export function useOverview() {
  const fetchAll = useCallback(async (signal: AbortSignal) => {
    const keys = Object.keys(QUERIES) as QueryKey[];
    const results = await Promise.all(keys.map((k) => queryRange(QUERIES[k], WINDOW_SECONDS, STEP_SECONDS, signal)));
    return Object.fromEntries(keys.map((k, i) => [k, results[i]])) as OverviewData;
  }, []);
  return usePolling(fetchAll, 2000);
}

export function current(data: OverviewData | undefined, key: QueryKey): number | null {
  return lastValue(data?.[key]);
}

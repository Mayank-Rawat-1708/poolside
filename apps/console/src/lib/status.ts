// Health status derived from the same numbers shown on the KPI cards.
export type Status = 'healthy' | 'degraded' | 'failing' | 'unknown';

export interface StatusInputs {
  errorRatio: number | null;
  p95Seconds: number | null;
  poolWaiting: number | null;
  poolUtilization: number | null; // in use / max
}

export const THRESHOLDS = {
  failing: { errorRatio: 0.05, p95Seconds: 2 },
  degraded: { errorRatio: 0.01, p95Seconds: 0.5, poolWaiting: 0, poolUtilization: 0.8 },
};

export function deriveStatus(i: StatusInputs): { status: Status; reasons: string[] } {
  const failing: string[] = [];
  const degraded: string[] = [];
  const err = i.errorRatio ?? 0;
  const p95 = i.p95Seconds ?? 0;

  if (err >= THRESHOLDS.failing.errorRatio) failing.push(`errors ${(err * 100).toFixed(1)}% ≥ 5%`);
  else if (err >= THRESHOLDS.degraded.errorRatio) degraded.push(`errors ${(err * 100).toFixed(1)}% ≥ 1%`);
  if (p95 >= THRESHOLDS.failing.p95Seconds) failing.push(`p95 ${p95.toFixed(2)}s ≥ 2s`);
  else if (p95 >= THRESHOLDS.degraded.p95Seconds) degraded.push(`p95 ${p95.toFixed(2)}s ≥ 0.5s`);
  if ((i.poolWaiting ?? 0) > THRESHOLDS.degraded.poolWaiting) degraded.push(`${i.poolWaiting} waiting for a connection`);
  if ((i.poolUtilization ?? 0) >= THRESHOLDS.degraded.poolUtilization) degraded.push(`pool ${Math.round((i.poolUtilization ?? 0) * 100)}% in use`);

  if (failing.length) return { status: 'failing', reasons: [...failing, ...degraded] };
  if (degraded.length) return { status: 'degraded', reasons: degraded };
  return { status: 'healthy', reasons: [] };
}

import { formatMs, formatRate } from '../../lib/format';
import type { Series } from '../../lib/prom';
import { KpiCard, type Level } from './KpiCard';
import { current, type OverviewData } from './useOverview';

const pts = (s: Series[] | undefined) => s?.[0]?.points ?? [];

function level(value: number | null, warn: number, bad: number): Level {
  if (value == null) return 'neutral'; // no data is not "normal"
  if (value >= bad) return 'bad';
  if (value >= warn) return 'warn';
  return 'ok';
}

export function KpiRow({ data, loading }: { data: OverviewData | undefined; loading: boolean }) {
  const rps = current(data, 'rps');
  const errorRatio = current(data, 'errorRatio');
  const p95 = current(data, 'p95');
  const inUse = current(data, 'poolInUse');
  const max = current(data, 'poolMax');
  const waiting = current(data, 'poolWaiting');
  const acquire = current(data, 'acquireP99');
  const utilization = inUse != null && max ? inUse / max : null;

  return (
    <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
      <KpiCard label="Requests / s" value={formatRate(rps)} level="neutral" points={pts(data?.rps)} loading={loading} />
      <KpiCard
        label="Error rate (5xx)"
        value={errorRatio == null ? '—' : (errorRatio * 100).toFixed(1)}
        unit={errorRatio == null ? undefined : '%'}
        level={level(errorRatio, 0.01, 0.05)}
        points={pts(data?.errorRatio)}
        loading={loading}
      />
      <KpiCard label="Latency p95" value={formatMs(p95 == null ? null : p95 * 1000)} level={level(p95, 0.5, 2)} points={pts(data?.p95)} loading={loading} />
      <KpiCard
        label="Pool in use"
        value={inUse == null ? '—' : String(inUse)}
        hint={max == null ? undefined : `of ${max}`}
        level={level(utilization, 0.8, 1)}
        points={pts(data?.poolInUse)}
        loading={loading}
      />
      <KpiCard label="Pool waiting" value={waiting == null ? '—' : String(waiting)} level={level(waiting, 1, 10)} points={pts(data?.poolWaiting)} loading={loading} />
      <KpiCard
        label="Acquire wait p99"
        value={formatMs(acquire == null ? null : acquire * 1000)}
        level={level(acquire, 0.1, 1)}
        points={pts(data?.acquireP99)}
        loading={loading}
      />
    </div>
  );
}

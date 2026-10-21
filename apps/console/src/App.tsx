import { useCallback } from 'react';
import { Header } from './components/Header';
import { StatusPill } from './components/StatusPill';
import { LoadGeneratorPanel } from './features/loadgen/LoadGeneratorPanel';
import { Charts } from './features/overview/Charts';
import { KpiRow } from './features/overview/KpiRow';
import { current, useOverview } from './features/overview/useOverview';
import { ScenarioPanel } from './features/scenario/ScenarioPanel';
import { deriveStatus } from './lib/status';

export function App() {
  const overview = useOverview();
  const { data } = overview;
  const onScenarioEvent = useCallback((_label: string) => {}, []);

  const inUse = current(data, 'poolInUse');
  const max = current(data, 'poolMax');
  const { status, reasons } =
    overview.error && !data
      ? { status: 'unknown' as const, reasons: ['Prometheus unreachable'] }
      : deriveStatus({
          errorRatio: current(data, 'errorRatio'),
          p95Seconds: current(data, 'p95'),
          poolWaiting: current(data, 'poolWaiting'),
          poolUtilization: inUse != null && max ? inUse / max : null,
        });

  return (
    <div className="min-h-screen">
      <Header status={<StatusPill status={overview.loading ? 'unknown' : status} reasons={reasons} />} />
      <main className="mx-auto max-w-[1600px] space-y-3 px-6 py-5">
        <KpiRow data={data} loading={overview.loading} />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <div className="col-span-2">
            <Charts data={data} loading={overview.loading} error={overview.error} markers={[]} updatedAt={overview.updatedAt} />
          </div>
          <div className="col-span-2 grid grid-cols-2 content-start gap-3 xl:col-span-1 xl:grid-cols-1">
            <ScenarioPanel onEvent={onScenarioEvent} />
            <LoadGeneratorPanel onEvent={onScenarioEvent} />
          </div>
        </div>
      </main>
    </div>
  );
}

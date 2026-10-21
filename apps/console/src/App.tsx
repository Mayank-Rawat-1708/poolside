import { useCallback, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { StatusPill } from './components/StatusPill';
import { DbSessionsPanel } from './features/db-sessions/DbSessionsPanel';
import { LoadGeneratorPanel } from './features/loadgen/LoadGeneratorPanel';
import { Charts } from './features/overview/Charts';
import { KpiRow } from './features/overview/KpiRow';
import { current, useOverview } from './features/overview/useOverview';
import { RequestExplorer } from './features/requests/RequestExplorer';
import { ScenarioPanel } from './features/scenario/ScenarioPanel';
import { TimelinePanel } from './features/timeline/TimelinePanel';
import { useTimeline } from './features/timeline/useTimeline';
import { deriveStatus, type Status } from './lib/status';

const STATUS_LABEL: Record<Status, string> = { healthy: 'Healthy', degraded: 'Degraded', failing: 'Failing', unknown: 'No data' };

export function App() {
  const overview = useOverview();
  const { data } = overview;
  const timeline = useTimeline();
  const { add } = timeline;

  const inUse = current(data, 'poolInUse');
  const max = current(data, 'poolMax');
  // Missing data must never read as healthy: no recent samples means "No data".
  const { status, reasons } = (() => {
    if (overview.error && !data) return { status: 'unknown' as Status, reasons: ['Prometheus unreachable'] };
    if (current(data, 'rps') == null) return { status: 'unknown' as Status, reasons: ['No recent metrics from the API'] };
    return deriveStatus({
      errorRatio: current(data, 'errorRatio'),
      p95Seconds: current(data, 'p95'),
      poolWaiting: current(data, 'poolWaiting'),
      poolUtilization: inUse != null && max ? inUse / max : null,
    });
  })();
  const shownStatus = overview.loading ? 'unknown' : status;

  // Record every status transition after the first reading.
  const previous = useRef<Status | null>(null);
  const reasonText = reasons.join(' · ');
  useEffect(() => {
    if (shownStatus === 'unknown' && previous.current === null) return;
    if (previous.current !== null && previous.current !== shownStatus) {
      add('status', `${STATUS_LABEL[previous.current]} → ${STATUS_LABEL[shownStatus]}`, reasonText || undefined);
    }
    previous.current = shownStatus;
  }, [shownStatus, reasonText, add]);

  const onScenarioEvent = useCallback((label: string) => add('scenario', label), [add]);
  const markers = timeline.events.filter((e) => e.kind === 'scenario').map((e) => ({ t: e.at, label: e.label }));

  return (
    <div className="min-h-screen">
      <Header status={<StatusPill status={shownStatus} reasons={reasons} />} />
      <main className="mx-auto max-w-[1600px] space-y-3 px-6 py-5">
        <KpiRow data={data} loading={overview.loading} />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <div className="col-span-2">
            <Charts data={data} loading={overview.loading} error={overview.error} markers={markers} updatedAt={overview.updatedAt} />
          </div>
          <div className="col-span-2 grid grid-cols-2 content-start gap-3 xl:col-span-1 xl:grid-cols-1">
            <ScenarioPanel onEvent={onScenarioEvent} />
            <LoadGeneratorPanel onEvent={onScenarioEvent} />
          </div>
          <div className="col-span-2">
            <RequestExplorer />
          </div>
          <div className="col-span-2 grid grid-cols-2 content-start gap-3 xl:col-span-1 xl:grid-cols-1">
            <DbSessionsPanel poolMax={max ?? 10} />
            <TimelinePanel events={timeline.events} />
          </div>
        </div>
      </main>
    </div>
  );
}

import { ExternalLink, OctagonAlert, Pause, Play } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { usePolling } from '../../hooks/usePolling';
import { api, type RequestRecord } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatClock, formatMs } from '../../lib/format';
import { TimingBar } from './TimingBar';

type Filter = 'all' | 'errors' | 'slow';
const SLOW_MS = 1000;
const JAEGER = 'http://localhost:16686/trace/';

function StatusCell({ status }: { status: number }) {
  const bad = status >= 500;
  return (
    <span className={cn('num inline-flex items-center gap-1', bad ? 'text-danger' : status >= 400 ? 'text-warning' : 'text-text')}>
      {bad && <OctagonAlert size={12} aria-hidden />}
      {status}
    </span>
  );
}

export function RequestExplorer() {
  const [filter, setFilter] = useState<Filter>('all');
  // While paused, the table shows a snapshot taken at the moment of pausing.
  const [snapshot, setSnapshot] = useState<RequestRecord[] | null>(null);
  const [selected, setSelected] = useState<RequestRecord | null>(null);

  const poll = usePolling(useCallback((signal: AbortSignal) => api.getRequests(200, signal), []), 2000);
  const paused = snapshot !== null;
  const all = snapshot ?? poll.data?.requests ?? [];
  const rows = all
    .filter((r) => (filter === 'errors' ? r.status >= 500 : filter === 'slow' ? r.durationMs >= SLOW_MS : true))
    .slice(0, 50);

  return (
    <Card
      title="Request explorer"
      description="Most recent API requests (newest first). Select one for its timing breakdown."
      bodyClassName="p-0"
      actions={
        <>
          <SegmentedControl<Filter>
            label="Filter requests"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'errors', label: '5xx' },
              { value: 'slow', label: '≥ 1s' },
            ]}
          />
          <Button size="sm" variant="ghost" onClick={() => setSnapshot(paused ? null : all)} aria-pressed={paused}>
            {paused ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-5">
        <div className="col-span-3 max-h-[420px] overflow-y-auto border-r border-border">
          {poll.loading ? (
            <LoadingState />
          ) : poll.error && !poll.data ? (
            <ErrorState detail={poll.error.message} />
          ) : rows.length === 0 ? (
            <EmptyState title="No requests" detail={filter === 'all' ? 'Start the load generator or run k6.' : 'Nothing matches this filter.'} />
          ) : (
            <table className="w-full table-fixed text-left text-xs">
              <thead className="sticky top-0 bg-surface text-text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="w-[88px] px-4 py-2 font-medium">Time</th>
                  <th scope="col" className="w-[92px] py-2 pr-3 font-medium">Request ID</th>
                  <th scope="col" className="py-2 font-medium">Route</th>
                  <th scope="col" className="w-[52px] py-2 font-medium">Status</th>
                  <th scope="col" className="w-[72px] py-2 text-right font-medium">Total</th>
                  <th scope="col" className="w-[92px] whitespace-nowrap px-4 py-2 text-right font-medium">Conn wait</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isSelected = selected?.requestId === r.requestId;
                  const waitShare = r.timings.acquireMs / Math.max(r.durationMs, 1);
                  return (
                    <tr
                      key={r.requestId}
                      tabIndex={0}
                      aria-selected={isSelected}
                      onClick={() => setSelected(r)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(r))}
                      className={cn(
                        'cursor-pointer border-b border-border transition-colors last:border-b-0',
                        isSelected ? 'bg-accent/10' : 'hover:bg-surface-2',
                      )}
                    >
                      <td className="num px-4 py-1.5 text-text-muted">{formatClock(r.finishedAt)}</td>
                      <td className="num truncate py-1.5 pr-3 text-text-muted" title={r.requestId}>
                        {r.requestId.slice(0, 8)}
                      </td>
                      <td className="truncate py-1.5 text-text">
                        <span className="text-text-muted">{r.method}</span> {r.route}
                      </td>
                      <td className="py-1.5">
                        <StatusCell status={r.status} />
                      </td>
                      <td className="num py-1.5 text-right text-text">{formatMs(r.durationMs)}</td>
                      <td className={cn('num px-4 py-1.5 text-right', waitShare > 0.5 ? 'font-medium text-danger' : 'text-text-muted')}>
                        {formatMs(r.timings.acquireMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="col-span-2 p-4">
          {selected ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-text">
                  {selected.method} {selected.route} · <StatusCell status={selected.status} /> · <span className="num">{formatMs(selected.durationMs)}</span>
                </p>
                <p className="num break-all text-xs text-text-muted">{selected.requestId}</p>
                {selected.errorClass && <p className="text-xs text-danger">{selected.errorClass}</p>}
              </div>
              <TimingBar record={selected} />
              {selected.traceId ? (
                <a
                  href={`${JAEGER}${selected.traceId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  Open trace in Jaeger <ExternalLink size={12} aria-hidden />
                </a>
              ) : (
                <p className="text-xs text-text-muted">No trace recorded for this request.</p>
              )}
            </div>
          ) : (
            <EmptyState title="No request selected" detail="Select a row to see where its time went." />
          )}
        </div>
      </div>
    </Card>
  );
}

import { TriangleAlert } from 'lucide-react';
import { useCallback } from 'react';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { usePolling } from '../../hooks/usePolling';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';

const ORDER = ['active', 'idle in transaction', 'idle in transaction (aborted)', 'idle'];

export function DbSessionsPanel({ poolMax }: { poolMax: number }) {
  const poll = usePolling(useCallback((signal: AbortSignal) => api.getDbSessions(signal), []), 2000);
  const rows = [...(poll.data?.sessions ?? [])].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
  const stuck = rows.find((r) => r.state === 'idle in transaction');

  return (
    <Card title="Postgres sessions" description="pg_stat_activity for the API's connections, by state">
      {poll.loading ? (
        <LoadingState />
      ) : poll.error && !poll.data ? (
        <ErrorState detail={poll.error.message} />
      ) : rows.length === 0 ? (
        <EmptyState title="No sessions" detail="The API has no open connections right now." />
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {rows.map((r) => {
              const warn = r.state.startsWith('idle in transaction');
              return (
                <li key={r.state}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className={cn('flex items-center gap-1', warn ? 'font-medium text-warning' : 'text-text-muted')}>
                      {warn && <TriangleAlert size={12} aria-hidden />}
                      {r.state}
                    </span>
                    <span className="num text-text">
                      {r.count}
                      {warn && r.oldestXactSec > 0 && <span className="text-text-muted"> · oldest {r.oldestXactSec.toFixed(1)}s</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                    <div
                      className={cn('h-full rounded-full transition-[width]', warn ? 'bg-warning' : r.state === 'active' ? 'bg-success' : 'bg-accent/50')}
                      style={{ width: `${Math.min(100, (r.count / poolMax) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {stuck && stuck.count > 0 && (
            <p className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text">
              {stuck.count} connection{stuck.count === 1 ? ' is' : 's are'} inside an open transaction but not running SQL: the
              application is holding them while it waits on something else.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

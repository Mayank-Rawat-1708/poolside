import { Activity, SlidersHorizontal } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/States';
import { formatClock } from '../../lib/format';
import type { TimelineEvent } from './useTimeline';

export function TimelinePanel({ events }: { events: TimelineEvent[] }) {
  return (
    <Card title="Incident timeline" description="Status changes and scenario toggles, newest first" bodyClassName="p-0">
      {events.length === 0 ? (
        <EmptyState title="Nothing yet" detail="Status transitions and scenario changes are recorded here automatically." />
      ) : (
        <ol className="max-h-[420px] overflow-y-auto">
          {events.map((e) => {
            const Icon = e.kind === 'status' ? Activity : SlidersHorizontal;
            return (
              <li key={e.id} className="flex gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                <span className="num w-16 shrink-0 pt-px text-xs text-text-muted">{formatClock(e.at)}</span>
                <Icon size={14} className="mt-0.5 shrink-0 text-text-muted" aria-label={e.kind} />
                <div className="min-w-0">
                  <p className="text-sm text-text">{e.label}</p>
                  {e.detail && <p className="truncate text-xs text-text-muted" title={e.detail}>{e.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

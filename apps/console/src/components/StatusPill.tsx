import { CheckCircle2, CircleHelp, OctagonAlert, TriangleAlert } from 'lucide-react';
import { cn } from '../lib/cn';
import type { Status } from '../lib/status';

const STYLES: Record<Status, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  healthy: { label: 'Healthy', className: 'text-success bg-success/10 border-success/30', Icon: CheckCircle2 },
  degraded: { label: 'Degraded', className: 'text-warning bg-warning/10 border-warning/30', Icon: TriangleAlert },
  failing: { label: 'Failing', className: 'text-danger bg-danger/10 border-danger/30', Icon: OctagonAlert },
  unknown: { label: 'No data', className: 'text-text-muted bg-surface-2 border-border', Icon: CircleHelp },
};

// Color is never the only signal: each status has its own icon and label.
export function StatusPill({ status, reasons }: { status: Status; reasons: string[] }) {
  const { label, className, Icon } = STYLES[status];
  return (
    <div className="flex min-w-0 items-center gap-2" aria-live="polite">
      <span className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors', className)}>
        <Icon size={14} aria-hidden />
        {label}
      </span>
      <span className="truncate text-xs text-text-muted" title={reasons.join(' · ')}>
        {reasons.join(' · ')}
      </span>
    </div>
  );
}

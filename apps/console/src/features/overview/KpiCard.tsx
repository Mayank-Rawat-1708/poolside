import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Sparkline } from '../../components/charts/Sparkline';
import type { Tone } from '../../components/charts/tokens';
import { Skeleton } from '../../components/ui/States';
import { cn } from '../../lib/cn';
import type { Point } from '../../lib/prom';

export type Level = 'ok' | 'warn' | 'bad' | 'neutral';

const LEVEL: Record<Level, { tone: Tone; text: string; icon: ReactNode; label: string }> = {
  ok: { tone: 'success', text: 'text-text', icon: <CircleCheck size={14} className="text-success" aria-hidden />, label: 'normal' },
  warn: { tone: 'warning', text: 'text-warning', icon: <TriangleAlert size={14} className="text-warning" aria-hidden />, label: 'elevated' },
  bad: { tone: 'danger', text: 'text-danger', icon: <OctagonAlert size={14} className="text-danger" aria-hidden />, label: 'critical' },
  neutral: { tone: 'accent', text: 'text-text', icon: null, label: '' },
};

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  level: Level;
  points: Point[];
  loading: boolean;
}

export function KpiCard({ label, value, unit, hint, level, points, loading }: KpiCardProps) {
  const l = LEVEL[level];
  return (
    <div className="rounded-lg border border-border bg-surface px-4 pb-2 pt-3">
      <div className="flex h-4 items-center justify-between">
        <p className="text-xs font-medium text-text-muted">{label}</p>
        {l.icon && (
          <span className="flex items-center gap-1" title={l.label}>
            {l.icon}
            <span className="sr-only">{l.label}</span>
          </span>
        )}
      </div>
      <div className="mt-1.5 flex h-8 items-baseline gap-1">
        {loading ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <>
            <span className={cn('num text-2xl font-medium transition-colors', l.text)}>{value}</span>
            {unit && <span className="text-xs text-text-muted">{unit}</span>}
            {hint && <span className="num ml-auto text-xs text-text-muted">{hint}</span>}
          </>
        )}
      </div>
      <div className="mt-1">
        <Sparkline points={points} tone={l.tone} />
      </div>
    </div>
  );
}

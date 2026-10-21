// The same empty / loading / error treatment for every panel.
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

function Frame({ icon, title, detail, tone, className }: { icon: ReactNode; title: string; detail?: ReactNode; tone: 'muted' | 'danger'; className?: string }) {
  return (
    <div className={cn('flex h-full min-h-24 flex-col items-center justify-center gap-1.5 px-4 py-6 text-center', className)}>
      <span className={tone === 'danger' ? 'text-danger' : 'text-text-muted'}>{icon}</span>
      <p className="text-sm font-medium text-text">{title}</p>
      {detail && <p className="max-w-xs text-xs text-text-muted">{detail}</p>}
    </div>
  );
}

export function EmptyState({ title, detail, className }: { title: string; detail?: ReactNode; className?: string }) {
  return <Frame icon={<Inbox size={18} aria-hidden />} title={title} detail={detail} tone="muted" className={className} />;
}

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={className}>
      <Frame icon={<Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />} title={label} tone="muted" />
    </div>
  );
}

export function ErrorState({ title = 'Could not load data', detail, className }: { title?: string; detail?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={className}>
      <Frame icon={<AlertTriangle size={18} aria-hidden />} title={title} detail={detail} tone="danger" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-surface-2 motion-reduce:animate-none', className)} />;
}

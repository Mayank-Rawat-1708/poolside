import { ExternalLink, Waves } from 'lucide-react';
import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';

const TOOLS = [
  { label: 'Grafana', href: 'http://localhost:3001/d/service-overview' },
  { label: 'Jaeger', href: 'http://localhost:16686/search?service=poolside-api' },
  { label: 'Prometheus', href: 'http://localhost:9090' },
];

export function Header({ status }: { status?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-accent text-accent-fg">
            <Waves size={16} aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">PoolSide</p>
            <p className="text-2xs text-text-muted">Operator console</p>
          </div>
        </div>
        {status}
        <nav aria-label="Observability tools" className="ml-auto flex items-center gap-1">
          {TOOLS.map((tool) => (
            <a
              key={tool.label}
              href={tool.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              {tool.label}
              <ExternalLink size={12} aria-hidden />
            </a>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}

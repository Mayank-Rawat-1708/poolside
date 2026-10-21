import { Play, Square } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Slider } from '../../components/ui/Slider';
import { cn } from '../../lib/cn';
import { formatMs, formatRate } from '../../lib/format';
import { useLoadGenerator } from './useLoadGenerator';

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className={cn('num text-sm text-text', className)}>{value}</p>
    </div>
  );
}

export function LoadGeneratorPanel({ onEvent }: { onEvent: (label: string) => void }) {
  const [concurrency, setConcurrency] = useState(20);
  const { stats, start, stop } = useLoadGenerator(concurrency);

  const toggle = async () => {
    if (stats.running) {
      stop();
      onEvent('Load generator stopped');
    } else {
      await start();
      onEvent(`Load generator started (${concurrency} workers)`);
    }
  };

  const total = Object.values(stats.counts).reduce((a, b) => a + b, 0);
  const failed = stats.counts['5xx'] + stats.counts.timeout;

  return (
    <Card
      title="Load generator"
      description="In-browser, closed loop, same mix as k6. k6 is the source of truth for evidence."
      actions={
        <Button variant={stats.running ? 'danger' : 'primary'} size="sm" onClick={toggle} aria-pressed={stats.running}>
          {stats.running ? <Square size={12} aria-hidden /> : <Play size={12} aria-hidden />}
          {stats.running ? 'Stop' : 'Start'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Slider label="Concurrent workers" min={1} max={60} step={1} value={concurrency} format={(v) => String(v)} onChange={setConcurrency} />
        <div className="grid grid-cols-4 gap-3">
          <Stat label="In flight" value={String(stats.inFlight)} />
          <Stat label="Req/s" value={formatRate(stats.rps)} />
          <Stat label="p95" value={formatMs(stats.p95Ms)} />
          <Stat label="Failed" value={total ? `${Math.round((failed / total) * 100)}%` : '—'} className={failed ? 'text-danger' : undefined} />
        </div>
        <p className="num text-xs text-text-muted">
          last 5s: {stats.counts['2xx']} ok · {stats.counts['4xx']} 4xx · {stats.counts['5xx']} 5xx · {stats.counts.timeout} timeout
        </p>
        {stats.running && !stats.sharded && concurrency > 6 && (
          <p className="text-xs text-warning">
            Sharding unavailable: the browser caps this origin at ~6 concurrent requests. Open the console at http://localhost:8080.
          </p>
        )}
      </div>
    </Card>
  );
}

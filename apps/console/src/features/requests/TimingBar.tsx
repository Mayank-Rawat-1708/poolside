import { color, type Tone } from '../../components/charts/tokens';
import { formatMs } from '../../lib/format';
import type { RequestRecord } from '../../lib/api';

const PARTS: { key: 'acquireMs' | 'queryMs' | 'downstreamMs' | 'otherMs'; label: string; tone: Tone }[] = [
  { key: 'acquireMs', label: 'Waiting for connection', tone: 'danger' },
  { key: 'queryMs', label: 'SQL', tone: 'success' },
  { key: 'downstreamMs', label: 'Payments call', tone: 'accent' },
  { key: 'otherMs', label: 'Other (app, serialization)', tone: 'text-muted' },
];

// Stages are sequential, so they add up to (at most) the request duration.
export function TimingBar({ record }: { record: RequestRecord }) {
  const { acquireMs, queryMs, downstreamMs } = record.timings;
  const values = { acquireMs, queryMs, downstreamMs, otherMs: Math.max(0, record.durationMs - acquireMs - queryMs - downstreamMs) };
  const total = Math.max(record.durationMs, 1);

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-sm bg-surface-2" role="img" aria-label="Request time breakdown">
        {PARTS.map((p) => (
          <div key={p.key} title={`${p.label}: ${formatMs(values[p.key])}`} style={{ width: `${(values[p.key] / total) * 100}%`, background: color(p.tone) }} />
        ))}
      </div>
      <dl className="space-y-1.5">
        {PARTS.map((p) => (
          <div key={p.key} className="flex items-center justify-between gap-2 text-xs">
            <dt className="flex items-center gap-1.5 text-text-muted">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color(p.tone) }} aria-hidden />
              {p.label}
            </dt>
            <dd className="num text-text">
              {formatMs(values[p.key])} <span className="text-text-muted">({Math.round((values[p.key] / total) * 100)}%)</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { formatClock } from '../../lib/format';
import type { Series } from '../../lib/prom';
import { CHART, color, type Tone } from './tokens';

export interface SeriesSpec {
  key: string;
  label: string;
  tone: Tone;
  dashed?: boolean;
  data: Series[] | undefined; // first series is used
}

export interface Marker {
  t: number;
  label: string;
}

interface Props {
  series: SeriesSpec[];
  format: (v: number) => string;
  // Every chart shows the same fixed window, ending at the latest poll.
  window: { start: number; end: number };
  markers?: Marker[];
  height?: number;
}

// Round y ticks (0, 0.5, 1, 1.5 … or 0, 2, 4 …) so axes stay calm.
function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= raw) ?? 10) * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

// One tick per minute boundary inside [start, end].
function minuteTicks(start: number, end: number): number[] {
  const ticks: number[] = [];
  for (let t = Math.ceil(start / 60_000) * 60_000; t <= end; t += 60_000) ticks.push(t);
  return ticks;
}

type Row = { t: number } & Record<string, number | null>;

// Series share Prometheus' step grid, so rows can be joined on timestamp.
function toRows(series: SeriesSpec[]): Row[] {
  const rows = new Map<number, Row>();
  for (const s of series) {
    for (const [t, v] of s.data?.[0]?.points ?? []) {
      const row = rows.get(t) ?? ({ t } as Row);
      row[s.key] = v;
      rows.set(t, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

function ChartTooltip({ active, payload, label, specs, format }: TooltipProps<number, string> & { specs: SeriesSpec[]; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="num mb-1 text-text-muted">{formatClock(Number(label))}</p>
      {specs.map((spec) => {
        const value = payload.find((p) => p.dataKey === spec.key)?.value;
        return (
          <p key={spec.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-text-muted">
              <span className="inline-block h-0.5 w-3" style={{ background: color(spec.tone) }} aria-hidden />
              {spec.label}
            </span>
            <span className="num text-text">{typeof value === 'number' ? format(value) : '—'}</span>
          </p>
        );
      })}
    </div>
  );
}

export function TimeSeriesChart({ series, format, window, markers = [], height = 180 }: Props) {
  const rows = toRows(series);
  const { start, end } = window;
  const yMax = Math.max(0, ...rows.flatMap((r) => series.map((s) => r[s.key] ?? 0)));
  const yTicks = niceTicks(yMax);
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, end]}
              ticks={minuteTicks(start, end)}
              tickFormatter={(t: number) => formatClock(t).slice(0, 5)}
              tick={{ fill: CHART.axis, fontSize: 11 }}
              stroke={CHART.grid}
              tickLine={false}
            />
            <YAxis
              width={56}
              domain={[0, yTicks[yTicks.length - 1] ?? 1]}
              ticks={yTicks}
              tickFormatter={(v: number) => format(v)}
              tick={{ fill: CHART.axis, fontSize: 11 }}
              stroke="transparent"
              tickLine={false}
              allowDecimals
            />
            <Tooltip content={<ChartTooltip specs={series} format={format} />} cursor={{ stroke: CHART.cursor }} isAnimationActive={false} />
            {markers.map((m) => (
              <ReferenceLine key={`${m.t}-${m.label}`} x={m.t} stroke={color('text-muted', 0.6)} strokeDasharray="2 3" ifOverflow="hidden" />
            ))}
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={color(s.tone)}
                strokeWidth={s.dashed ? 1.25 : 1.75}
                strokeDasharray={s.dashed ? '4 4' : undefined}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Legend with line style, so series are distinguishable without color. */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs text-text-muted">
            <svg width="14" height="4" aria-hidden>
              <line x1="0" y1="2" x2="14" y2="2" stroke={color(s.tone)} strokeWidth="2" strokeDasharray={s.dashed ? '3 2' : undefined} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

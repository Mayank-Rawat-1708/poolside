import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import type { Point } from '../../lib/prom';
import { color, type Tone } from './tokens';

export function Sparkline({ points, tone }: { points: Point[]; tone: Tone }) {
  const data = points.map(([t, v]) => ({ t, v }));
  return (
    <div className="h-8" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={[0, 'auto']} />
          <Area dataKey="v" stroke={color(tone)} strokeWidth={1.5} fill={color(tone, 0.12)} isAnimationActive={false} connectNulls={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

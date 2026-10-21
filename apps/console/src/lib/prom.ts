// Minimal Prometheus HTTP API client (proxied at /prom by nginx / Vite).

export type Point = [t: number, v: number | null];

interface RangeResponse {
  status: string;
  error?: string;
  data: { result: { metric: Record<string, string>; values: [number, string][] }[] };
}

export interface Series {
  labels: Record<string, string>;
  points: Point[];
}

function toNumber(raw: string): number | null {
  const v = Number(raw);
  return Number.isFinite(v) ? v : null; // NaN/Inf (e.g. no traffic) -> gap
}

export async function queryRange(expr: string, seconds: number, step: number, signal?: AbortSignal): Promise<Series[]> {
  const end = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({ query: expr, start: String(end - seconds), end: String(end), step: String(step) });
  const res = await fetch(`/prom/api/v1/query_range?${params}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as RangeResponse;
  if (body.status !== 'success') throw new Error(body.error ?? 'Prometheus query failed');
  return body.data.result.map((r) => ({
    labels: r.metric,
    points: r.values.map(([t, v]) => [t * 1000, toNumber(v)] as Point),
  }));
}

export function lastValue(series: Series[] | undefined): number | null {
  const points = series?.[0]?.points;
  if (!points?.length) return null;
  for (let i = points.length - 1; i >= Math.max(0, points.length - 3); i--) {
    const v = points[i]?.[1];
    if (v != null) return v;
  }
  return null;
}

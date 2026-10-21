// Formatting helpers. Fixed decimals keep tabular numbers from jittering.
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 100) return `${ms.toFixed(0)} ms`;
  return `${ms.toFixed(1)} ms`;
}

export function formatSeconds(s: number | null | undefined): string {
  return s == null ? '—' : formatMs(s * 1000);
}

export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction == null || !Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatRate(perSecond: number | null | undefined): string {
  if (perSecond == null || !Number.isFinite(perSecond)) return '—';
  return perSecond.toFixed(1);
}

export function formatClock(date: Date | number | string): string {
  return new Date(date).toLocaleTimeString([], { hour12: false });
}

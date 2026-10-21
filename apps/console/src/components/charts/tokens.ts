// Chart colors reference the same CSS tokens as everything else, so charts
// re-theme instantly when data-theme flips (no re-render needed).
export type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'text-muted' | 'text';

export const color = (tone: Tone, alpha = 1) => `rgb(var(--color-${tone}) / ${alpha})`;

export const CHART = {
  grid: color('text-muted', 0.15),
  axis: color('text-muted'),
  cursor: color('text-muted', 0.4),
};

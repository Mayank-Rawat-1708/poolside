import { useId } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function Slider({ label, value, min, max, step, format, onChange, disabled }: SliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-xs font-medium text-text-muted">
          {label}
        </label>
        <span className="num text-xs text-text">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: `linear-gradient(to right, rgb(var(--color-accent)) ${pct}%, rgb(var(--color-surface-2)) ${pct}%)`,
        }}
      />
    </div>
  );
}

import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string; // accessible name of the group
  size?: 'sm' | 'md';
}

// A radio group styled as segmented buttons; arrow keys move the selection.
export function SegmentedControl<T extends string>({ value, options, onChange, label, size = 'md' }: SegmentedControlProps<T>) {
  const index = options.findIndex((o) => o.value === value);
  const move = (group: HTMLElement, delta: number) => {
    const nextIndex = (index + delta + options.length) % options.length;
    const next = options[nextIndex];
    if (!next) return;
    onChange(next.value);
    group.querySelectorAll<HTMLElement>('[role="radio"]')[nextIndex]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded border border-border bg-surface-2 p-0.5"
      onKeyDown={(e) => {
        const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (delta === undefined) return;
        e.preventDefault();
        move(e.currentTarget, delta);
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm font-medium transition-colors',
              size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-3 text-sm',
              selected ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

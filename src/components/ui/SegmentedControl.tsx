import React, { useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export function segmentTabClass(active: boolean, className?: string) {
  return cn(
    'px-3.5 py-2 rounded-md text-[13px] transition-colors duration-150 flex items-center gap-2 whitespace-nowrap',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    active
      ? 'bg-card text-text-primary font-medium shadow-sm ring-1 ring-border'
      : 'bg-transparent text-text-secondary font-medium hover:text-text-primary hover:bg-surface',
    className,
  );
}

export function segmentTrackClass(className?: string) {
  return cn(
    'flex overflow-x-auto no-scrollbar bg-surface-muted p-1 rounded-lg w-full md:w-max gap-0.5',
    className,
  );
}

type SegmentOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
};

type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  trackClassName?: string;
  'aria-label'?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  trackClassName,
  'aria-label': ariaLabel = 'Pilihan tampilan',
}: SegmentedControlProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  const focusIndex = (index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[index]?.focus();
  };

  const move = (from: number, key: string) => {
    if (!options.length) return;
    let next = from;
    if (key === 'ArrowRight' || key === 'ArrowDown') next = (from + 1) % options.length;
    else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (from - 1 + options.length) % options.length;
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = options.length - 1;
    else return;
    onChange(options[next].value);
    focusIndex(next);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(segmentTrackClass(trackClassName), className)}
    >
      {options.map((opt, index) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(event) => {
              if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                move(index, event.key);
              }
            }}
            className={segmentTabClass(active)}
          >
            {Icon ? <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

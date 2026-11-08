import React, { useLayoutEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export function segmentTabClass(active: boolean, className?: string) {
  return cn(
    'px-3.5 py-1.5 rounded-[9px] text-[13px] transition-colors duration-200 flex items-center gap-2 whitespace-nowrap',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    active
      ? 'bg-card text-text-primary font-semibold shadow-sm ring-1 ring-black/5'
      : 'bg-transparent text-text-secondary font-medium hover:text-text-primary hover:bg-surface',
    className,
  );
}

export function segmentTrackClass(className?: string) {
  return cn(
    'flex overflow-x-auto no-scrollbar bg-surface-muted p-[3px] rounded-[12px] w-full md:w-max gap-0.5',
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
  // Sliding thumb: measured from the active tab so it glides between options.
  const [thumb, setThumb] = useState<{ left: number; width: number; ready: boolean } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
      if (!active) return setThumb(null);
      setThumb((prev) => ({ left: active.offsetLeft, width: active.offsetWidth, ready: prev !== null }));
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(list);
    return () => observer?.disconnect();
  }, [value, options.length]);

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
      className={cn(segmentTrackClass(trackClassName), 'relative', className)}
    >
      {thumb && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-[3px] bottom-[3px] rounded-[9px] bg-card shadow-sm ring-1 ring-black/5',
            thumb.ready && 'transition-[left,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          )}
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
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
            className={cn(
              'relative z-10 px-3.5 py-1.5 rounded-[9px] text-[13px] transition-colors duration-200 flex items-center gap-2 whitespace-nowrap',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              active ? 'text-text-primary font-semibold' : 'text-text-secondary font-medium hover:text-text-primary',
            )}
          >
            {Icon ? <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

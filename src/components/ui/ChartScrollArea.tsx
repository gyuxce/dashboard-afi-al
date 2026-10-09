import React from 'react';
import { cn } from '../../lib/utils';

type ChartScrollAreaProps = {
  children: React.ReactNode;
  /** Extra classes on the outer wrapper */
  className?: string;
  /** Classes for the inner sized chart canvas (include height + min-width) */
  canvasClassName?: string;
  hint?: string;
};

/** Mobile-only scroll affordance for wide charts/tables. */
export function MobileScrollHint({
  label = 'Geser → untuk lihat semua kolom',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <p className={cn('mb-1.5 text-[10px] font-medium text-text-muted md:hidden', className)}>
      {label}
    </p>
  );
}

/**
 * Horizontal scroll wrapper for wide charts.
 * Shows a mobile-only “Geser →” hint so users know more content exists off-screen.
 */
export function ChartScrollArea({
  children,
  className,
  canvasClassName = 'h-[280px] min-w-[700px]',
  hint = 'Geser → untuk lihat semua kolom',
}: ChartScrollAreaProps) {
  return (
    <div className={cn('relative w-full min-w-0', className)}>
      <MobileScrollHint label={hint} />
      <div className="w-full overflow-x-auto pb-1">
        <div className={canvasClassName}>{children}</div>
      </div>
    </div>
  );
}

import React from 'react';
import { cn } from '../../lib/utils';

type TabSkeletonProps = {
  className?: string;
  /** Compact variant for inline overlays */
  compact?: boolean;
};

/** Soft placeholder while lazy tab chunks load — quieter than a full spinner. */
export function TabSkeleton({ className, compact = false }: TabSkeletonProps) {
  return (
    <div
      className={cn('w-full animate-pulse', compact ? 'space-y-3 py-2' : 'space-y-5 py-1', className)}
      role="status"
      aria-live="polite"
      aria-label="Memuat tampilan"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: compact ? 2 : 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-border bg-surface-muted/80" />
        ))}
      </div>
      {!compact && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="h-64 rounded-lg border border-border bg-surface-muted/70" />
            <div className="h-64 rounded-lg border border-border bg-surface-muted/70" />
          </div>
          <div className="h-40 rounded-lg border border-border bg-surface-muted/60" />
        </>
      )}
      <span className="sr-only">Memuat tampilan...</span>
    </div>
  );
}

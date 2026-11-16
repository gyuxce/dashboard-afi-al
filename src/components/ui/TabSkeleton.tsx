import React from 'react';
import { cn } from '../../lib/utils';
import { Card } from './Card';
import { Skeleton } from './Skeleton';

type TabSkeletonProps = {
  className?: string;
  /** Compact variant for inline overlays */
  compact?: boolean;
};

/** Placeholder while a lazy tab chunk (or its first calculation) loads: the same card skeleton as the boot screen. */
export function TabSkeleton({ className, compact = false }: TabSkeletonProps) {
  return (
    <div className={cn('w-full', compact ? 'space-y-3 py-2' : 'space-y-5 py-1', className)} role="status" aria-live="polite" aria-label="Memuat tampilan">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {Array.from({ length: compact ? 2 : 4 }).map((_, i) => (
          <Card key={i} size="sm" className="space-y-3">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-9 w-4/5" />
          </Card>
        ))}
      </div>
      {!compact && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Skeleton className="h-64 rounded-[28px]" />
          <Skeleton className="h-64 rounded-[28px]" />
        </div>
      )}
      <span className="sr-only">Memuat tampilan...</span>
    </div>
  );
}

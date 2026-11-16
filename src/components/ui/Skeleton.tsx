import React from 'react';
import { cn } from '../../lib/utils';

/** Shimmering placeholder block; size it with utility classes (h-*, w-*). */
export function Skeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('ui-skeleton', className)} {...rest} />;
}

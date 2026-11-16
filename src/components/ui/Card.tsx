import React from 'react';
import { cn } from '../../lib/utils';

type CardProps = React.HTMLAttributes<HTMLElement> & {
  /** Element to render; sections for page blocks, article for list items. */
  as?: React.ElementType;
  /** `lg` = page-level card (28px radius), `sm` = compact stat card (24px). */
  size?: 'lg' | 'sm';
  /** Translucent variant for quiet strips (attention bar, filter bar) that should not compete with data cards. */
  flat?: boolean;
};

/**
 * The one card of the Apple-style UI: plain white, no tinted background (colour is reserved for numbers, pills and charts),
 * very soft shadow. Styling lives in index.css (`.ui-card`) so legacy markup can share it.
 */
export function Card({ as: Tag = 'section', size = 'lg', flat = false, className, ...rest }: CardProps) {
  return <Tag className={cn('ui-card', size === 'sm' && 'ui-card-sm', flat && 'ui-card-flat', className)} {...rest} />;
}

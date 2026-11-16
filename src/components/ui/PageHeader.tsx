import React from 'react';
import { cn } from '../../lib/utils';

type PageHeaderProps = {
  /** Small line above the title: section + period, or the date. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-hand controls (search, segmented controls, buttons). */
  actions?: React.ReactNode;
  className?: string;
};

/** Page opener used by every tab: eyebrow, large title, one-line subtitle, optional controls on the right. */
export function PageHeader({ eyebrow, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="ui-eyebrow">{eyebrow}</div>}
        <h1 className="ui-title">{title}</h1>
        {subtitle && <p className="ui-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

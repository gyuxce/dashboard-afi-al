import React from 'react';
import { cn } from '../../lib/utils';
import { Card } from './Card';

export type StatTone = 'ink' | 'good' | 'warn' | 'bad' | 'info' | 'muted';

/**
 * Number colour only ever carries meaning: `bad` = below target, `warn` = almost, `good` / `info` = positive or neutral highlight.
 * Everything else stays `ink`.
 */
const TONE_CLASS: Record<StatTone, string> = {
  ink: 'text-text-primary',
  good: 'text-success-text',
  warn: 'text-warning-text',
  bad: 'text-danger-text',
  info: 'text-primary-text',
  muted: 'text-text-muted',
};

type StatCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Small suffix next to the number ("/ 5", "chat"). */
  unit?: React.ReactNode;
  /** Line under the number. */
  sub?: React.ReactNode;
  tone?: StatTone;
  /** `lg` = headline number, `md` = card inside a dense grid. */
  size?: 'lg' | 'md';
  /** Top-right slot (pill, info icon). */
  aside?: React.ReactNode;
  /** Bottom slot (sparkline, bar). */
  footer?: React.ReactNode;
  className?: string;
};

/** Label, huge number, one supporting line. The building block of every summary row. */
export function StatCard({ label, value, unit, sub, tone = 'ink', size = 'lg', aside, footer, className }: StatCardProps) {
  return (
    <Card as="article" size={size === 'md' ? 'sm' : 'lg'} className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="ui-card-label">{label}</span>
        {aside}
      </div>
      <div className={cn('ui-stat-value tabular-nums', size === 'md' ? 'ui-stat-md' : 'ui-stat-lg', TONE_CLASS[tone])}>
        {value}
        {unit && <span className="ui-stat-unit">{unit}</span>}
      </div>
      {sub && <div className="text-[13px] leading-snug text-text-secondary">{sub}</div>}
      {footer}
    </Card>
  );
}

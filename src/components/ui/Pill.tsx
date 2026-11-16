import React from 'react';
import { cn } from '../../lib/utils';

export type PillTone = 'neutral' | 'info' | 'good' | 'warn' | 'bad' | 'purple';

type PillProps = React.HTMLAttributes<HTMLSpanElement> & { tone?: PillTone };

/** Small rounded badge ("sample", "187 akun", "Di bawah target"). Tone follows the same meaning rules as numbers. */
export function Pill({ tone = 'neutral', className, ...rest }: PillProps) {
  return <span className={cn('ui-pill', `ui-pill-${tone}`, className)} {...rest} />;
}

import React from 'react';
import { cn } from '../../lib/utils';

type BrandLoadingProps = {
  title?: string;
  subtitle?: string;
  className?: string;
  /** Full-screen centered layout */
  fullscreen?: boolean;
};

/** Playful brand loader: favicon character "walks" while waiting. */
export function BrandLoading({
  title = 'Mohon menunggu...',
  subtitle = 'Sedang menyiapkan dashboard',
  className,
  fullscreen = false,
}: BrandLoadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        fullscreen && 'min-h-screen w-full bg-background px-6',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="relative mb-5 flex h-20 w-40 items-end justify-center overflow-hidden">
        <div className="pointer-events-none absolute inset-x-4 bottom-1 h-px bg-border" />
        <img
          src="/logo.png"
          alt=""
          className="brand-walk-logo h-16 w-16 object-contain drop-shadow-sm"
          draggable={false}
        />
      </div>
      <p className="text-base font-semibold text-text-primary">{title}</p>
      {subtitle ? <p className="mt-1 text-sm text-text-muted">{subtitle}</p> : null}
      <div className="mt-4 flex items-center gap-1.5" aria-hidden>
        <span className="brand-dot h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="brand-dot h-1.5 w-1.5 rounded-full bg-primary [animation-delay:160ms]" />
        <span className="brand-dot h-1.5 w-1.5 rounded-full bg-primary [animation-delay:320ms]" />
      </div>
    </div>
  );
}

import React from 'react';

/** Bar of `value` out of 100 with a tick at `target`; red below target, neutral blue at or above it. */
export const ProgressBarMarker: React.FC<{ value: number; target: number }> = ({ value, target }) => (
  <div className="relative h-2 rounded-full bg-black/[0.07]" title={`${value.toFixed(2)}% · target ${target}%`}>
    <div
      className={`bar-fill h-full rounded-full ${value >= target ? 'bg-primary' : value >= target * 0.95 ? 'bg-warning' : 'bg-danger'}`}
      style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
    />
    <div className="absolute -top-0.5 h-3 w-px bg-text-secondary" style={{ left: `${target}%` }} aria-hidden />
  </div>
);

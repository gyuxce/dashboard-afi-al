import type React from 'react';
import { getKpiColor, getKpiStatus, type KpiStatus, type KpiType } from '../../lib/utils';

/**
 * Shape cue that rides alongside the coloured KPI value — a filled ▼ for a
 * miss, a dot for watch, nothing when on target. Carries the meaning for
 * colour-blind viewers and on dark screens where red/amber sit close.
 */
export function KpiCue({ status, className = '' }: { status: KpiStatus; className?: string }) {
  if (status === 'miss') {
    return (
      <svg
        viewBox="0 0 10 10"
        width="8"
        height="8"
        aria-hidden="true"
        className={`shrink-0 fill-danger ${className}`}
      >
        <path d="M5 9 1 3h8z" />
      </svg>
    );
  }
  if (status === 'watch') {
    return (
      <span
        aria-hidden="true"
        className={`inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-warning ${className}`}
      />
    );
  }
  return null;
}

/**
 * A KPI number with its discipline colour + shape cue in one place.
 * `text` is the formatted display (e.g. "91.5%"); falls back to the raw value.
 */
export function KpiValue({
  value,
  type,
  text,
  className = '',
}: {
  value: number | null | undefined;
  type: KpiType;
  text?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${getKpiColor(value, type)} ${className}`}>
      {text ?? (value ?? '-')}
      <KpiCue status={getKpiStatus(value, type)} />
    </span>
  );
}

/** One-line key for a table of coloured KPI values. */
export function KpiLegend({ label = 'Warna', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-text-muted ${className}`}>
      <span className="font-semibold text-text-secondary">{label}</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-[7px] w-[7px] rounded-full bg-text-muted" />
        sesuai target &mdash; netral
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-[7px] w-[7px] rounded-full bg-warning" />
        watch &mdash; dalam 5% di bawah
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 10 10" width="8" height="8" className="fill-danger" aria-hidden="true">
          <path d="M5 9 1 3h8z" />
        </svg>
        di bawah target
      </span>
    </div>
  );
}

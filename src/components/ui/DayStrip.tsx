import React from 'react';
import { formatNum, getKpiStatus, type KpiType } from '../../lib/utils';

export type DayStripItem = {
  /** Normalized date key (ISO `YYYY-MM-DD` where possible). */
  date: string;
  /** null = no data that day. */
  value: number | null;
  /** Scheduled OFF / C — shown as a muted "off" chip. */
  off?: boolean;
  /** Tiny superscript badge, e.g. shift `22` or `PO` (pullout). */
  marker?: string | null;
};

const dayLabel = (date: string) => {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(date);
  return m ? String(Number(m[1])) : date.slice(0, 5);
};
const monthOf = (date: string) => {
  const m = /^(\d{4}-\d{2})-\d{2}$/.exec(date);
  return m ? m[1] : '';
};

/**
 * Chronological per-day chip strip used in every expand row. Each chip shows the
 * day-of-month above the value so a low day is identifiable without counting.
 * Colour discipline: only `watch` / `miss` days are tinted, and they use a thin
 * border + ~6% wash (reads cleanly in dark, unlike a solid `/15` block).
 */
export const DayStrip: React.FC<{
  items: DayStripItem[];
  kpiType: KpiType;
  /** value → chip text. Default: integer. */
  format?: (v: number) => string;
  /** When set, non-empty non-off chips become buttons calling this with the date. */
  onSelect?: (date: string) => void;
  className?: string;
  /** Chip width in px — widen when `format` renders longer decimal text (default 40). */
  chipWidth?: number;
}> = ({ items, kpiType, format = (v) => formatNum(v, 0), onSelect, className, chipWidth = 40 }) => {
  let prevMonth = '';
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {items.map((it) => {
        const mon = monthOf(it.date);
        const monthBreak = !!prevMonth && !!mon && mon !== prevMonth;
        prevMonth = mon;

        const base =
          'flex h-[34px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border text-[10px] leading-none tabular-nums';
        const sep = monthBreak ? 'ml-2' : '';

        let tone: string;
        let body: React.ReactNode;
        if (it.off) {
          tone = 'border-border/60 text-text-disabled';
          body = <span className="text-[9px] italic">off</span>;
        } else if (it.value === null) {
          tone = 'border-dashed border-border/60 text-text-disabled';
          body = <span>&ndash;</span>;
        } else {
          const st = getKpiStatus(it.value, kpiType);
          tone =
            st === 'miss'
              ? 'border-danger/45 bg-danger/[0.06] text-danger'
              : st === 'watch'
                ? 'border-warning/45 bg-warning/[0.06] text-warning'
                : 'border-border/70 text-text-secondary';
          body = (
            <span className="flex items-center gap-0.5">
              {format(it.value)}
              {it.marker ? <sup className="text-[7px] text-text-muted">{it.marker}</sup> : null}
            </span>
          );
        }

        const label = <span className="text-[8px] font-medium text-text-muted">{dayLabel(it.date)}</span>;
        const cls = `${base} ${tone} ${sep}`;

        if (onSelect && !it.off && it.value !== null) {
          return (
            <button
              key={it.date}
              type="button"
              title={it.date}
              onClick={(e) => { e.stopPropagation(); onSelect(it.date); }}
              style={{ width: chipWidth }}
              className={`${cls} transition-colors hover:border-primary/60 hover:text-primary`}
            >
              {label}
              {body}
            </button>
          );
        }
        return (
          <span key={it.date} title={it.date} style={{ width: chipWidth }} className={cls}>
            {label}
            {body}
          </span>
        );
      })}
    </div>
  );
};

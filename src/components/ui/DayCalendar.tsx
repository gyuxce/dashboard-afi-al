import React, { useMemo } from "react";
import { formatNum, getKpiStatus, type KpiType } from "../../lib/utils";
import { buildWeekGrid, formatDayMonth, summarizeDays, type DayCell } from "../../lib/dayCalendar";
import { DayStrip } from "./DayStrip";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

/**
 * Per-agent values per day: a one-line digest on the left and a Monday-first calendar on the right,
 * so "Mondays are always low" or "weekends are empty" reads at a glance. Falls back to the flat strip
 * when dates are not ISO. Number colour follows status only (red / amber when the day misses target).
 */
export const DayCalendar: React.FC<{
  cells: DayCell[];
  kpiType: KpiType;
  /** Target used for the "N days under" digest (same number the status colour is based on). */
  target: number;
  /** Heading, e.g. "Chat per hari". */
  title: string;
  /** Small hint under the legend, e.g. "Klik hari untuk audit trail". */
  hint?: string;
  /** Target as shown in the digest, default `formatNum(target)`. */
  targetText?: string;
  /** value → cell text. Default: integer. */
  format?: (v: number) => string;
  /** Digest extremes text. Defaults to `format`. */
  formatExtreme?: (v: number) => string;
  /** Hint for empty cells, e.g. "tanpa data". */
  emptyText?: string;
  /** When set, cells with a value become buttons calling this with the date. */
  onSelect?: (date: string) => void;
  /** Show the shift-22 / pullout legend (Productivity only). */
  showMarkerLegend?: boolean;
}> = ({ cells, kpiType, target, title, hint, targetText, format = (v) => formatNum(v, 0), formatExtreme, emptyText = "tanpa data", onSelect, showMarkerLegend = false }) => {
  const summary = useMemo(() => summarizeDays(cells, target), [cells, target]);
  const weeks = useMemo(() => buildWeekGrid(cells), [cells]);
  const hasOff = cells.some((c) => c.off);
  const fmtExtreme = formatExtreme ?? format;

  const valueTone = (value: number) => {
    const st = getKpiStatus(value, kpiType);
    return st === "miss" ? "text-danger font-semibold" : st === "watch" ? "text-warning font-semibold" : "text-text-primary";
  };

  return (
    <div className="flex flex-col gap-4 pt-3 lg:flex-row lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-2 lg:w-60 lg:shrink-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</div>
        {summary.daysWithData === 0 ? (
          <div className="text-sm text-text-muted">Belum ada data harian.</div>
        ) : (
          <>
            <div className="text-sm text-text-primary">
              <span className={`text-2xl font-semibold tabular-nums ${summary.belowTarget > 0 ? "text-danger" : ""}`}>{summary.belowTarget}</span>
              <span className="text-text-secondary"> dari {summary.daysWithData} hari di bawah {targetText ?? formatNum(target)}</span>
            </div>
            {summary.lowest && summary.highest && (
              <div className="text-xs text-text-secondary tabular-nums">
                Terendah <span className="font-semibold text-text-primary">{fmtExtreme(summary.lowest.value)}</span> ({formatDayMonth(summary.lowest.date)})
                <br />
                Tertinggi <span className="font-semibold text-text-primary">{fmtExtreme(summary.highest.value)}</span> ({formatDayMonth(summary.highest.date)})
              </div>
            )}
          </>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
          {showMarkerLegend && (
            <>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> shift 22</span>
              <span className="inline-flex items-center gap-1"><span className="rounded bg-surface-muted px-1 text-[9px] font-semibold text-text-secondary">PO</span> pullout</span>
            </>
          )}
          {hasOff && <span className="inline-flex items-center gap-1"><span className="text-[10px] italic text-text-disabled">off</span> libur terjadwal</span>}
          <span className="inline-flex items-center gap-1"><span className="text-text-disabled">–</span> {emptyText}</span>
        </div>
        {hint && <div className="text-[11px] text-text-muted">{hint}</div>}
      </div>

      <div className="min-w-0 flex-1 lg:max-w-[560px]">
        {weeks ? (
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-text-muted">{d}</div>
            ))}
            {weeks.flatMap((row, wi) =>
              row.map((cell, di) => {
                const key = `${wi}-${di}`;
                if (!cell) return <div key={key} />;
                const dayNum = Number(cell.date.slice(8, 10));
                const showMonth = dayNum === 1 || (wi === 0 && row.findIndex((c) => c) === di);
                const hasValue = !cell.off && cell.value !== null;
                const cls = `relative flex h-11 flex-col items-center justify-center rounded-lg border text-xs tabular-nums ${hasValue ? "border-border bg-card shadow-sm" : "border-dashed border-border bg-transparent"}`;
                const inner = (
                  <>
                    <span className="absolute left-1.5 top-1 text-[9px] leading-none text-text-muted">{showMonth ? formatDayMonth(cell.date) : dayNum}</span>
                    {cell.marker === "22" && <span className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-primary" aria-label="shift 22" />}
                    {cell.marker === "PO" && <span className="absolute right-1 top-0.5 rounded bg-card px-1 text-[8px] font-semibold leading-tight text-text-secondary">PO</span>}
                    {cell.off ? (
                      <span className="pt-2 text-[10px] italic text-text-disabled">off</span>
                    ) : cell.value === null ? (
                      <span className="pt-2 text-text-disabled">–</span>
                    ) : (
                      <span className={`pt-2 ${valueTone(cell.value)}`}>{format(cell.value)}</span>
                    )}
                  </>
                );
                return onSelect && hasValue ? (
                  <button
                    key={key}
                    type="button"
                    title={cell.date}
                    onClick={(e) => { e.stopPropagation(); onSelect(cell.date); }}
                    className={`${cls} transition-colors hover:border-primary/60`}
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={key} title={cell.date} className={cls}>{inner}</div>
                );
              }),
            )}
          </div>
        ) : (
          <DayStrip kpiType={kpiType} format={format} onSelect={onSelect} items={cells.map((c) => ({ date: c.date, value: c.value, off: c.off, marker: c.marker }))} />
        )}
      </div>
    </div>
  );
};

import React, { useMemo } from "react";
import { formatNum, getKpiStatus } from "../../lib/utils";
import { PROD_TARGET, buildWeekGrid, formatDayMonth, summarizeDays, type DayCell } from "../../lib/productivityStats";
import { DayStrip } from "../ui/DayStrip";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

/** Number colour follows status only: neutral unless the day misses (or nearly misses) the target. */
const valueTone = (value: number) => {
  const st = getKpiStatus(value, "productivity");
  return st === "miss" ? "text-danger font-semibold" : st === "watch" ? "text-warning font-semibold" : "text-text-primary";
};

/**
 * Per-agent chats per day: a one-line digest on the left and a Monday-first calendar on the right,
 * so "Mondays are always low" or "weekends are empty" reads at a glance. Falls back to the flat strip
 * when dates are not ISO.
 */
export const ProductivityDayCalendar: React.FC<{ cells: DayCell[] }> = ({ cells }) => {
  const summary = useMemo(() => summarizeDays(cells), [cells]);
  const weeks = useMemo(() => buildWeekGrid(cells), [cells]);

  return (
    <div className="flex flex-col gap-4 pt-3 lg:flex-row lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-2 lg:w-60 lg:shrink-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Chat per hari</div>
        {summary.daysWithData === 0 ? (
          <div className="text-sm text-text-muted">Belum ada data harian.</div>
        ) : (
          <>
            <div className="text-sm text-text-primary">
              <span className={`text-2xl font-semibold tabular-nums ${summary.belowTarget > 0 ? "text-danger" : ""}`}>{summary.belowTarget}</span>
              <span className="text-text-secondary"> dari {summary.daysWithData} hari di bawah {PROD_TARGET}</span>
            </div>
            {summary.lowest && summary.highest && (
              <div className="text-xs text-text-secondary tabular-nums">
                Terendah <span className="font-semibold text-text-primary">{formatNum(summary.lowest.value, 0)}</span> ({formatDayMonth(summary.lowest.date)})
                <br />
                Tertinggi <span className="font-semibold text-text-primary">{formatNum(summary.highest.value, 0)}</span> ({formatDayMonth(summary.highest.date)})
              </div>
            )}
          </>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> shift 22</span>
          <span className="inline-flex items-center gap-1"><span className="rounded bg-surface-muted px-1 text-[9px] font-semibold text-text-secondary">PO</span> pullout</span>
          <span className="inline-flex items-center gap-1"><span className="text-text-disabled">–</span> tanpa data</span>
        </div>
      </div>

      <div className="min-w-0 flex-1 lg:max-w-[520px]">
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
                return (
                  <div
                    key={key}
                    title={cell.date}
                    className={`relative flex h-11 flex-col items-center justify-center rounded-lg border text-xs tabular-nums ${cell.value === null ? "border-dashed border-border bg-transparent" : "border-border bg-card shadow-sm"}`}
                  >
                    <span className="absolute left-1.5 top-1 text-[9px] leading-none text-text-muted">
                      {showMonth ? formatDayMonth(cell.date) : dayNum}
                    </span>
                    {cell.marker === "22" && <span className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-primary" aria-label="shift 22" />}
                    {cell.marker === "PO" && <span className="absolute right-1 top-0.5 rounded bg-card px-1 text-[8px] font-semibold leading-tight text-text-secondary">PO</span>}
                    {cell.value === null ? (
                      <span className="pt-2 text-text-disabled">–</span>
                    ) : (
                      <span className={`pt-2 ${valueTone(cell.value)}`}>{formatNum(cell.value, 0)}</span>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        ) : (
          <DayStrip kpiType="productivity" items={cells.map((c) => ({ date: c.date, value: c.value, marker: c.marker }))} />
        )}
      </div>
    </div>
  );
};

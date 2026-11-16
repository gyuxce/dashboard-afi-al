import React, { useMemo, useRef } from 'react';
import { AgentKPI } from '../../lib/dataProcessor';
import { EmptyState } from '../ui/EmptyState';
import { MobileScrollHint } from '../ui/ChartScrollArea';
import { VirtualizedTbody } from '../ui/VirtualizedTbody';
import { useVirtualRows } from '../../hooks/useVirtualRows';
import { KpiValue } from '../ui/KpiCue';
import { KPI_TARGETS, formatNum, uniqueCalendarDates, weekSeparatorClass, indexByDate, getByCalendarDate, formatCalendarHeader } from '../../lib/utils';
import { buildCoverage, classifyShift, type ShiftKind } from '../../lib/scheduleStats';

const CELL_CLASS: Record<ShiftKind, string> = {
  shift: 'bg-surface-muted text-text-secondary font-semibold',
  sick: 'bg-warning-soft text-warning-text font-semibold',
  pullout: 'text-text-muted italic',
  off: 'text-text-disabled',
  none: 'text-text-disabled',
  other: 'text-text-primary',
};

/** Daily roster grid. `data` is already scoped + searched by ScheduleAttendance. */
export const ScheduleBoard: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const tableData = data;

  const uniqueDates = useMemo(
    () => uniqueCalendarDates(data.map((d) => d.dailyHistory?.schedule)),
    [data],
  );

  // How many agents are actually on a shift each day — the coverage strip.
  const coverage = useMemo(() => buildCoverage(data, uniqueDates), [data, uniqueDates]);
  const maxCoverage = Math.max(1, ...coverage.map((c) => c.count));

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableVirtual = useVirtualRows({
    count: tableData.length,
    rowHeight: 52,
    scrollRef: tableScrollRef,
  });
  const tableColSpan = 6 + uniqueDates.length;

  return (
    <div className="flex flex-col gap-5">
      {coverage.length >= 2 && maxCoverage > 0 && (
        <div className="ui-card ui-card-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Agen bertugas per hari</span>
            <span className="inline-flex items-center gap-3 text-[9px] text-text-muted">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-text-muted" />normal</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-warning" />hari sepi</span>
              <span className="tabular-nums">maks {maxCoverage}</span>
            </span>
          </div>
          <div className="mt-2 flex h-16 items-end gap-0.5">
            {coverage.map(({ date, count }) => {
              const low = count < maxCoverage * 0.7;
              return (
                <div key={date} className="flex h-full min-w-[3px] flex-1 flex-col items-center justify-end gap-1">
                  {coverage.length <= 24 && (
                    <span className="text-[8px] tabular-nums text-text-muted">{count}</span>
                  )}
                  <div
                    className={`w-full rounded-[2px] ${low ? 'bg-warning' : 'bg-text-muted'}`}
                    style={{ height: `${Math.max(12, (count / maxCoverage) * 100)}%` }}
                    title={`${formatCalendarHeader(date)} · ${count} agen bertugas`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[9px] tabular-nums text-text-muted">
            <span>{formatCalendarHeader(coverage[0]?.date ?? '')}</span>
            <span>{formatCalendarHeader(coverage[coverage.length - 1]?.date ?? '')}</span>
          </div>
        </div>
      )}

      <MobileScrollHint label="Geser → untuk lihat semua kolom" />
      <div ref={tableScrollRef} className="ui-card p-0! relative w-full overflow-auto text-sm flex-1 max-h-[calc(100vh-380px)]">
          <table className="kpi-data-table w-full text-left whitespace-nowrap border-collapse">
            <thead className="bg-surface text-text-secondary sticky top-0 z-30">
              <tr>
                <th className="p-2 font-semibold text-center  md:sticky md:left-0 z-40 bg-surface min-w-[60px] max-w-[60px]">No</th>
                <th className="p-2 font-semibold  md:sticky md:left-[60px] z-40 bg-surface min-w-[250px] max-w-[250px]">Name / CS ID</th>
                <th className="p-2 font-semibold  md:sticky md:left-[310px] z-40 bg-surface min-w-[80px] max-w-[80px]">BPO</th>
                <th className="p-2 font-semibold  md:sticky md:left-[390px] z-40 bg-surface min-w-[120px] max-w-[120px]">Team Leader</th>
                <th className="p-2 font-semibold text-center text-text-primary  bg-surface shrink-0 z-30 relative">
                  Man-days
                </th>
                <th className="p-2 font-semibold text-center text-text-primary  bg-surface shrink-0 z-30 relative shadow-[10px_0_15px_-3px_rgba(0,0,0,0.05)]">
                  Attend. % <span className="font-normal text-text-muted">· t {KPI_TARGETS.attendance}%</span>
                </th>
                {uniqueDates.map((date, i) => (
                  <th key={date} className={`p-1.5 text-center text-[10px] font-medium text-text-muted bg-surface tabular-nums ${weekSeparatorClass(i)}`}>
                    {formatCalendarHeader(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <VirtualizedTbody
              colSpan={tableColSpan}
              paddingTop={tableVirtual.paddingTop}
              paddingBottom={tableVirtual.paddingBottom}
            >
              {tableData.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="p-4 z-10 relative">
                    <EmptyState
                      title="Tidak ada data schedule"
                      description="Coba ubah pencarian atau rentang tanggal."
                      variant="filter"
                      className="border-0 bg-transparent py-6"
                      showDataActions
                    />
                  </td>
                </tr>
              ) : tableVirtual.virtualIndexes.map((idx) => {
                const agent = tableData[idx];
                if (!agent) return null;
                const displayName = agent.name || agent.csId;
                const scheduleByDate = indexByDate(agent.dailyHistory?.schedule);

                return (
                <tr key={agent.csId} className="border-b border-border transition-colors group hover:bg-surface-muted">
                  <td className="p-2 text-center text-text-muted font-medium md:sticky md:left-0 z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[60px] max-w-[60px]">{idx + 1}</td>
                  <td className="p-2 font-medium md:sticky md:left-[60px] z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[250px] max-w-[250px] truncate">
                  <span className="text-text-primary font-semibold" title={agent.csId}>
                    {displayName}
                  </span>
                  </td>
                  <td className="p-2 font-medium text-text-primary uppercase md:sticky md:left-[310px] z-20 bg-card group-hover:bg-surface-muted min-w-[80px] max-w-[80px] truncate">
                    {agent.bpo || '-'}
                  </td>
                  <td className="p-2 font-medium text-text-primary md:sticky md:left-[390px] z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[120px] max-w-[120px] truncate">{agent.teamLeader || '-'}</td>

                  <td className="p-2 text-center font-bold text-text-primary z-10 tabular-nums">
                    {agent.manDays}
                  </td>
                  <td className="p-2 text-center text-[11px] shadow-[10px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 tabular-nums">
                    {agent.attendanceDuty > 0
                      ? <KpiValue value={agent.attendanceScore} type="attendance" text={`${formatNum(agent.attendanceScore, 1)}%`} />
                      : <span className="text-text-disabled">–</span>}
                  </td>

                  {uniqueDates.map((date, i) => {
                    const sched = getByCalendarDate(scheduleByDate, date);
                    const { kind, label } = classifyShift(sched ? sched.status : '-');

                    return (
                      <td key={date} className={`p-1.5 text-center z-10 transition-colors ${weekSeparatorClass(i)}`}>
                         <span className={`inline-flex min-w-[30px] items-center justify-center rounded px-1.5 py-0.5 text-[10px] tabular-nums ${CELL_CLASS[kind]}`}>{label}</span>
                      </td>
                    );
                  })}
                </tr>
              )})}
            </VirtualizedTbody>
          </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-text-muted">
        <span className="font-semibold text-text-secondary">Kode</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex min-w-[26px] justify-center rounded bg-surface-muted px-1 py-0.5 font-semibold text-text-secondary">7</span>
          shift — hadir &amp; man-day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-text-disabled">OFF</span>
          OFF / C — bukan man-day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex min-w-[18px] justify-center rounded bg-warning-soft px-1 py-0.5 font-semibold text-warning-text">S</span>
          sakit — man-day, bukan hadir
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="italic text-text-muted">P.OUT</span>
          pullout — duty, bukan man-day
        </span>
      </div>
    </div>
  );
};

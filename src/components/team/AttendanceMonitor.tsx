import React, { useMemo, useRef } from 'react';
import { AgentKPI } from '../../lib/dataProcessor';
import { KPI_TARGETS, formatNum } from '../../lib/utils';
import { KpiValue, KpiLegend } from '../ui/KpiCue';
import { EmptyState } from '../ui/EmptyState';
import { MobileScrollHint } from '../ui/ChartScrollArea';
import { VirtualizedTbody } from '../ui/VirtualizedTbody';
import { useVirtualRows } from '../../hooks/useVirtualRows';

/** Agents with any attendance signal — avoids listing empty roster-only records. */
export const hasAttendanceData = (a: AgentKPI) =>
  a.attendanceDuty > 0 || a.attendancePresence > 0 || a.attendanceS > 0 || a.attendanceC > 0 || a.attendancePullout > 0;

export function summarizeAttendance(rows: AgentKPI[]) {
  let totDuty = 0;
  let totPresence = 0;
  let sick = 0;
  let pullout = 0;
  let leaveDays = 0;
  let belowTarget = 0;
  rows.forEach((a) => {
    totDuty += a.attendanceDuty;
    totPresence += a.attendancePresence;
    sick += a.attendanceS;
    pullout += a.attendancePullout;
    leaveDays += a.attendanceC;
    if (a.attendanceDuty > 0 && a.attendanceScore < KPI_TARGETS.attendance) belowTarget += 1;
  });
  return {
    avgTeamAttendance: totDuty > 0 ? Math.min(100, (totPresence / totDuty) * 100) : 0,
    totalSick: sick,
    totalPullout: pullout,
    totalC: leaveDays,
    belowTarget,
  };
}

/** Per-agent attendance totals. `data` is already scoped + searched by ScheduleAttendance. */
export const AttendanceMonitor: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const tableData = useMemo(() => data.filter(hasAttendanceData), [data]);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableVirtual = useVirtualRows({
    count: tableData.length,
    rowHeight: 52,
    scrollRef: tableScrollRef,
  });
  const tableColSpan = 12;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MobileScrollHint label="Geser → untuk lihat semua kolom" />
        <KpiLegend />
      </div>
      <div ref={tableScrollRef} className="relative w-full overflow-auto bg-card border text-sm border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl transition-all flex-1 max-h-[calc(100vh-380px)]">
          <table className="kpi-data-table w-full text-left whitespace-nowrap border-collapse">
            <thead className="bg-surface text-text-secondary sticky top-0 z-30">
              <tr>
                <th className="p-2 font-bold text-center  md:sticky md:left-0 z-40 bg-surface min-w-[60px] max-w-[60px]">No</th>
                <th className="p-2 font-bold  md:sticky md:left-[60px] z-40 bg-surface min-w-[250px] max-w-[250px]">Name / CS ID</th>
                <th className="p-2 font-bold  md:sticky md:left-[310px] z-40 bg-surface min-w-[80px] max-w-[80px]">BPO</th>
                <th className="p-2 font-bold  md:sticky md:left-[390px] z-40 bg-surface min-w-[120px] max-w-[120px]">Team Leader</th>
                <th className="p-2 font-bold text-center  bg-surface">Duty</th>
                <th className="p-2 font-bold text-center  bg-surface">Presence</th>
                <th className="p-2 font-bold text-center  bg-surface">OFF</th>
                <th className="p-2 font-bold text-center  bg-surface">C</th>
                <th className="p-2 font-bold text-center  bg-surface">S</th>
                <th className="p-2 font-bold text-center  bg-surface">PULL OUT</th>
                <th className="p-2 font-bold text-center  bg-surface">Total Days</th>
                <th className="p-2 font-bold text-center bg-surface">Attendance % <span className="font-normal text-text-muted">· t {KPI_TARGETS.attendance}%</span></th>
              </tr>
            </thead>
            <VirtualizedTbody
              colSpan={tableColSpan}
              paddingTop={tableVirtual.paddingTop}
              paddingBottom={tableVirtual.paddingBottom}
            >
              {tableVirtual.virtualIndexes.map((index) => {
                const agent = tableData[index];
                if (!agent) return null;
                 const totalDays = agent.attendanceTotalDays;
                 const displayName = agent.name || agent.csId;

                 return (
                  <tr key={agent.csId} className="border-b border-border transition-colors group hover:bg-surface-muted">
                    <td className="p-2 text-center text-text-muted font-medium md:sticky md:left-0 z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[60px] max-w-[60px]">{index + 1}</td>
                    <td className="p-2 font-medium md:sticky md:left-[60px] z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[250px] max-w-[250px] truncate">
                      <span className="text-kpi-neutral-text font-semibold" title={agent.csId}>
                        {displayName}
                      </span>
                    </td>
                    <td className="p-2 font-medium text-text-primary uppercase truncate md:sticky md:left-[310px] z-20 bg-card group-hover:bg-surface-muted min-w-[80px] max-w-[80px]">{agent.bpo || '-'}</td>
                    <td className="p-2 font-medium text-text-primary truncate md:sticky md:left-[390px] z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[120px] max-w-[120px]">{agent.teamLeader || '-'}</td>
                    <td className="p-2 text-center font-bold text-[11px] text-text-primary z-10 relative">{agent.attendanceDuty}</td>
                    <td className="p-2 text-center font-bold text-[11px] text-primary z-10 relative">{agent.attendancePresence}</td>
                    <td className="p-2 text-center text-text-muted z-10 relative">{agent.attendanceOff || '-'}</td>
                    <td className="p-2 text-center text-text-muted z-10 relative">{agent.attendanceC || '-'}</td>
                    <td className="p-2 text-center text-text-muted z-10 relative">{agent.attendanceS || '-'}</td>
                    <td className="p-2 text-center font-bold text-[11px] text-success z-10 relative">{agent.attendancePullout || '-'}</td>
                    <td className="p-2 text-center font-bold text-[11px] text-text-primary z-10 relative">{totalDays}</td>
                    <td className="p-2 text-center text-[11px] z-10 relative">
                      <span className="inline-flex items-center justify-center gap-1">
                        <KpiValue value={agent.attendanceScore} type="attendance" text={`${formatNum(agent.attendanceScore, 1)}%`} />
                      </span>
                    </td>
                  </tr>
                );
              })}
              {tableData.length === 0 && (
                <tr>
                  <td colSpan={tableColSpan} className="p-4 z-10 relative">
                    <EmptyState
                      title="Tidak ada data attendance"
                      description="Coba ubah pencarian atau rentang tanggal. Jika data belum ada, sync dari File Center."
                      variant="filter"
                      className="border-0 bg-transparent py-6"
                      showDataActions
                    />
                  </td>
                </tr>
              )}
            </VirtualizedTbody>
          </table>
      </div>
    </div>
  );
};

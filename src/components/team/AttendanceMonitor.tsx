import React, { useState, useMemo, useRef } from 'react';
import { AgentKPI } from '../../lib/dataProcessor';
import { formatNum } from '../../lib/utils';
import { KpiValue, KpiLegend } from '../ui/KpiCue';
import { Search, Users, HeartPulse, UserMinus, AlertTriangle } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { MobileScrollHint } from '../ui/ChartScrollArea';
import { VirtualizedTbody } from '../ui/VirtualizedTbody';
import { useVirtualRows } from '../../hooks/useVirtualRows';

export const AttendanceMonitor: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const [search, setSearch] = useState('');
  
  // Filter active agents only (those with duty or presence) to avoid listing empty records from dict
  const activeData = useMemo(() => {
    return data.filter(a => a.attendanceDuty > 0 || a.attendancePresence > 0 || a.attendanceS > 0 || a.attendanceC > 0 || a.attendancePullout > 0);
  }, [data]);

  const tableData = useMemo(() => {
    return activeData.filter(a => a.csId.toLowerCase().includes(search.toLowerCase()) || (a.name || '').toLowerCase().includes(search.toLowerCase()));
  }, [activeData, search]);

  const { avgTeamAttendance, totalSick, totalPullout, totalC, belowTarget } = useMemo(() => {
    let totDuty = 0;
    let totPresence = 0;
    let sick = 0;
    let pullout = 0;
    let leaveDays = 0;
    let agentsBelowTarget = 0;
    
    activeData.forEach(a => {
       totDuty += a.attendanceDuty;
       totPresence += a.attendancePresence;
       sick += a.attendanceS;
       pullout += a.attendancePullout;
       leaveDays += a.attendanceC;
       if (a.attendanceDuty > 0 && a.attendanceScore < 95) agentsBelowTarget += 1;
    });
    
    const avg = totDuty > 0 ? Math.min(100, (totPresence / totDuty) * 100) : 0;
    return { avgTeamAttendance: avg, totalSick: sick, totalPullout: pullout, totalC: leaveDays, belowTarget: agentsBelowTarget };
  }, [activeData]);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableVirtual = useVirtualRows({
    count: tableData.length,
    rowHeight: 52,
    scrollRef: tableScrollRef,
  });
  const tableColSpan = 11;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Attendance Monitor</h1>
          <p className="text-xs text-text-muted mt-1">Based on Schedule data mapping.</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input 
            type="text" 
            placeholder="Cari CS ID atau nama..."
              aria-label="Cari CS ID atau nama..." 
            className="pl-8 pr-3 py-1.5 border border-border rounded-lg text-xs focus:border-primary focus:outline-none w-full md:w-56"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      
      {/* WIDGETS */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
         <div className="bg-card rounded-lg border border-border p-4 flex flex-col relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
               <div className="text-[11px] font-medium text-text-secondary tracking-wide z-10">Avg Team Attendance</div>
               <div className="w-7 h-7 rounded-md bg-primary-soft flex items-center justify-center z-10 shrink-0">
                 <Users className="w-3.5 h-3.5 text-primary" />
               </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight text-primary z-10">{formatNum(avgTeamAttendance, 1)}%</div>
         </div>
         <div className="bg-card rounded-lg border border-border p-4 flex flex-col relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
               <div className="text-[11px] font-medium text-text-secondary tracking-wide z-10">Di Bawah Target</div>
               <div className="w-7 h-7 rounded-md bg-danger-soft flex items-center justify-center z-10 shrink-0">
                 <AlertTriangle className="w-3.5 h-3.5 text-danger" />
               </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight text-danger z-10">{formatNum(belowTarget, 0)}</div>
            <p className="mt-1 text-[10px] text-text-muted">Target attendance 95%</p>
         </div>
         <div className="bg-card rounded-lg border border-border p-4 flex flex-col relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
               <div className="text-[11px] font-medium text-text-secondary tracking-wide z-10">Total Cuti (C)</div>
               <div className="w-7 h-7 rounded-md bg-warning-soft flex items-center justify-center z-10 shrink-0">
                 <HeartPulse className="w-3.5 h-3.5 text-warning" />
               </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight text-text-primary z-10">{formatNum(totalC, 0)}</div>
         </div>
         <div className="bg-card rounded-lg border border-border p-4 flex flex-col relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
               <div className="text-[11px] font-medium text-text-secondary tracking-wide z-10">Total Sick (S)</div>
               <div className="w-7 h-7 rounded-md bg-danger-soft flex items-center justify-center z-10 shrink-0">
                 <HeartPulse className="w-3.5 h-3.5 text-danger" />
               </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight text-text-primary z-10">{formatNum(totalSick, 0)}</div>
         </div>
         <div className="bg-card rounded-lg border border-border p-4 flex flex-col relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
               <div className="text-[11px] font-medium text-text-secondary tracking-wide z-10">Total PULLOUT</div>
               <div className="w-7 h-7 rounded-md bg-success-soft flex items-center justify-center z-10 shrink-0">
                 <UserMinus className="w-3.5 h-3.5 text-success" />
               </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight text-text-primary z-10">{formatNum(totalPullout, 0)}</div>
         </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MobileScrollHint label="Geser → untuk lihat semua kolom" />
        <KpiLegend />
      </div>
      <div ref={tableScrollRef} className="relative w-full overflow-auto bg-card border text-sm border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl transition-all flex-1 max-h-[calc(100vh-200px)]">
          <table className="kpi-data-table w-full text-left whitespace-nowrap border-collapse">
            <thead className="bg-surface text-text-secondary sticky top-0 z-30">
              <tr>
                <th className="p-2 font-bold text-center  md:sticky md:left-0 z-40 bg-surface min-w-[60px] max-w-[60px]">No</th>
                <th className="p-2 font-bold  md:sticky md:left-[60px] z-40 bg-surface min-w-[250px] max-w-[250px]">Name / CS ID</th>
                <th className="p-2 font-bold  md:sticky md:left-[310px] z-40 bg-surface min-w-[120px] max-w-[120px]">Team Leader</th>
                <th className="p-2 font-bold text-center  bg-surface">Duty</th>
                <th className="p-2 font-bold text-center  bg-surface">Presence</th>
                <th className="p-2 font-bold text-center  bg-surface">OFF</th>
                <th className="p-2 font-bold text-center  bg-surface">C</th>
                <th className="p-2 font-bold text-center  bg-surface">S</th>
                <th className="p-2 font-bold text-center  bg-surface">PULL OUT</th>
                <th className="p-2 font-bold text-center  bg-surface">Total Days</th>
                <th className="p-2 font-bold text-center bg-surface">Attendance % <span className="font-normal text-text-muted">· t 95%</span></th>
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
                    <td className="p-2 font-medium text-text-primary truncate md:sticky md:left-[310px] z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[120px] max-w-[120px]">{agent.teamLeader || '-'}</td>
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

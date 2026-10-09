import React, { useMemo, useState, useRef } from 'react';
import { Search } from 'lucide-react';
import { AgentKPI } from '../../lib/dataProcessor';
import { EmptyState } from '../ui/EmptyState';
import { MobileScrollHint } from '../ui/ChartScrollArea';
import { VirtualizedTbody } from '../ui/VirtualizedTbody';
import { useVirtualRows } from '../../hooks/useVirtualRows';
import { uniqueCalendarDates, weekSeparatorClass, indexByDate, getByCalendarDate, formatCalendarHeader } from '../../lib/utils';

type ShiftKind = 'shift' | 'sick' | 'off' | 'pullout' | 'none' | 'other';

/** One roster cell → a kind + the label to print. Colour-discipline: only the
 *  watch state (sakit) carries a hue; shifts are neutral chips, the rest plain. */
function classifyShift(raw: string | null | undefined): { kind: ShiftKind; label: string } {
  const s = (raw || '').trim();
  const u = s.toUpperCase();
  if (!s || s === '-') return { kind: 'none', label: '–' };
  if (u === 'S') return { kind: 'sick', label: 'S' };
  if (u === 'OFF' || u === 'C') return { kind: 'off', label: u };
  if (u === 'PULLOUT' || u === 'P.OUT' || u === 'PO') return { kind: 'pullout', label: 'P.OUT' };
  if (/^\d+([.,]\d+)?$/.test(u) || /^\d{1,2}:\d{2}/.test(u)) return { kind: 'shift', label: s };
  return { kind: 'other', label: s };
}

const CELL_CLASS: Record<ShiftKind, string> = {
  shift: 'bg-surface-muted text-text-secondary font-semibold',
  sick: 'bg-warning-soft text-warning-text font-semibold',
  pullout: 'text-text-muted italic',
  off: 'text-text-disabled',
  none: 'text-text-disabled',
  other: 'text-text-primary',
};

export const ScheduleBoard: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const [search, setSearch] = useState('');

  const tableData = data.filter(a => a.csId.toLowerCase().includes(search.toLowerCase()) || (a.name || '').toLowerCase().includes(search.toLowerCase()));

  const uniqueDates = useMemo(
    () => uniqueCalendarDates(data.map((d) => d.dailyHistory?.schedule)),
    [data],
  );

  // How many agents are actually on a shift each day — the coverage strip.
  const coverage = useMemo(() => {
    return uniqueDates.map((date) => {
      let count = 0;
      for (const a of data) {
        const sched = getByCalendarDate(indexByDate(a.dailyHistory?.schedule), date);
        if (sched && classifyShift(sched.status).kind === 'shift') count++;
      }
      return { date, count };
    });
  }, [data, uniqueDates]);
  const maxCoverage = Math.max(1, ...coverage.map((c) => c.count));

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableVirtual = useVirtualRows({
    count: tableData.length,
    rowHeight: 52,
    scrollRef: tableScrollRef,
  });
  const tableColSpan = 5 + uniqueDates.length;

  return (
    <div className="space-y-4 max-h-[85vh] flex flex-col">
      <div className="flex items-center justify-between mx-4">
        <h1 className="text-lg font-bold text-text-primary">Schedule Board</h1>

        <div className="flex gap-4">
           <div className="relative">
             <Search className="w-4 h-4 absolute left-3 top-1.5 text-text-muted" />
             <input
               type="text"
               placeholder="Cari CS ID atau nama..."
              aria-label="Cari CS ID atau nama..."
               className="pl-9 pr-4 py-1.5 border border-border rounded-lg text-xs w-64 focus:outline-none focus:ring-1 focus:ring-primary bg-card text-text-primary"
               value={search}
               onChange={e => setSearch(e.target.value)}
             />
           </div>
        </div>
      </div>

      {coverage.length >= 2 && maxCoverage > 0 && (
        <div className="mx-4 rounded-xl border border-border bg-surface px-4 py-3">
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
      <div ref={tableScrollRef} className="relative w-full overflow-auto bg-card border text-sm border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl transition-all flex-1 mx-4 max-h-[calc(100vh-320px)]">
          <table className="kpi-data-table w-full text-left whitespace-nowrap border-collapse">
            <thead className="bg-surface text-text-secondary sticky top-0 z-30">
              <tr>
                <th className="p-2 font-semibold text-center  md:sticky md:left-0 z-40 bg-surface min-w-[60px] max-w-[60px]">No</th>
                <th className="p-2 font-semibold  md:sticky md:left-[60px] z-40 bg-surface min-w-[250px] max-w-[250px]">Name / CS ID</th>
                <th className="p-2 font-semibold  md:sticky md:left-[310px] z-40 bg-surface min-w-[80px] max-w-[80px]">BPO</th>
                <th className="p-2 font-semibold  md:sticky md:left-[390px] z-40 bg-surface min-w-[120px] max-w-[120px]">Team Leader</th>
                <th className="p-2 font-semibold text-center text-text-primary  bg-surface shrink-0 z-30 relative shadow-[10px_0_15px_-3px_rgba(0,0,0,0.05)]">
                  Man-days
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

                  <td className="p-2 text-center font-bold text-text-primary shadow-[10px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 tabular-nums">
                    {agent.manDays}
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

      <div className="mx-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-text-muted">
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

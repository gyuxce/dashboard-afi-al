import React, { useState, useMemo, useRef } from 'react';
import { AgentKPI } from '../../lib/dataProcessor';
import {
  formatNum,
  getKpiStatus,
  uniqueCalendarDates,
  indexByDate,
  getByCalendarDate,
  type KpiType,
} from '../../lib/utils';
import { KpiValue, KpiCue, KpiLegend } from '../ui/KpiCue';
import { Sparkline } from '../ui/Sparkline';
import { DayStrip } from '../ui/DayStrip';
import { Search, ChevronDown } from 'lucide-react';
import { SortableHeader } from '../ui/SortableHeader';
import { EmptyState } from '../ui/EmptyState';
import { SegmentedControl } from '../ui/SegmentedControl';
import { VirtualizedTbody } from '../ui/VirtualizedTbody';
import { useVirtualRows } from '../../hooks/useVirtualRows';

type ViewMode = '1m' | '3m' | 'whu';

const VIEW: Record<ViewMode, {
  label: string;
  type: KpiType;
  target: number;
  field: (a: AgentKPI) => number | null;
  hist: (a: AgentKPI) => { date: string; normDate?: string | null; value: number }[] | undefined;
}> = {
  '1m': { label: 'SLA 1 menit', type: 'sla1m', target: 92, field: (a) => a.sla1m, hist: (a) => a.dailyHistory?.sla1m },
  '3m': { label: 'SLA 3 menit', type: 'sla3m', target: 96, field: (a) => a.sla3m, hist: (a) => a.dailyHistory?.sla3m },
  whu: { label: 'WHU', type: 'whu', target: 96, field: (a) => a.whu, hist: (a) => a.dailyHistory?.whu },
};

export const SlaWhuMonitor: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const [search, setSearch] = useState('');
  const [filterTL] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('1m');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const cfg = VIEW[viewMode];

  const handleSort = (key: string) => {
    setSortConfig((prev) =>
      prev && prev.key === key && prev.direction === 'asc'
        ? { key, direction: 'desc' }
        : { key, direction: 'asc' },
    );
  };

  const toggleRow = (csId: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(csId)) next.delete(csId);
      else next.add(csId);
      return next;
    });

  const tableData = useMemo(() => {
    const filtered = data.filter((a) => {
      const matchSearch =
        a.csId.toLowerCase().includes(search.toLowerCase()) ||
        (a.name || '').toLowerCase().includes(search.toLowerCase());
      const matchTL = filterTL ? a.teamLeader === filterTL : true;
      return matchSearch && matchTL && cfg.field(a) !== null;
    });

    if (sortConfig) {
      filtered.sort((a, b) => {
        let aVal: string | number = 0;
        let bVal: string | number = 0;
        switch (sortConfig.key) {
          case 'name': aVal = a.name || a.csId; bVal = b.name || b.csId; break;
          case 'teamLeader': aVal = a.teamLeader || ''; bVal = b.teamLeader || ''; break;
          case 'average': aVal = cfg.field(a) ?? 0; bVal = cfg.field(b) ?? 0; break;
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [data, search, filterTL, cfg, sortConfig]);

  const uniqueDates = useMemo(
    () => uniqueCalendarDates(tableData.map((a) => cfg.hist(a))),
    [tableData, cfg],
  );

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableVirtual = useVirtualRows({
    count: tableData.length,
    rowHeight: 52,
    scrollRef: tableScrollRef,
  });
  const colSpan = 7;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-text-primary">SLA / WHU Monitor</h1>
          <SegmentedControl
            value={viewMode}
            onChange={setViewMode}
            trackClassName="w-max"
            options={[
              { value: '1m', label: 'SLA 1m' },
              { value: '3m', label: 'SLA 3m' },
              { value: 'whu', label: 'WHU' },
            ]}
          />
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted">Klik baris untuk rincian harian</span>
        <KpiLegend />
      </div>

      <div
        ref={tableScrollRef}
        className="relative w-full overflow-auto bg-card border text-sm border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl flex-1 max-h-[calc(100vh-200px)]"
      >
        <table className="kpi-data-table w-full text-left border-collapse">
          <thead className="bg-surface text-text-secondary sticky top-0 z-30">
            <tr>
              <th className="p-2 font-bold text-center border-b border-border bg-surface w-[48px]">No</th>
              <SortableHeader label="Nama / CS ID" sortKey="name" config={sortConfig} onSort={handleSort} className="border-b border-border bg-surface min-w-[200px]" />
              <SortableHeader label="BPO · TL" sortKey="teamLeader" config={sortConfig} onSort={handleSort} className="border-b border-border bg-surface min-w-[130px]" />
              <th className="p-2 font-bold text-text-muted border-b border-border bg-surface min-w-[150px]">Tren 20 hari</th>
              <SortableHeader label={`Rata-rata · t ${cfg.target}%`} sortKey="average" config={sortConfig} onSort={handleSort} className="text-right text-text-primary border-b border-border bg-surface w-[110px]" />
              <th className="p-2 font-bold text-right text-text-muted border-b border-border bg-surface w-[72px]">vs&nbsp;{cfg.target}</th>
              <th className="p-2 border-b border-border bg-surface w-[40px]" aria-hidden />
            </tr>
          </thead>
          <VirtualizedTbody
            colSpan={colSpan}
            paddingTop={tableVirtual.paddingTop}
            paddingBottom={tableVirtual.paddingBottom}
          >
            {tableVirtual.virtualIndexes.map((index) => {
              const agent = tableData[index];
              if (!agent) return null;
              const displayName = agent.name || agent.csId;
              const histIndex = indexByDate(cfg.hist(agent));
              const dailyVals = uniqueDates.map((date) => {
                const d = getByCalendarDate(histIndex, date);
                return d && d.value !== null && d.value !== undefined ? d.value : null;
              });
              const avg = cfg.field(agent);
              const status = getKpiStatus(avg, cfg.type);
              const vsTarget = avg !== null ? avg - cfg.target : null;
              const isOpen = expandedRows.has(agent.csId);

              return (
                <React.Fragment key={agent.csId}>
                  <tr
                    className="border-b border-border transition-colors group hover:bg-surface-muted cursor-pointer"
                    onClick={() => toggleRow(agent.csId)}
                  >
                    <td className="p-2 text-center text-text-muted font-medium w-[48px]">{index + 1}</td>
                    <td className="p-2 min-w-[200px]">
                      <div className="font-semibold text-text-primary truncate" title={agent.csId}>{displayName}</div>
                      <div className="text-[9px] text-text-muted truncate">{agent.csId}</div>
                    </td>
                    <td className="p-2 text-text-secondary min-w-[130px] truncate">
                      <span className="uppercase">{agent.bpo || '-'}</span>
                      <span className="text-text-muted"> · {agent.teamLeader || '-'}</span>
                    </td>
                    <td className="p-2 min-w-[150px]">
                      <div className={status === 'miss' ? 'text-danger' : status === 'watch' ? 'text-warning' : 'text-text-muted'}>
                        <Sparkline values={dailyVals} height={22} />
                      </div>
                    </td>
                    <td className="p-2 text-right w-[110px]">
                      {avg !== null
                        ? <KpiValue value={avg} type={cfg.type} text={`${formatNum(avg, 1)}%`} className="justify-end" />
                        : <span className="text-[11px] text-text-disabled">-</span>}
                    </td>
                    <td className="p-2 text-right w-[72px] text-[11px] tabular-nums">
                      {vsTarget !== null ? (
                        <span className={`inline-flex items-center justify-end gap-1 font-medium ${status === 'miss' ? 'text-danger' : status === 'watch' ? 'text-warning' : 'text-text-muted'}`}>
                          <KpiCue status={status} />
                          {vsTarget >= 0 ? '+' : '−'}{Math.abs(vsTarget).toFixed(1)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-2 text-center w-[40px]">
                      <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-surface/40 border-b border-border">
                      <td colSpan={colSpan} className="px-4 pb-4 pt-1">
                        <div className="text-[9px] text-text-muted uppercase tracking-wide pt-3 pb-2">
                          {cfg.label} per hari &mdash; hanya di bawah target yang berwarna &middot; sel kosong = tidak ada data
                        </div>
                        <DayStrip
                          kpiType={cfg.type}
                          items={uniqueDates.map((date, di) => ({ date, value: dailyVals[di] })).slice().reverse()}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {tableData.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="p-4 z-10">
                  <EmptyState
                    title={`Tidak ada data ${cfg.label}`}
                    description="Coba ubah pencarian atau rentang tanggal."
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

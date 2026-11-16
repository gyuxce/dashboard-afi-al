import React, { useState, useMemo, useRef } from 'react';
import type { AgentKPI } from '../../lib/dataProcessor';
import { SLA_VIEWS, filterSlaAgents, sortSlaAgents, type SlaViewMode as ViewMode, type SortConfig } from '../../lib/slaStats';
import {
  formatNum,
  getKpiStatus,
  uniqueCalendarDates,
  indexByDate,
  getByCalendarDate,
  formatCsId,
} from '../../lib/utils';
import { KpiValue, KpiCue, KpiLegend } from '../ui/KpiCue';
import { Sparkline } from '../ui/Sparkline';
import { DayStrip } from '../ui/DayStrip';
import { ChevronDown } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { SearchField } from '../ui/SearchField';
import { SortableHeader } from '../ui/SortableHeader';
import { EmptyState } from '../ui/EmptyState';
import { SegmentedControl } from '../ui/SegmentedControl';
import { VirtualizedTbody } from '../ui/VirtualizedTbody';
import { useVirtualRows } from '../../hooks/useVirtualRows';

export const SlaWhuMonitor: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const [search, setSearch] = useState('');
  const [filterTL] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('1m');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const cfg = SLA_VIEWS[viewMode];

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

  const tableData = useMemo(
    () => sortSlaAgents(filterSlaAgents(data, search, filterTL, cfg), sortConfig, cfg),
    [data, search, filterTL, cfg, sortConfig],
  );

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
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Service"
        title="SLA / WHU Monitor"
        subtitle={`${cfg.label}, target ${cfg.target}%: siapa yang menjawab tepat waktu dan siapa yang tertinggal.`}
        actions={
          <>
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
            <SearchField value={search} onChange={setSearch} />
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted">Klik baris untuk rincian harian</span>
        <KpiLegend />
      </div>

      <div
        ref={tableScrollRef}
        className="ui-card p-0! relative w-full overflow-auto text-sm flex-1 max-h-[calc(100vh-200px)]"
      >
        <table className="kpi-data-table rank-table w-full text-left border-collapse">
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
                      <div className="text-[9px] text-text-muted truncate" title={agent.csId}>{formatCsId(agent.csId)}</div>
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

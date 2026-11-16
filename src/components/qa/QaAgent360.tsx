import React, { useState, useMemo, useRef } from 'react';
import { AgentKPI, normalizeDateStr } from '../../lib/dataProcessor';
import { QA_TARGET, buildDefectData, buildQaHighlights, filterQaAgents, isQaDefect, sortDefectAgents, sortPerformanceAgents, type SortConfig } from '../../lib/qaStats';
import { formatNum, getKpiStatus, groupByDate, uniqueCalendarDates, getGroupByCalendarDate, formatCalendarHeader, parseDateForSort, formatCsId } from '../../lib/utils';
import { KpiValue, KpiCue, KpiLegend } from '../ui/KpiCue';
import { Sparkline } from '../ui/Sparkline';
import { DayStrip } from '../ui/DayStrip';
import { Eye, X, BarChart2, AlertCircle, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

import { SortableHeader } from '../ui/SortableHeader';
import { EmptyState } from '../ui/EmptyState';
import { MobileScrollHint } from '../ui/ChartScrollArea';
import { KpiRankLists } from '../ui/KpiRankLists';
import { SegmentedControl } from '../ui/SegmentedControl';
import { PageHeader } from '../ui/PageHeader';
import { SearchField } from '../ui/SearchField';
import { StatCard } from '../ui/StatCard';
import { VirtualizedTbody } from '../ui/VirtualizedTbody';
import { useVirtualRows } from '../../hooks/useVirtualRows';

export const QaAgent360: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const [search, setSearch] = useState('');
  const [filterTL] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<{agent: AgentKPI, date?: string, type?: 'all' | 'defects' | 'no_mistake'} | null>(null);
  const [viewMode, setViewMode] = useState<'performance' | 'defect'>('performance');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleRow = (csId: string) =>
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(csId)) next.delete(csId);
      else next.add(csId);
      return next;
    });
  
  const [perfSortConfig, setPerfSortConfig] = useState<SortConfig>(null);
  const [defectSortConfig, setDefectSortConfig] = useState<SortConfig>(null);

  const handlePerfSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (perfSortConfig && perfSortConfig.key === key && perfSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setPerfSortConfig({ key, direction });
  };

  const handleDefectSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (defectSortConfig && defectSortConfig.key === key && defectSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setDefectSortConfig({ key, direction });
  };

  React.useEffect(() => {
    if (selectedAgent) {
      setExpandedDates(new Set());
    }
  }, [selectedAgent]);

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const tableData = useMemo(() => filterQaAgents(data, search, filterTL), [data, search, filterTL]);

  const uniqueDates = useMemo(() => {
    return uniqueCalendarDates(tableData.map((a) => a.qaHistory));
  }, [tableData]);

  const defectData = useMemo(() => buildDefectData(tableData), [tableData]);
  const sortedPerformanceData = useMemo(() => sortPerformanceAgents(defectData, perfSortConfig), [defectData, perfSortConfig]);
  const sortedDefectData = useMemo(() => sortDefectAgents(defectData, defectSortConfig), [defectData, defectSortConfig]);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const activeTableData = viewMode === 'performance' ? sortedPerformanceData : sortedDefectData;
  const tableVirtual = useVirtualRows({
    count: activeTableData.length,
    rowHeight: 52,
    scrollRef: tableScrollRef,
  });
  const perfTableColSpan = 8;
  const defectTableColSpan = 10;

  const highlightStats = useMemo(() => buildQaHighlights(tableData, defectData), [tableData, defectData]);

  return (
    <div className="flex flex-col gap-5 relative">
      <PageHeader
        eyebrow="Kualitas"
        title="QA Agent 360"
        subtitle={`Skor QA dan temuan per agent, target ${QA_TARGET}%: dari ringkasan sampai audit trail defect.`}
        actions={
          <>
            <SegmentedControl
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'performance', label: 'Ringkasan', icon: BarChart2 },
                { value: 'defect', label: 'Analisis Defect', icon: AlertCircle },
              ]}
            />
            <SearchField value={search} onChange={setSearch} />
          </>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
        <StatCard label="Total evaluasi" value={formatNum(highlightStats.totalEvaluations, 0)} sub="Pada periode terpilih" />
        <StatCard label="Total temuan" value={formatNum(highlightStats.totalMistakes, 0)} sub="LOW sampai VERY HIGH" />
        <StatCard label="% temuan" value={formatNum(highlightStats.mistakeRate, 1)} unit="%" sub="Temuan dari total evaluasi" />
      </div>

      <KpiRankLists
        summaryLabel="Highlight KPI"
        cards={[
          { title: 'Top 3 Temuan', items: highlightStats.topCategories, tone: 'bad' },
          { title: 'Bottom 3 Hari', items: highlightStats.bottomDays, tone: 'bad' },
          { title: 'Top 3 Agent (QA)', items: highlightStats.topAgents, tone: 'good' },
          { title: 'Bottom 3 Agent (QA)', items: highlightStats.bottomAgents, tone: 'bad' },
        ]}
      />

      {viewMode === 'performance' ? (
        <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted">Klik baris untuk rincian harian &middot; klik angka defect untuk audit trail</span>
          <KpiLegend />
        </div>
      <div ref={tableScrollRef} className="ui-card p-0! relative w-full overflow-auto text-sm flex-1 max-h-[calc(100vh-200px)]">
            <table className="kpi-data-table rank-table rank-m-hide-7 w-full text-left border-collapse">
              <thead className="bg-surface text-text-secondary sticky top-0 z-30">
                <tr>
                  <th className="p-2 font-bold text-center border-b border-border bg-surface w-[48px]">No</th>
                  <SortableHeader label="Nama / CS ID" sortKey="name" config={perfSortConfig} onSort={handlePerfSort} className="border-b border-border bg-surface min-w-[200px]" />
                  <SortableHeader label="BPO · TL" sortKey="teamLeader" config={perfSortConfig} onSort={handlePerfSort} className="border-b border-border bg-surface min-w-[130px]" />
                  <th className="p-2 font-bold text-text-muted border-b border-border bg-surface min-w-[150px]">Tren 20 hari</th>
                  <SortableHeader label="Rata-rata QA" sortKey="average" config={perfSortConfig} onSort={handlePerfSort} className="text-right text-text-primary border-b border-border bg-surface w-[112px]" />
                  <th className="p-2 font-bold text-right text-text-muted border-b border-border bg-surface w-[72px]">vs&nbsp;92</th>
                  <th className="p-2 font-bold text-right text-text-muted border-b border-border bg-surface w-[84px]">Defect</th>
                  <th className="p-2 border-b border-border bg-surface w-[40px]" aria-hidden />
                </tr>
              </thead>
              <VirtualizedTbody
                colSpan={perfTableColSpan}
                paddingTop={tableVirtual.paddingTop}
                paddingBottom={tableVirtual.paddingBottom}
              >
                {tableVirtual.virtualIndexes.map((index) => {
                  const agent = sortedPerformanceData[index];
                  if (!agent) return null;
                  const displayName = agent.name || agent.csId;
                  const qaByDate = groupByDate(agent.qaHistory);
                  const dailyAvgs = uniqueDates.map((date) => {
                    const valid = getGroupByCalendarDate(qaByDate, date).filter((h) => h.hasScore);
                    if (valid.length === 0) return null;
                    return valid.reduce((a, c) => a + c.score, 0) / valid.length;
                  });
                  const avg = agent.qaScoreCount > 0 ? agent.qaScoreSum / agent.qaScoreCount : null;
                  const vsTarget = avg !== null ? avg - QA_TARGET : null;
                  const vsStatus = getKpiStatus(avg, 'qa');
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
                        <div className={vsStatus === 'miss' ? 'text-danger' : vsStatus === 'watch' ? 'text-warning' : 'text-text-muted'}>
                          <Sparkline values={dailyAvgs} height={22} />
                        </div>
                      </td>
                      <td className="p-2 text-right w-[112px]">
                        {avg !== null ? (
                          <div className="flex flex-col items-end">
                            <KpiValue value={avg} type="qa" text={formatNum(avg, 2)} className="justify-end" />
                            <span className="text-[9px] text-text-muted tabular-nums">{agent.qaScoreCount} evaluasi</span>
                          </div>
                        ) : <span className="text-[11px] text-text-disabled">-</span>}
                      </td>
                      <td className="p-2 text-right w-[72px] text-[11px] tabular-nums">
                        {vsTarget !== null ? (
                          <span className={`inline-flex items-center justify-end gap-1 font-medium ${vsStatus === 'miss' ? 'text-danger' : vsStatus === 'watch' ? 'text-warning' : 'text-text-muted'}`}>
                            <KpiCue status={vsStatus} />
                            {vsTarget >= 0 ? '+' : '−'}{Math.abs(vsTarget).toFixed(1)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-2 text-right w-[84px] text-[11px] tabular-nums">
                        {agent.totalDefect > 0 ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedAgent({ agent, type: 'defects' }); }}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 font-semibold text-text-secondary hover:border-primary hover:text-primary transition-colors cursor-pointer"
                            title="Buka audit trail defect"
                          >
                            {agent.totalDefect}
                            <ChevronRight className="h-3 w-3" aria-hidden />
                          </button>
                        ) : <span className="text-text-disabled">0</span>}
                      </td>
                      <td className="p-2 text-center w-[40px]">
                        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-surface/40 border-b border-border">
                        <td colSpan={perfTableColSpan} className="px-4 pb-4 pt-1">
                          <div className="text-[9px] text-text-muted uppercase tracking-wide pt-3 pb-2">
                            QA per hari &mdash; hanya di bawah target yang berwarna &middot; sel kosong = tidak ada audit &middot; klik untuk audit trail
                          </div>
                          <DayStrip
                            kpiType="qa"
                            format={(v) => formatNum(v, 2)}
                            chipWidth={50}
                            items={uniqueDates.map((date, di) => ({ date, value: dailyAvgs[di] })).slice().reverse()}
                            onSelect={(date) => setSelectedAgent({ agent, date, type: 'defects' })}
                          />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
                {sortedPerformanceData.length === 0 && (
                  <tr>
                    <td colSpan={perfTableColSpan} className="p-4 z-10">
                      <EmptyState
                        title="Tidak ada data QA performance"
                        description="Coba ubah pencarian, filter TL, view mode, atau rentang tanggal."
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
        </>
      ) : (
        <>
        <MobileScrollHint label="Geser → untuk lihat semua kolom" />
      <div ref={tableScrollRef} className="ui-card p-0! relative w-full overflow-auto text-sm flex-1 max-h-[calc(100vh-200px)]">
            <table className="kpi-data-table w-full text-left whitespace-nowrap border-collapse">
              <thead className="bg-surface text-text-secondary sticky top-0 z-30">
                <tr>
                  <th className="p-2 font-bold text-center border-b border-border md:sticky md:left-0 z-40 bg-surface min-w-[60px] max-w-[60px]">No</th>
                  <SortableHeader label="Nama / CS ID" sortKey="name" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border md:sticky md:left-[60px] z-40 bg-surface min-w-[250px] max-w-[250px]" />
                  <SortableHeader label="BPO" sortKey="bpo" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border md:sticky md:left-[310px] z-40 bg-surface min-w-[80px] max-w-[80px]" />
                  <SortableHeader label="TL" sortKey="teamLeader" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border md:sticky md:left-[390px] z-40 bg-surface min-w-[120px] max-w-[120px]" />
                  <th className="p-2 font-bold text-center border-b border-border md:sticky md:left-[510px] z-40 bg-surface min-w-[72px] max-w-[72px] shadow-[10px_0_15px_-3px_rgba(0,0,0,0.05)]">Aksi</th>
                  <SortableHeader label="Low" sortKey="low" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border text-center bg-surface text-text-primary" />
                  <SortableHeader label="Medium" sortKey="medium" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border text-center bg-surface text-text-primary" />
                  <SortableHeader label="High" sortKey="high" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border text-center bg-surface text-text-primary" />
                  <SortableHeader label="Very High" sortKey="veryHigh" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border text-center bg-surface text-text-primary" />
                  <SortableHeader label="Temuan tersering" sortKey="category" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border bg-surface text-text-secondary" />
                </tr>
              </thead>
              <VirtualizedTbody
                colSpan={defectTableColSpan}
                paddingTop={tableVirtual.paddingTop}
                paddingBottom={tableVirtual.paddingBottom}
              >
                {tableVirtual.virtualIndexes.map((index) => {
                  const agent = sortedDefectData[index];
                  if (!agent) return null;
                  const displayName = agent.name || agent.csId;

                  return (
                    <tr key={agent.csId} className="border-b border-border transition-colors group hover:bg-surface-muted">
                      <td className="p-2 text-center text-text-muted font-medium md:sticky md:left-0 z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[60px] max-w-[60px]">{index + 1}</td>
                      <td className="p-2 font-medium md:sticky md:left-[60px] z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[250px] max-w-[250px] truncate">
                        <span className="text-kpi-neutral-text font-semibold" title={agent.csId}>
                          {displayName}
                        </span>
                      </td>
                      <td className="p-2 font-medium text-text-primary uppercase md:sticky md:left-[310px] z-20 bg-card group-hover:bg-surface-muted min-w-[80px] max-w-[80px] truncate">
                        {agent.bpo || '-'}
                      </td>
                      <td className="p-2 font-medium text-text-primary md:sticky md:left-[390px] z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[120px] max-w-[120px] truncate">{agent.teamLeader || '-'}</td>
                      <td className="p-2 text-center md:sticky md:left-[510px] z-20 bg-card group-hover:bg-surface-muted min-w-[72px] max-w-[72px] shadow-[10px_0_15px_-3px_rgba(0,0,0,0.05)]">
                        <button 
                          onClick={() => setSelectedAgent({ agent, type: 'defects' })}
                          className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-primary transition-colors px-2 py-1 rounded hover:bg-surface-muted relative cursor-pointer"
                          title="View Defect Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="font-bold">Detail</span>
                          {agent.totalDefect > 0 && (
                            <span className="text-danger text-[9px] font-bold px-1.5 py-0.5 rounded-full absolute -top-1 -right-2 leading-none shadow-[0_1px_3px_rgba(0,0,0,0.04)]">{agent.totalDefect}</span>
                          )}
                        </button>
                      </td>
                      
                      <td className={`p-2 text-center z-10 `}><span className={`inline-flex font-bold ${agent.lowCount > 0 ? 'text-text-primary' : 'text-text-disabled'}`}>{agent.lowCount || '-'}</span></td>
                      <td className={`p-2 text-center z-10 `}><span className={`inline-flex font-bold ${agent.mediumCount > 0 ? 'text-text-primary' : 'text-text-disabled'}`}>{agent.mediumCount || '-'}</span></td>
                      <td className={`p-2 text-center z-10 `}><span className={`inline-flex font-bold ${agent.highCount > 0 ? 'text-text-primary' : 'text-text-disabled'}`}>{agent.highCount || '-'}</span></td>
                      <td className={`p-2 text-center z-10 `}><span className={`inline-flex font-bold ${agent.veryHighCount > 0 ? 'text-text-primary' : 'text-text-disabled'}`}>{agent.veryHighCount || '-'}</span></td>
                      
                      <td className="p-2 font-medium text-text-primary z-10 truncate max-w-[200px]">
                        {agent.mostFrequentMistake === '-' ? <span className="text-text-muted ml-4">-</span> : agent.mostFrequentMistake}
                      </td>
                    </tr>
                  );
                })}
                {sortedDefectData.length === 0 && (
                  <tr>
                    <td colSpan={defectTableColSpan} className="p-4 z-10">
                      <EmptyState
                        title="Tidak ada defect QA"
                        description="Tidak ada defect pada filter dan view mode saat ini."
                        variant="data"
                        className="border-0 bg-transparent py-6"
                      />
                    </td>
                  </tr>
                )}
              </VirtualizedTbody>
            </table>
        </div>
        </>
      )}

      {selectedAgent && (() => {
        const currentAgentData = defectData.find(a => a.csId === selectedAgent.agent.csId);
        
        let filteredDefectsList = currentAgentData?.qaHistory || [];
        if (selectedAgent.type === 'defects') {
           filteredDefectsList = filteredDefectsList.filter(isQaDefect);
        } else if (selectedAgent.type === 'no_mistake') {
           filteredDefectsList = filteredDefectsList.filter(q => {
              const level = (q.mistakeLevel || '').toUpperCase();
              return level.includes('NO MISTAKE');
           });
        }
        
        const filteredDefects = selectedAgent.date
          ? filteredDefectsList.filter((q) => {
              const nd = q.normDate || normalizeDateStr(q.date || '');
              return nd === selectedAgent.date || q.date === selectedAgent.date;
            })
          : filteredDefectsList;

        const categoryCounts: Record<string, number> = {};
        filteredDefects.forEach(d => {
           const cat = d.category || '-';
           categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });
        
        let topCategories = Object.entries(categoryCounts)
           .filter(([cat]) => cat !== '-')
           .sort((a, b) => b[1] - a[1])
           .slice(0, 3)
           .map(entry => entry[0]);
           
        if (topCategories.length === 0) topCategories = ['-'];

        const groupedDefects = filteredDefects.reduce((acc, curr) => {
           if(!acc[curr.date]) acc[curr.date] = [];
           acc[curr.date].push(curr);
           return acc;
        }, {} as Record<string, typeof filteredDefects>);
        
        const sortedDates = Object.keys(groupedDefects).sort((a, b) => parseDateForSort(b) - parseDateForSort(a));

        const typeColor = selectedAgent.type === 'defects' ? 'text-danger' : selectedAgent.type === 'no_mistake' ? 'text-success' : 'text-primary';
        const countLabel = selectedAgent.type === 'defects' ? 'Total defect' : selectedAgent.type === 'no_mistake' ? 'Tanpa temuan' : 'Total evaluasi';
        const titleLabel = selectedAgent.type === 'all' ? 'Riwayat evaluasi QA' : selectedAgent.type === 'no_mistake' ? 'Evaluasi tanpa temuan' : 'Riwayat audit';

        const idChip = (label: string, value?: string) => value ? (
          <button
            key={label}
            type="button"
            onClick={(e) => handleCopy(e, value)}
            className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-text-secondary transition-colors hover:border-primary"
            title={`Salin ${label}`}
          >
            <span className="text-text-muted">{label}</span>
            <span className="max-w-[150px] truncate">{value}</span>
            {copiedId === value ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 text-text-muted" />}
          </button>
        ) : null;

        return (
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-text-primary/50 p-4 backdrop-blur-sm"
            onClick={() => setSelectedAgent(null)}
          >
            <div
              className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* header */}
              <div className="border-b border-border bg-surface-muted p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex flex-wrap items-center gap-2 text-base font-bold text-text-primary">
                      <AlertCircle className={`h-4 w-4 shrink-0 ${typeColor}`} />
                      <span>{titleLabel}</span>
                      <span className="truncate text-text-secondary">{selectedAgent.agent.name || selectedAgent.agent.csId}</span>
                      {selectedAgent.date && <span className="text-xs font-normal text-text-muted">&middot; {formatCalendarHeader(selectedAgent.date)}</span>}
                    </h3>
                    <p className="mt-1 text-[11px] text-text-muted">
                      CS ID <span className="font-semibold text-text-secondary">{selectedAgent.agent.csId}</span>
                      <span className="mx-1.5 text-border">&bull;</span>
                      TL <span className="font-semibold text-text-secondary">{selectedAgent.agent.teamLeader || '-'}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedAgent(null)}
                    aria-label="Tutup"
                    className="shrink-0 rounded-full p-1.5 text-text-muted transition-colors hover:bg-card hover:text-text-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {!selectedAgent.date && (
                  <div className="mt-3 inline-flex w-max gap-1 rounded-lg bg-card p-1">
                    {([
                      ['defects', 'Defect'],
                      ['no_mistake', 'Tanpa temuan'],
                      ['all', 'Semua evaluasi'],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedAgent({ ...selectedAgent, type: key })}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${selectedAgent.type === key ? 'bg-surface-muted text-primary' : 'text-text-muted hover:text-text-primary'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-2">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-text-muted">{countLabel}</div>
                    <div className={`text-lg font-semibold leading-none ${typeColor}`}>{filteredDefects.length}</div>
                  </div>
                  {topCategories[0] !== '-' && (
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-wide text-text-muted">Top kategori</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {topCategories.map((cat, i) => (
                          <span key={i} className="max-w-[220px] truncate rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-text-secondary" title={cat}>{cat}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* body — card list per date */}
              <div className="flex-1 overflow-y-auto p-4">
                {sortedDates.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {sortedDates.map(date => {
                      const defects = groupedDefects[date];
                      const isExpanded = expandedDates.has(date) || sortedDates.length === 1;
                      return (
                        <div key={date}>
                          <button
                            type="button"
                            onClick={() => setExpandedDates(prev => {
                              const next = new Set(prev);
                              if (next.has(date)) next.delete(date);
                              else next.add(date);
                              return next;
                            })}
                            className="flex w-full items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-left transition-colors hover:bg-surface"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
                            <span className="text-[13px] font-bold text-text-primary">{date}</span>
                            <span className="ml-1 rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-text-muted">
                              {defects.length} temuan
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="mt-2 flex flex-col gap-2 pl-2">
                              {defects.map((q, i) => {
                                const levelStr = (q.mistakeLevel || '').toUpperCase();
                                let badgeClass = 'bg-surface-muted text-text-secondary';
                                if (levelStr.includes('VERY HIGH')) badgeClass = 'text-danger border border-danger';
                                else if (levelStr.includes('HIGH') || levelStr.includes('MAJOR')) badgeClass = 'bg-danger-soft text-danger border border-danger';
                                else if (levelStr.includes('MEDIUM') || levelStr.includes('MINOR')) badgeClass = 'bg-warning-soft text-warning border border-warning';
                                else if (levelStr.includes('LOW')) badgeClass = 'bg-primary-soft text-primary border border-primary';
                                else if (levelStr.includes('NO MISTAKE')) badgeClass = 'bg-success-soft text-success border border-success';

                                return (
                                  <div key={`${date}-${i}`} className="rounded-lg border border-border bg-surface/40 p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badgeClass}`}>
                                        {q.mistakeLevel || 'N/A'}
                                      </span>
                                      <span className="text-[13px] font-semibold text-text-primary">{q.category || '-'}</span>
                                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-text-muted">
                                        {q.date}{q.caseDate && q.caseDate !== q.date ? ` · kasus ${q.caseDate}` : ''}
                                      </span>
                                    </div>

                                    {q.remarks && (
                                      <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-text-secondary">{q.remarks}</p>
                                    )}

                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-text-muted">
                                      {q.crmKode && <span>CRM <strong className="text-text-secondary">{q.crmKode}</strong></span>}
                                      {q.qcName && <span>QC <strong className="text-text-secondary">{q.qcName}</strong></span>}
                                      {idChip('Ticket', q.ticketId)}
                                      {idChip('Chat', q.chatId)}
                                      {idChip('UID', q.uid)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface-muted">
                      <BarChart2 className="h-8 w-8 text-text-disabled" />
                    </div>
                    <div className="text-base font-bold text-text-secondary">
                      {selectedAgent.type === 'defects' ? 'Tidak ada defect untuk agent ini.' : 'Tidak ada evaluasi.'}
                    </div>
                    <div className="mt-1 max-w-sm text-text-muted">
                      {selectedAgent.type === 'defects' ? 'Tidak ada temuan tercatat pada periode terpilih.' : 'Belum ada data evaluasi QA untuk ditampilkan.'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};


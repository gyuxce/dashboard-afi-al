import React, { useState, useMemo, useRef } from 'react';
import { AgentKPI, QAEntry, normalizeDateStr } from '../../lib/dataProcessor';
import { formatNum, getKpiStatus, groupByDate, uniqueCalendarDates, getGroupByCalendarDate, formatCalendarHeader, parseDateForSort } from '../../lib/utils';
import { KpiValue, KpiCue, KpiLegend } from '../ui/KpiCue';
import { Sparkline } from '../ui/Sparkline';
import { DayStrip } from '../ui/DayStrip';
import { Search, Eye, X, BarChart2, AlertCircle, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

import { SortableHeader } from '../ui/SortableHeader';
import { EmptyState } from '../ui/EmptyState';
import { MobileScrollHint } from '../ui/ChartScrollArea';
import { KpiRankLists } from '../ui/KpiRankLists';
import { SegmentedControl } from '../ui/SegmentedControl';
import { VirtualizedTbody } from '../ui/VirtualizedTbody';
import { useVirtualRows } from '../../hooks/useVirtualRows';

const isQaDefect = (entry: QAEntry) => {
  const level = (entry.mistakeLevel || '').toUpperCase();
  return level.includes('LOW') || level.includes('MEDIUM') || level.includes('HIGH') || level.includes('VERY HIGH');
};

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
  
  const [perfSortConfig, setPerfSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [defectSortConfig, setDefectSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

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

  const tableData = useMemo(() => {
    return data.filter(a => {
      const matchSearch = a.csId.toLowerCase().includes(search.toLowerCase()) || (a.name || '').toLowerCase().includes(search.toLowerCase());
      const matchTL = filterTL ? a.teamLeader === filterTL : true;
      return matchSearch && matchTL && a.qaScoreCount > 0;
    });
  }, [data, search, filterTL]);

  const uniqueDates = useMemo(() => {
    return uniqueCalendarDates(tableData.map((a) => a.qaHistory));
  }, [tableData]);

  const defectData = useMemo(() => {
    return tableData.map(agent => {
      const defects = agent.qaHistory
        .filter(isQaDefect)
        .sort((a, b) =>
          parseDateForSort(b.normDate || b.date || '') -
          parseDateForSort(a.normDate || a.date || ''),
        );

      let lowCount = 0;
      let mediumCount = 0;
      let highCount = 0;
      let veryHighCount = 0;
      
      const mistakeCounts: Record<string, number> = {};

      defects.forEach(d => {
        const level = (d.mistakeLevel || '').toUpperCase();
        if (level.includes('VERY HIGH')) veryHighCount++;
        else if (level.includes('HIGH')) highCount++;
        else if (level.includes('MEDIUM')) mediumCount++;
        else if (level.includes('LOW')) lowCount++;

        const category = d.category || '-';
        mistakeCounts[category] = (mistakeCounts[category] || 0) + 1;
      });

      const totalDefect = lowCount + mediumCount + highCount + veryHighCount;
      
      let mostFrequentMistake = '-';
      let maxCount = 0;
      for (const cat in mistakeCounts) {
         if (mistakeCounts[cat] > maxCount) {
             maxCount = mistakeCounts[cat];
             mostFrequentMistake = cat;
         }
      }

      return {
        ...agent,
        defects,
        lowCount,
        mediumCount,
        highCount,
        veryHighCount,
        totalDefect,
        mostFrequentMistake
      };
    }).sort((a, b) => b.totalDefect - a.totalDefect);
  }, [tableData]);

  const sortedPerformanceData = useMemo(() => {
    let sortable = [...defectData];
    if (perfSortConfig) {
      sortable.sort((a, b) => {
        let aVal: any = 0;
        let bVal: any = 0;

        switch (perfSortConfig.key) {
          case 'name':
            aVal = a.name || a.csId;
            bVal = b.name || b.csId;
            break;
          case 'bpo':
            aVal = a.bpo || '';
            bVal = b.bpo || '';
            break;
          case 'teamLeader':
            aVal = a.teamLeader || '';
            bVal = b.teamLeader || '';
            break;
          case 'average':
          default:
            aVal = a.qaScoreCount > 0 ? a.qaScoreSum / a.qaScoreCount : -1;
            bVal = b.qaScoreCount > 0 ? b.qaScoreSum / b.qaScoreCount : -1;
            break;
        }

        if (aVal < bVal) return perfSortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return perfSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [defectData, perfSortConfig]);

  const sortedDefectData = useMemo(() => {
    let sortable = defectData.filter(agent => agent.totalDefect > 0);
    if (defectSortConfig) {
      sortable.sort((a, b) => {
        let aVal: any = 0;
        let bVal: any = 0;

        switch (defectSortConfig.key) {
          case 'name':
            aVal = a.name || a.csId;
            bVal = b.name || b.csId;
            break;
          case 'bpo':
            aVal = a.bpo || '';
            bVal = b.bpo || '';
            break;
          case 'teamLeader':
            aVal = a.teamLeader || '';
            bVal = b.teamLeader || '';
            break;
          case 'low':
            aVal = a.lowCount || 0;
            bVal = b.lowCount || 0;
            break;
          case 'medium':
            aVal = a.mediumCount || 0;
            bVal = b.mediumCount || 0;
            break;
          case 'high':
            aVal = a.highCount || 0;
            bVal = b.highCount || 0;
            break;
          case 'veryHigh':
            aVal = a.veryHighCount || 0;
            bVal = b.veryHighCount || 0;
            break;
          case 'category':
            aVal = a.mostFrequentMistake || '';
            bVal = b.mostFrequentMistake || '';
            break;
          default:
            aVal = a.totalDefect;
            bVal = b.totalDefect;
            break;
        }

        if (aVal < bVal) return defectSortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return defectSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      sortable.sort((a, b) => b.totalDefect - a.totalDefect);
    }
    return sortable;
  }, [defectData, defectSortConfig]);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const activeTableData = viewMode === 'performance' ? sortedPerformanceData : sortedDefectData;
  const tableVirtual = useVirtualRows({
    count: activeTableData.length,
    rowHeight: 52,
    scrollRef: tableScrollRef,
  });
  const perfTableColSpan = 8;
  const defectTableColSpan = 10;

  const highlightStats = useMemo(() => {
    const totalEvaluations = tableData.reduce((sum, agent) => sum + agent.qaScoreCount, 0);
    const totalMistakes = defectData.reduce((sum, agent) => sum + agent.totalDefect, 0);
    const categoryCounts: Record<string, number> = {};

    defectData.forEach(agent => {
      agent.defects.forEach(defect => {
        const category = defect.category || 'Tidak ada kategori';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      });
    });

    const categoriesByCount = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const agentsByQa = [...tableData]
      .filter(agent => agent.qaScoreCount > 0)
      .map(agent => ({
        agent,
        avg: agent.qaScoreSum / agent.qaScoreCount,
      }))
      .sort((a, b) => b.avg - a.avg);

    const dailyMap = new Map<string, { scoreSum: number; scoreCount: number; mistakes: number }>();
    tableData.forEach(agent => {
      agent.qaHistory?.forEach(entry => {
        const date = entry.normDate || normalizeDateStr(entry.date || '') || entry.date;
        if (!date) return;
        const current = dailyMap.get(date) || { scoreSum: 0, scoreCount: 0, mistakes: 0 };
        if (entry.hasScore !== false && typeof entry.score === 'number' && !isNaN(entry.score)) {
          current.scoreSum += entry.score;
          current.scoreCount += 1;
        }
        if (isQaDefect(entry)) current.mistakes += 1;
        dailyMap.set(date, current);
      });
    });

    const daysByQa = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({
        date,
        avg: stats.scoreCount > 0 ? stats.scoreSum / stats.scoreCount : null,
        mistakes: stats.mistakes,
        scoreCount: stats.scoreCount,
      }))
      .filter(d => d.avg !== null && d.scoreCount > 0)
      .sort((a, b) => (a.avg || 0) - (b.avg || 0));

    return {
      totalEvaluations,
      totalMistakes,
      mistakeRate: totalEvaluations > 0 ? (totalMistakes / totalEvaluations) * 100 : 0,
      topCategories: categoriesByCount.slice(0, 3).map(c => ({
        label: c.category,
        value: `${formatNum(c.count, 0)} temuan`,
      })),
      bottomDays: daysByQa.slice(0, 3).map(d => ({
        label: formatCalendarHeader(d.date),
        subLabel: `${formatNum(d.mistakes, 0)} temuan · ${formatNum(d.scoreCount, 0)} evaluasi`,
        value: `${formatNum(d.avg, 1)}%`,
      })),
      topAgents: agentsByQa.slice(0, 3).map(a => ({
        label: a.agent.name || a.agent.csId,
        subLabel: a.agent.teamLeader || a.agent.csId,
        value: `${formatNum(a.avg, 1)}%`,
      })),
      bottomAgents:
        agentsByQa.length > 3
          ? agentsByQa.slice(Math.max(3, agentsByQa.length - 3)).reverse().map(a => ({
              label: a.agent.name || a.agent.csId,
              subLabel: a.agent.teamLeader || a.agent.csId,
              value: `${formatNum(a.avg, 1)}%`,
            }))
          : [],
    };
  }, [tableData, defectData]);

  return (
    <div className="flex flex-col gap-4 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between xl:gap-8 gap-4 mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-text-primary">QA Agent 360</h1>
          
          <SegmentedControl
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'performance', label: 'Ringkasan', icon: BarChart2 },
              { value: 'defect', label: 'Analisis Defect', icon: AlertCircle },
            ]}
          />
        </div>
        
        <div className="flex items-center gap-4">
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium tracking-wide text-text-muted">Total Evaluasi</span>
            <BarChart2 className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{formatNum(highlightStats.totalEvaluations, 0)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium tracking-wide text-text-muted">Total Temuan</span>
            <AlertCircle className="h-4 w-4 text-danger" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-danger">{formatNum(highlightStats.totalMistakes, 0)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium tracking-wide text-text-muted">% Temuan</span>
            <AlertCircle className="h-4 w-4 text-warning" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{formatNum(highlightStats.mistakeRate, 1)}%</div>
        </div>
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
      <div ref={tableScrollRef} className="relative w-full overflow-auto bg-card border text-sm border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl transition-all flex-1 max-h-[calc(100vh-200px)]">
            <table className="kpi-data-table w-full text-left border-collapse">
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
                  const vsTarget = avg !== null ? avg - 92 : null;
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
                        <div className="text-[9px] text-text-muted truncate">{agent.csId}</div>
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
      <div ref={tableScrollRef} className="relative w-full overflow-auto bg-card border text-sm border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl transition-all flex-1 max-h-[calc(100vh-200px)]">
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
              className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
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


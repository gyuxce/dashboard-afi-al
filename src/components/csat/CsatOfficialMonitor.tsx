import React, { useState, useMemo, useRef } from 'react';
import { AgentKPI, getOfficialCsatAggregate } from '../../lib/dataProcessor';
import { formatNum, getKpiStatus, getMonthOffsetLabel, parseDateForSort, cn, indexByDate, uniqueCalendarDates, getByCalendarDate } from '../../lib/utils';
import { KpiValue, KpiCue } from '../ui/KpiCue';
import { Sparkline } from '../ui/Sparkline';
import { DayStrip } from '../ui/DayStrip';
import { Search, Star, Users, ChevronDown } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';
import { SortableHeader } from '../ui/SortableHeader';
import { EmptyState } from '../ui/EmptyState';
import { KpiRankLists } from '../ui/KpiRankLists';
import { chart } from '../../lib/themeColors';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { VirtualizedTbody } from '../ui/VirtualizedTbody';
import { useVirtualRows } from '../../hooks/useVirtualRows';

export const CsatOfficialMonitor: React.FC<{ data: AgentKPI[], previousData?: AgentKPI[], previousData2?: AgentKPI[], previousData3?: AgentKPI[] }> = ({ data, previousData = [], previousData2 = [], previousData3 = [] }) => {
  const isComparisonEnabled = useStore(state => state.isComparisonEnabled);
  const [search, setSearch] = useState('');
  const [filterTL] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const CSAT_OFFICIAL_TARGET = 3.75;

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const toggleRow = (csId: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(csId)) next.delete(csId);
      else next.add(csId);
      return next;
    });

  const tableData = useMemo(() => {
    let filtered = data.filter(a => {
      const matchSearch = a.csId.toLowerCase().includes(search.toLowerCase()) || (a.name || '').toLowerCase().includes(search.toLowerCase());
      const matchTL = filterTL ? a.teamLeader === filterTL : true;
      const hasData = a.csatAsli !== null;
      return matchSearch && matchTL && hasData;
    });

    if (sortConfig) {
      filtered.sort((a, b) => {
        let aVal: any = 0;
        let bVal: any = 0;

        switch (sortConfig.key) {
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
            aVal = a.csatAsli || 0;
            bVal = b.csatAsli || 0;
            break;
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [data, search, filterTL, sortConfig]);

  const uniqueDates = useMemo(() => {
    return uniqueCalendarDates(tableData.flatMap((a) => [
      a.dailyHistory?.schedule,
      a.dailyHistory?.csat,
    ]));
  }, [tableData]);
  // Sparkline + day-strip read oldest→newest; uniqueDates is newest-first.
  const chronoDates = useMemo(() => [...uniqueDates].reverse(), [uniqueDates]);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableVirtual = useVirtualRows({
    count: tableData.length,
    rowHeight: 52,
    scrollRef: tableScrollRef,
  });
  const tableColSpan = 7;

  const highlightStats = useMemo(() => {
    const aggregate = getOfficialCsatAggregate(tableData);
    const agentsByScore = [...tableData]
      .filter(agent => agent.csatAsli !== null && agent.csatAsli !== undefined)
      .sort((a, b) => (b.csatAsli || 0) - (a.csatAsli || 0));

    const dailyMap = new Map<string, { sum: number; count: number }>();
    tableData.forEach(agent => {
      agent.dailyHistory?.csat?.forEach(entry => {
        const count = entry.count || 1;
        const current = dailyMap.get(entry.normDate || entry.date) || { sum: 0, count: 0 };
        dailyMap.set(entry.normDate || entry.date, {
          sum: current.sum + (entry.sum ?? entry.value * count),
          count: current.count + count,
        });
      });
    });

    const daysByScore = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, score: stats.count > 0 ? stats.sum / stats.count : 0, count: stats.count }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.score - a.score);

    const topAgents = agentsByScore.slice(0, 3);
    const bottomAgents =
      agentsByScore.length > 3
        ? agentsByScore.slice(Math.max(3, agentsByScore.length - 3)).reverse()
        : [];
    const topDays = daysByScore.slice(0, 3);
    const bottomDays =
      daysByScore.length > 3
        ? daysByScore.slice(Math.max(3, daysByScore.length - 3)).reverse()
        : [];

    return {
      aggregate,
      topAgents: topAgents.map(a => ({
        label: a.name || a.csId,
        subLabel: a.teamLeader || a.csId,
        value: `${formatNum(a.csatAsli, 2)} / 5`,
      })),
      bottomAgents: bottomAgents.map(a => ({
        label: a.name || a.csId,
        subLabel: a.teamLeader || a.csId,
        value: `${formatNum(a.csatAsli, 2)} / 5`,
      })),
      topDays: topDays.map(d => ({
        label: d.date,
        subLabel: `${formatNum(d.count, 0)} responden`,
        value: `${formatNum(d.score, 2)} / 5`,
      })),
      bottomDays: bottomDays.map(d => ({
        label: d.date,
        subLabel: `${formatNum(d.count, 0)} responden`,
        value: `${formatNum(d.score, 2)} / 5`,
      })),
    };
  }, [tableData]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-bold text-text-primary">CSAT Official Monitor</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5 flex-col md:flex-row">
             <div className="relative mt-2 md:mt-0">
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium tracking-wide text-text-muted">Skor CSAT</span>
            <Star className="h-4 w-4 text-warning" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">
            {highlightStats.aggregate.score !== null ? `${formatNum(highlightStats.aggregate.score, 2)} / 5` : '-'}
          </div>
          <p className="mt-1 text-[11px] text-text-muted">Target 3.75</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium tracking-wide text-text-muted">Total Responden</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{formatNum(highlightStats.aggregate.respondents, 0)}</div>
          <p className="mt-1 text-[11px] text-text-muted">Pada periode terpilih</p>
        </div>
      </div>

      <KpiRankLists
        summaryLabel="Highlight KPI"
        cards={[
          { title: 'Top 3 Hari', items: highlightStats.topDays, tone: 'good' },
          { title: 'Bottom 3 Hari', items: highlightStats.bottomDays, tone: 'bad' },
          { title: 'Top 3 Agent', items: highlightStats.topAgents, tone: 'good' },
          { title: 'Bottom 3 Agent', items: highlightStats.bottomAgents, tone: 'bad' },
        ]}
      />

      {isComparisonEnabled && (
        <WoWChartPanel 
          data={data} 
          previousData={previousData} 
          previousData2={previousData2} 
          previousData3={previousData3} 
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted">Klik baris untuk skor harian &middot; target {CSAT_OFFICIAL_TARGET} / 5</span>
      </div>
      <div ref={tableScrollRef} className="relative w-full overflow-auto bg-card border text-sm border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl flex-1 max-h-[calc(100vh-200px)]">
        <table className="kpi-data-table w-full text-left border-collapse">
          <thead className="bg-surface text-text-secondary sticky top-0 z-30">
            <tr>
              <th className="p-2 font-bold text-center border-b border-border bg-surface w-[48px]">No</th>
              <SortableHeader label="Nama / CS ID" sortKey="name" config={sortConfig} onSort={handleSort} className="border-b border-border bg-surface min-w-[200px]" />
              <SortableHeader label="BPO · TL" sortKey="teamLeader" config={sortConfig} onSort={handleSort} className="border-b border-border bg-surface min-w-[130px]" />
              <th className="p-2 font-bold text-text-muted border-b border-border bg-surface min-w-[150px]">Tren 20 hari</th>
              <SortableHeader label={`Rata-rata · t ${CSAT_OFFICIAL_TARGET}`} sortKey="average" config={sortConfig} onSort={handleSort} className="text-right text-text-primary border-b border-border bg-surface w-[110px]" />
              <th className="p-2 font-bold text-right text-text-muted border-b border-border bg-surface w-[72px]">vs&nbsp;{CSAT_OFFICIAL_TARGET}</th>
              <th className="p-2 border-b border-border bg-surface w-[40px]" aria-hidden />
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
              const displayName = agent.name || agent.csId;
              const csatByDate = indexByDate(agent.dailyHistory?.csat);
              const scheduleByDate = indexByDate(agent.dailyHistory?.schedule);
              const dailyVals = chronoDates.map((date) => {
                const d = getByCalendarDate(csatByDate, date);
                return d && d.value !== null && d.value !== undefined ? d.value : null;
              });
              const avg = agent.csatAsli;
              const status = getKpiStatus(avg, 'csatOfficial');
              const vsTarget = avg !== null && avg !== undefined ? avg - CSAT_OFFICIAL_TARGET : null;
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
                      {avg !== null && avg !== undefined
                        ? <KpiValue value={avg} type="csatOfficial" text={formatNum(avg, 2)} className="justify-end" />
                        : <span className="text-[11px] text-text-disabled">-</span>}
                    </td>
                    <td className="p-2 text-right w-[72px] text-[11px] tabular-nums">
                      {vsTarget !== null ? (
                        <span className={`inline-flex items-center justify-end gap-1 font-medium ${status === 'miss' ? 'text-danger' : status === 'watch' ? 'text-warning' : 'text-text-muted'}`}>
                          <KpiCue status={status} />
                          {vsTarget >= 0 ? '+' : '−'}{Math.abs(vsTarget).toFixed(2)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-2 text-center w-[40px]">
                      <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-surface/40 border-b border-border">
                      <td colSpan={tableColSpan} className="px-4 pb-4 pt-1">
                        <div className="text-[9px] text-text-muted uppercase tracking-wide pt-3 pb-2">
                          Skor CSAT per hari &mdash; hanya di bawah target yang berwarna &middot; sel kosong = tidak ada responden
                        </div>
                        <DayStrip
                          kpiType="csatOfficial"
                          format={(v) => formatNum(v, 2)}
                          items={chronoDates.map((date, di) => {
                            const st = getByCalendarDate(scheduleByDate, date)?.status?.toUpperCase() || '';
                            return { date, value: dailyVals[di], off: st === 'OFF' || st === 'C' };
                          })}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {tableData.length === 0 && (
              <tr>
                <td colSpan={tableColSpan} className="p-4 z-10">
                  <EmptyState
                    title="Tidak ada data CSAT official"
                    description="Coba ubah pencarian, filter TL, atau rentang tanggal."
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

const WoWChartPanel = ({ data, previousData, previousData2, previousData3 }: any) => {
  const { startDate, endDate, comparisonMode } = useStore(useShallow((s) => ({
    startDate: s.startDate,
    endDate: s.endDate,
    comparisonMode: s.comparisonMode,
  })));
  const [trendMode, setTrendMode] = useState<'weekly' | 'daily'>('daily');

  const getWeekLabel = (offset: number) => {
    if (!startDate || !endDate) return `Week -${offset}`;
    const diff = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    const end = new Date(endDate);
    if (comparisonMode === 'mom') {
      return getMonthOffsetLabel(startDate, offset);
    }
    end.setDate(end.getDate() - (offset * diff));
    const month = new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(end);
    const weekNum = Math.ceil(end.getDate() / 7);
    return `W${weekNum} ${month}`;
  };

  const calcStats = (dataset: AgentKPI[]) => {
    let sumFull = 0, countFull = 0;
    let sumTakeout = 0, countTakeout = 0;
    const officialCsat = getOfficialCsatAggregate(dataset || []);
    
    (dataset || []).forEach(d => {
      sumFull += d.csatScGoodCount || 0;
      countFull += d.csatScTotalValid || 0;
      sumTakeout += d.csatScFairGoodCount || 0;
      countTakeout += d.csatScFairTotalValid || 0;
    });

    return {
      asli: officialCsat.score !== null ? Number(officialCsat.score.toFixed(2)) : 0,
      full: countFull > 0 ? Number(((sumFull / countFull) * 100).toFixed(2)) : 0,
      takeout: countTakeout > 0 ? Number(((sumTakeout / countTakeout) * 100).toFixed(2)) : 0,
    };
  };

  const w0 = calcStats(data);
  const w1 = calcStats(previousData);
  const w2 = calcStats(previousData2);
  const w3 = calcStats(previousData3);

  const chartData = [
    { name: getWeekLabel(3), 'CSAT Official': w3.asli, 'SC Full': w3.full, 'SC After Takeout': w3.takeout },
    { name: getWeekLabel(2), 'CSAT Official': w2.asli, 'SC Full': w2.full, 'SC After Takeout': w2.takeout },
    { name: getWeekLabel(1), 'CSAT Official': w1.asli, 'SC Full': w1.full, 'SC After Takeout': w1.takeout },
    { name: getWeekLabel(0), 'CSAT Official': w0.asli, 'SC Full': w0.full, 'SC After Takeout': w0.takeout },
  ].filter(d => d.name !== 'WNaN Invalid Date');
  // Drop un-populated periods so a 0 there is not shown.
  const visibleChartData = (comparisonMode === 'mom' ? chartData.slice(1) : chartData)
    .filter(d => (d['CSAT Official'] as number) > 0 || (d['SC Full'] as number) > 0 || (d['SC After Takeout'] as number) > 0);

  const dailyData = React.useMemo(() => {
    const dates = new Map<string, { sum: number, count: number }>();
    (data || []).forEach(a => {
      a.dailyHistory?.csat?.forEach(h => {
        if (!dates.has(h.date)) dates.set(h.date, { sum: 0, count: 0 });
        if (h.value !== null) {
           const respondentCount = h.count || 1;
           dates.get(h.date)!.sum += h.sum ?? h.value * respondentCount;
           dates.get(h.date)!.count += respondentCount;
        }
      });
    });
    
    return Array.from(dates.entries())
      .map(([date, stats]) => {
        const d = new Date(date);
        const validDate = isNaN(d.getTime()) ? date : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d);
        return {
          date: validDate,
          CSAT: stats.count > 0 ? Number((stats.sum / stats.count).toFixed(2)) : 0,
          count: stats.count,
          rawDate: date
        };
      })
      .sort((a, b) => parseDateForSort(a.rawDate) - parseDateForSort(b.rawDate));
  }, [data]);

  const weeklyData = React.useMemo(() => {
    const weeks = new Map<string, { label: string, startDate: string, sum: number, count: number }>();
    const getWeekBucket = (date: string) => {
      const parsedTimestamp = parseDateForSort(date);
      if (!parsedTimestamp) return { key: date, label: date, startDate: date };

      const start = new Date(parsedTimestamp);
      const day = start.getDay();
      start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const toDateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
      const formatDate = (value: Date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(value);
      const label = start.getMonth() === end.getMonth()
        ? `${start.getDate()}-${end.getDate()} ${new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(start)}`
        : `${formatDate(start)}-${formatDate(end)}`;

      return { key: toDateKey(start), label, startDate: toDateKey(start) };
    };

    dailyData.forEach(day => {
      const bucket = getWeekBucket(day.rawDate);
      if (!weeks.has(bucket.key)) {
        weeks.set(bucket.key, { label: bucket.label, startDate: bucket.startDate, sum: 0, count: 0 });
      }
      const week = weeks.get(bucket.key)!;
      week.sum += day.CSAT * day.count;
      week.count += day.count;
    });

    return Array.from(weeks.values())
      .map(week => ({
        date: week.label,
        CSAT: week.count > 0 ? Number((week.sum / week.count).toFixed(2)) : 0,
        rawDate: week.startDate,
      }))
      .sort((a, b) => parseDateForSort(a.rawDate) - parseDateForSort(b.rawDate));
  }, [dailyData]);

  const trendData = trendMode === 'weekly' ? weeklyData : dailyData;

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-4 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Weekly Trend Panel */}
        <div className="flex flex-col">
          <div className="flex items-center justify-center mb-4">
            <h3 className="text-sm font-bold text-text-primary text-center">{comparisonMode === 'mom' ? 'Tren perbandingan 3 bulan' : 'Tren perbandingan 4 minggu'}</h3>
          </div>
          <div className="h-96 w-full border border-border/50 rounded-xl p-5 bg-surface/20">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visibleChartData} margin={{ top: 22, right: 6, left: -14, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--color-surface-muted)', opacity: 0.4 }} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => formatNum(Number(v), 2)} />
                <Bar dataKey="CSAT Official" fill={chart.kpiCsat} radius={[4, 4, 0, 0]} maxBarSize={48}>
                  <LabelList dataKey="CSAT Official" position="top" style={{ fontSize: 11, fontWeight: 700, fill: 'var(--color-text-primary)' }} formatter={(v: any) => (Number(v) > 0 ? formatNum(Number(v), 2) : '')} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly/Daily Trend Panel */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-text-primary">
              {trendMode === 'weekly' ? 'Weekly Average Trend' : 'Daily Trend'} ({comparisonMode === 'mom' ? 'Current Month' : 'Current Week'})
            </h3>
            <div className="inline-flex items-center rounded-lg border border-border bg-surface-muted p-0.5">
              {(['weekly', 'daily'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTrendMode(mode)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors',
                    trendMode === mode ? 'bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {mode === 'weekly' ? 'Weekly' : 'Daily'}
                </button>
              ))}
            </div>
          </div>
          <div className="h-96 w-full border border-border/50 rounded-xl p-5 bg-surface/20">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 22, right: 6, left: -14, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} minTickGap={8} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--color-surface-muted)', opacity: 0.4 }} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => formatNum(Number(v), 2)} />
                <Bar dataKey="CSAT" fill={chart.kpiCsat} radius={[3, 3, 0, 0]} maxBarSize={30}>
                  <LabelList dataKey="CSAT" position="top" style={{ fontSize: 10, fontWeight: 700, fill: 'var(--color-text-primary)' }} formatter={(v: any) => (Number(v) > 0 ? formatNum(Number(v), 2) : '')} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};

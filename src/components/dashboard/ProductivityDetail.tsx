import React, { useMemo, useState, useRef } from "react";
import { AgentKPI } from "../../lib/dataProcessor";
import {
  formatNum,
  getKpiStatus,
  type KpiType,
  indexByDate,
  uniqueCalendarDates,
  getByCalendarDate,
  formatCsId,
} from "../../lib/utils";
import { KpiValue, KpiCue } from "../ui/KpiCue";
import { ProductivityDayCalendar } from "./ProductivityDayCalendar";
import { chart } from "../../lib/themeColors";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { Activity, AlertCircle, ChevronDown } from "lucide-react";
import { PageHeader } from "../ui/PageHeader";
import { SearchField } from "../ui/SearchField";
import { StatCard, type StatTone } from "../ui/StatCard";
import { PROD_TARGET, agentAverage, bottomThreeAgentIds, sortProductivityAgents, summarizeProductivity } from "../../lib/productivityStats";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from "recharts";
import { SortableHeader } from "../ui/SortableHeader";
import { EmptyState } from "../ui/EmptyState";
import { VirtualizedTbody } from "../ui/VirtualizedTbody";
import { useVirtualRows } from "../../hooks/useVirtualRows";
import type { WeekCompare } from "../../lib/weekCompare";


/** Number colour follows status only: neutral unless it misses (or nearly misses) its target. */
const statTone = (status: ReturnType<typeof getKpiStatus>): StatTone => (status === "miss" ? "bad" : status === "watch" ? "warn" : "ink");

export const ProductivityDetail: React.FC<{
  data: AgentKPI[];
  previousData?: AgentKPI[];
  previousData2?: AgentKPI[];
  previousData3?: AgentKPI[];
  weekCompare?: WeekCompare | null;
}> = ({
  data,
  previousData: monthPrevData = [],
  previousData2: monthPrevData2 = [],
  previousData3: monthPrevData3 = [],
  weekCompare = null,
}) => {
  // WoW over a multi-week range: compare calendar weeks (newest first) instead of month-long periods.
  const compareCurrent = weekCompare ? weekCompare.sets[0] : null;
  const previousData = weekCompare ? weekCompare.sets[1] : monthPrevData;
  const previousData2 = weekCompare ? weekCompare.sets[2] : monthPrevData2;
  const previousData3 = weekCompare ? weekCompare.sets[3] : monthPrevData3;
  const [search, setSearch] = useState("");
  const [filterTL] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [selectedHourIndex, setSelectedHourIndex] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (csId: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(csId)) next.delete(csId);
      else next.add(csId);
      return next;
    });

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const { isComparisonEnabled, comparisonMode } = useStore(useShallow((s) => ({
    isComparisonEnabled: s.isComparisonEnabled,
    comparisonMode: s.comparisonMode,
  })));

  const filteredData = useMemo(() => {
    return data.filter((a) => {
      const matchSearch =
        a.csId.toLowerCase().includes(search.toLowerCase()) ||
        (a.name || "").toLowerCase().includes(search.toLowerCase());
      const matchTL = filterTL ? a.teamLeader === filterTL : true;
      return matchSearch && matchTL && a.productivityBase > 0;
    });
  }, [data, search, filterTL]);

  // One column per calendar day (normDate), preferring schedule date labels.
  const uniqueDates = useMemo(() => {
    return uniqueCalendarDates(filteredData.flatMap((a) => [
      a.dailyHistory?.schedule,
      a.dailyHistory?.productivity,
    ]));
  }, [filteredData]);
  // Sparkline reads left→right as oldest→newest; uniqueDates is newest-first.
  const chronoDates = useMemo(() => [...uniqueDates].reverse(), [uniqueDates]);

  const tableData = useMemo(() => sortProductivityAgents(filteredData, sortConfig), [filteredData, sortConfig]);
  const bottomThreeIds = useMemo(() => bottomThreeAgentIds(filteredData), [filteredData]);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableVirtual = useVirtualRows({
    count: tableData.length,
    rowHeight: 52,
    scrollRef: tableScrollRef,
  });
  const tableColSpan = 8;

  // --- Hero widgets ---
  const {
    totalChat,
    totalAvg,
    totalManDays,
    activeAgents,
    underTarget,
    totalQuota,
    quotaAchievement,
    totalGap,
  } = useMemo(() => summarizeProductivity(data), [data]);

  const hourlyDataWow = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const filterAgent = (a: AgentKPI) => {
      const matchSearch =
        a.csId.toLowerCase().includes(search.toLowerCase()) ||
        (a.name || "").toLowerCase().includes(search.toLowerCase());
      const matchTL = filterTL ? a.teamLeader === filterTL : true;
      return matchSearch && matchTL && a.productivityBase > 0;
    };

    const prevFiltered = previousData.filter(filterAgent);
    const prev2Filtered = previousData2.filter(filterAgent);
    const prev3Filtered = previousData3.filter(filterAgent);

    return hours.map((hr) => {
      const getSum = (dataset: AgentKPI[]) =>
        dataset.reduce((sum, agent) => sum + (agent.hourlyProductivity?.[hr] || 0), 0);

      return {
        hour: `${String(hr).padStart(2, "0")}:00`,
        total: getSum(compareCurrent ? compareCurrent.filter(filterAgent) : tableData),
        prev: previousData.length ? getSum(prevFiltered) : null,
        prev2: previousData2.length ? getSum(prev2Filtered) : null,
        prev3: previousData3.length ? getSum(prev3Filtered) : null,
      };
    });
  }, [tableData, compareCurrent, previousData, previousData2, previousData3, search, filterTL]);

  const intervalCategoryInsights = useMemo(() => {
    return hourlyDataWow.map((hourData, hourIndex) => {
      const categoryCounts: Record<string, number> = {};
      tableData.forEach((agent) => {
        const hourlyCounts = agent.hourlyCategoryCounts?.[hourIndex] || {};
        Object.entries(hourlyCounts).forEach(([category, count]) => {
          categoryCounts[category] = (categoryCounts[category] || 0) + Number(count);
        });
      });

      const topCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, count]) => ({
          category,
          count,
          share: hourData.total > 0 ? (count / hourData.total) * 100 : 0,
        }));

      return {
        hour: hourData.hour,
        total: hourData.total,
        change: typeof hourData.prev === "number" ? hourData.total - hourData.prev : null,
        topCategories,
      };
    });
  }, [hourlyDataWow, tableData]);

  const busiestHourIndex = useMemo(() => {
    return hourlyDataWow.reduce(
      (bestIndex, item, index) => (item.total > hourlyDataWow[bestIndex].total ? index : bestIndex),
      0,
    );
  }, [hourlyDataWow]);

  const activeHourIndex = selectedHourIndex ?? busiestHourIndex;
  const selectedIntervalInsight = intervalCategoryInsights[activeHourIndex];

  const handleChartIntervalClick = (_data: unknown, index?: number) => {
    if (typeof index === "number") setSelectedHourIndex(index);
  };

  const avgStatus = getKpiStatus(totalAvg, "productivity" as KpiType);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="KPI"
        title="Productivity Detail"
        subtitle={`Target ${PROD_TARGET} chat per man-day: siapa yang di atas kuota dan siapa yang perlu dibantu.`}
        actions={<SearchField value={search} onChange={setSearch} />}
      />

      {/* HERO STRIP */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
        <StatCard
          label="Total chat"
          value={formatNum(totalChat, 0)}
          sub={`${activeAgents} agent aktif · ${formatNum(totalManDays, 0)} man-day`}
        />
        <StatCard
          label="Avg / man-day"
          value={formatNum(totalAvg, 1)}
          tone={statTone(avgStatus)}
          sub={`${totalAvg >= PROD_TARGET ? "+" : ""}${formatNum(totalAvg - PROD_TARGET, 1)} vs ${PROD_TARGET}`}
        />
        <StatCard
          label="Pencapaian kuota"
          value={`${formatNum(quotaAchievement, 0)}%`}
          sub={`kuota ${formatNum(totalQuota, 0)}`}
          footer={
            <div className="h-2 overflow-hidden rounded-full bg-black/[0.07]">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(quotaAchievement, 100))}%` }} />
            </div>
          }
        />
        <StatCard
          label="Gap vs target"
          value={`${totalGap >= 0 ? "+" : ""}${formatNum(totalGap, 0)}`}
          tone={totalGap < 0 ? "bad" : "ink"}
          sub={`${underTarget} agent di bawah kuota`}
        />
      </div>

      {/* HOURLY CHART */}
      <div className="ui-card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Distribusi jam — volume chat
          </h2>
          <span className="text-[11px] tabular-nums text-text-muted">
            puncak {hourlyDataWow[busiestHourIndex]?.hour ?? "-"}
          </span>
        </div>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {isComparisonEnabled && previousData.length > 0 ? (
              <LineChart data={hourlyDataWow} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--color-text-muted)" }} minTickGap={10} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--color-text-muted)" }} />
                <RechartsTooltip
                  cursor={{ fill: "var(--color-surface-muted)", strokeWidth: 2 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card border border-border p-2 rounded-lg shadow-lg">
                          <div className="text-xs font-bold text-text-primary mb-1">{payload[0].payload.hour}</div>
                          {payload.map((p, i) => (
                            <div key={i} className="text-xs text-text-secondary mt-1 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
                              {p.name}: <span className="font-bold" style={{ color: p.color }}>{formatNum(p.value as number, 0)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                <Line isAnimationActive={false} type="monotone" name={weekCompare ? weekCompare.labels[0] : comparisonMode === "mom" ? "Bulan Ini" : "Minggu Ini"} dataKey="total" stroke={chart.primary} strokeWidth={3} dot={{ r: 3, cursor: "pointer", onClick: handleChartIntervalClick }} activeDot={{ r: 5, cursor: "pointer", onClick: handleChartIntervalClick }} />
                <Line isAnimationActive={false} type="monotone" name={weekCompare ? weekCompare.labels[1] : comparisonMode === "mom" ? "Bulan Lalu" : "Minggu Lalu"} dataKey="prev" stroke={chart.secondary} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                {previousData2.length > 0 && <Line isAnimationActive={false} type="monotone" name={weekCompare ? weekCompare.labels[2] : comparisonMode === "mom" ? "2 Bulan Lalu" : "2 Minggu Lalu"} dataKey="prev2" stroke={chart.muted} strokeWidth={2} strokeDasharray="3 3" dot={false} />}
                {previousData3.length > 0 && <Line isAnimationActive={false} type="monotone" name={weekCompare ? weekCompare.labels[3] : comparisonMode === "mom" ? "3 Bulan Lalu" : "3 Minggu Lalu"} dataKey="prev3" stroke={chart.disabled} strokeWidth={2} strokeDasharray="2 2" dot={false} />}
              </LineChart>
            ) : (
              <BarChart data={hourlyDataWow} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--color-text-muted)" }} minTickGap={10} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--color-text-muted)" }} />
                <RechartsTooltip
                  cursor={{ fill: "var(--color-surface-muted)" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card border border-border p-2 rounded-lg shadow-lg">
                          <div className="text-xs font-bold text-text-primary">{payload[0].payload.hour}</div>
                          <div className="text-xs text-text-secondary mt-1">Traffic: <span className="font-bold text-text-primary">{formatNum(payload[0].value as number, 0)}</span> chats</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar isAnimationActive={false} dataKey="total" radius={[4, 4, 0, 0]} onClick={handleChartIntervalClick}>
                  {hourlyDataWow.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      cursor="pointer"
                      onClick={() => setSelectedHourIndex(index)}
                      fill={
                        index === activeHourIndex
                          ? "var(--color-primary)"
                          : entry.total > 0
                            ? "rgb(var(--chart-bar) / 0.42)"
                            : "var(--color-border)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        {selectedIntervalInsight && (
          <div className="rounded-xl border border-border bg-surface/60 p-4 pt-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide">
                  Interval {selectedIntervalInsight.hour}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold leading-none text-text-primary tabular-nums">
                    {formatNum(selectedIntervalInsight.total, 0)}
                  </span>
                  <span className="text-xs font-semibold text-text-muted">chats</span>
                  {selectedIntervalInsight.change !== null && (
                    <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${selectedIntervalInsight.change >= 0 ? "bg-surface-muted text-text-secondary" : "bg-danger-soft text-danger-text"}`}>
                      {selectedIntervalInsight.change >= 0 ? "+" : ""}
                      {formatNum(selectedIntervalInsight.change, 0)} vs pembanding
                    </span>
                  )}
                </div>
              </div>
              {selectedIntervalInsight.topCategories[0] && (
                <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-2 md:max-w-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-text-primary" title={selectedIntervalInsight.topCategories[0].category}>
                        {selectedIntervalInsight.topCategories[0].category}
                      </div>
                      <div className="text-[11px] text-text-secondary">
                        {formatNum(selectedIntervalInsight.topCategories[0].count, 0)} cases &middot; {formatNum(selectedIntervalInsight.topCategories[0].share, 1)}% dari interval
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {selectedIntervalInsight.topCategories.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-muted text-text-muted">
                    <tr>
                      <th className="w-12 px-3 py-2 font-medium tracking-wide">Rank</th>
                      <th className="px-3 py-2 font-medium tracking-wide">Category</th>
                      <th className="w-28 px-3 py-2 text-right font-medium tracking-wide">Cases</th>
                      <th className="w-28 px-3 py-2 text-right font-medium tracking-wide">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedIntervalInsight.topCategories.map((category, index) => (
                      <tr key={category.category} className="border-t border-border">
                        <td className="px-3 py-2 font-bold text-text-muted">#{index + 1}</td>
                        <td className="max-w-[360px] truncate px-3 py-2 font-semibold text-text-primary" title={category.category}>
                          {category.category}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-text-primary tabular-nums">
                          {formatNum(category.count, 0)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-text-secondary tabular-nums">
                          {formatNum(category.share, 1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-border bg-card px-3 py-4 text-sm font-semibold text-text-muted">
                Tidak ada category terdeteksi untuk interval ini.
              </div>
            )}
          </div>
        )}
      </div>

      {/* PER-AGENT — sparkline-first rank list */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted">Klik baris untuk rincian harian · 3 terbawah ditandai garis merah</span>
      </div>
      <div
        ref={tableScrollRef}
        className="ui-card p-0! relative w-full overflow-auto text-sm max-h-[calc(100vh-200px)]"
      >
        <table className="kpi-data-table rank-table rank-m-hide-5 w-full text-left border-collapse">
          <thead className="bg-surface text-text-secondary sticky top-0 z-30">
            <tr>
              <th className="p-2 font-bold text-center border-b border-border bg-surface w-[48px]">No</th>
              <SortableHeader label="Nama / CS ID" sortKey="name" config={sortConfig} onSort={handleSort} className="border-b border-border bg-surface min-w-[200px]" />
              <SortableHeader label="BPO · TL" sortKey="teamLeader" config={sortConfig} onSort={handleSort} className="border-b border-border bg-surface min-w-[130px]" />
              <th className="p-2 font-bold text-text-muted border-b border-border bg-surface min-w-[150px]" title={`Rata-rata chat per man-day dibanding target ${PROD_TARGET}`}>Capaian target</th>
              <SortableHeader label="Total" sortKey="total" config={sortConfig} onSort={handleSort} className="text-right text-text-primary border-b border-border bg-surface w-[90px]" />
              <SortableHeader label="Avg/MD" sortKey="average" config={sortConfig} onSort={handleSort} className="text-right text-text-primary border-b border-border bg-surface w-[110px]" />
              <SortableHeader label="Gap" sortKey="gap" config={sortConfig} onSort={handleSort} className="text-right text-text-primary border-b border-border bg-surface w-[84px]" />
              <th className="p-2 border-b border-border bg-surface w-[40px]" aria-hidden />
            </tr>
          </thead>
          <VirtualizedTbody
            colSpan={tableColSpan}
            paddingTop={tableVirtual.paddingTop}
            paddingBottom={tableVirtual.paddingBottom}
          >
            {tableVirtual.virtualIndexes.map((idx) => {
              const agent = tableData[idx];
              if (!agent) return null;
              const displayName = agent.name || agent.csId;
              const prodByDate = indexByDate(agent.dailyHistory?.productivity);
              const scheduleByDate = indexByDate(agent.dailyHistory?.schedule);
              const md = agent.manDays;
              const avg = md > 0 ? agent.productivityTotal / md : null;
              const gap = md > 0 ? agent.productivityTotal - md * PROD_TARGET : null;
              const avgStat = getKpiStatus(avg, "productivity");
              const isOpen = expandedRows.has(agent.csId);
              const isBottom = bottomThreeIds.includes(agent.csId);

              return (
                <React.Fragment key={agent.csId}>
                  <tr
                    className={`border-b border-border transition-colors group hover:bg-surface-muted cursor-pointer ${isBottom ? "border-l-2 border-l-danger" : ""}`}
                    onClick={() => toggleRow(agent.csId)}
                  >
                    <td className="p-2 text-center text-text-muted font-medium w-[48px]">{idx + 1}</td>
                    <td className="p-2 min-w-[200px]">
                      <div className="font-semibold text-text-primary truncate" title={agent.csId}>{displayName}</div>
                      <div className="text-[9px] text-text-muted truncate" title={agent.csId}>{formatCsId(agent.csId)}</div>
                    </td>
                    <td className="p-2 text-text-secondary min-w-[130px] truncate">
                      <span className="uppercase">{agent.bpo || "-"}</span>
                      <span className="text-text-muted"> · {agent.teamLeader || "-"}</span>
                    </td>
                    <td className="p-2 min-w-[150px]">
                      {avg !== null ? (
                        <div className="h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-black/[0.07]" title={`${formatNum(avg, 0)} dari target ${PROD_TARGET}`}>
                          <div
                            className={`h-full rounded-full ${avgStat === "miss" ? "bg-danger" : avgStat === "watch" ? "bg-warning" : "bg-primary"}`}
                            style={{ width: `${Math.max(0, Math.min(avg / PROD_TARGET, 1)) * 100}%` }}
                          />
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2 text-right w-[90px] text-[11px] tabular-nums text-text-secondary">
                      {formatNum(agent.productivityTotal, 0)}
                    </td>
                    <td className="p-2 text-right w-[110px]">
                      {avg !== null
                        ? <KpiValue value={avg} type="productivity" text={formatNum(avg, 0)} className="justify-end" />
                        : <span className="text-[11px] text-text-disabled">-</span>}
                    </td>
                    <td className="p-2 text-right w-[84px] text-[11px] tabular-nums">
                      {gap !== null ? (
                        <span className={`inline-flex items-center justify-end gap-1 font-medium ${gap < 0 ? "text-danger" : "text-text-muted"}`}>
                          <KpiCue status={gap < 0 ? "miss" : "on"} />
                          {gap >= 0 ? "+" : ""}{formatNum(gap, 0)}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="p-2 text-center w-[40px]">
                      <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-surface/40 border-b border-border">
                      <td colSpan={tableColSpan} className="px-4 pb-4 pt-1">
                        <ProductivityDayCalendar
                          cells={chronoDates.map((date) => {
                            const d = getByCalendarDate(prodByDate, date);
                            const sched = getByCalendarDate(scheduleByDate, date);
                            const st = (sched?.status || "").toUpperCase();
                            return {
                              date,
                              value: d && d.value !== null && d.value !== undefined ? d.value : null,
                              marker: st === "22" ? "22" : st === "PULLOUT" ? "PO" : null,
                            };
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
                    title="Tidak ada data productivity"
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

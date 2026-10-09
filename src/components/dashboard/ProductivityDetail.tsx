import React, { useMemo, useState, useRef } from "react";
import { AgentKPI } from "../../lib/dataProcessor";
import {
  formatNum,
  getKpiStatus,
  type KpiType,
  indexByDate,
  uniqueCalendarDates,
  getByCalendarDate,
} from "../../lib/utils";
import { KpiValue, KpiCue } from "../ui/KpiCue";
import { Sparkline } from "../ui/Sparkline";
import { DayStrip } from "../ui/DayStrip";
import { chart } from "../../lib/themeColors";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { Search, Activity, AlertCircle, ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from "recharts";
import { SortableHeader } from "../ui/SortableHeader";
import { EmptyState } from "../ui/EmptyState";
import { MobileScrollHint } from "../ui/ChartScrollArea";
import { VirtualizedTbody } from "../ui/VirtualizedTbody";
import { useVirtualRows } from "../../hooks/useVirtualRows";

const PROD_TARGET = 100;

/** One hero tile — value goes neutral unless it misses target (colour discipline). */
const HeroTile = ({
  label,
  value,
  sub,
  status = "none",
  progress,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: ReturnType<typeof getKpiStatus>;
  progress?: number;
}) => {
  const valueClass =
    status === "miss" ? "text-danger" : status === "watch" ? "text-warning" : "text-text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</div>
      {typeof progress === "number" ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-border-strong"
            style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
          />
        </div>
      ) : null}
      {sub ? <div className="mt-1.5 text-[11px] tabular-nums text-text-muted">{sub}</div> : null}
    </div>
  );
};

export const ProductivityDetail: React.FC<{
  data: AgentKPI[];
  previousData?: AgentKPI[];
  previousData2?: AgentKPI[];
  previousData3?: AgentKPI[];
}> = ({
  data,
  previousData = [],
  previousData2 = [],
  previousData3 = [],
}) => {
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

  const localAverage = (agent: AgentKPI) =>
    agent.manDays > 0 ? agent.productivityTotal / agent.manDays : 0;
  const localGap = (agent: AgentKPI) => agent.productivityTotal - agent.manDays * PROD_TARGET;

  const tableData = useMemo(() => {
    const sorted = [...filteredData];
    if (sortConfig) {
      sorted.sort((a, b) => {
        let aVal: string | number = 0;
        let bVal: string | number = 0;
        switch (sortConfig.key) {
          case "name": aVal = a.name || a.csId; bVal = b.name || b.csId; break;
          case "bpo": aVal = a.bpo || ""; bVal = b.bpo || ""; break;
          case "teamLeader": aVal = a.teamLeader || ""; bVal = b.teamLeader || ""; break;
          case "total": aVal = a.productivityTotal; bVal = b.productivityTotal; break;
          case "average": aVal = localAverage(a); bVal = localAverage(b); break;
          case "gap": aVal = localGap(a); bVal = localGap(b); break;
        }
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      // Default: a ranking by output per man-day.
      sorted.sort((a, b) => localAverage(b) - localAverage(a));
    }
    return sorted;
  }, [filteredData, sortConfig]);

  const bottomThreeIds = useMemo(() => {
    return [...filteredData]
      .filter((a) => a.manDays > 0)
      .sort((a, b) => localAverage(a) - localAverage(b))
      .slice(0, 3)
      .map((a) => a.csId);
  }, [filteredData]);

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
  } = useMemo(() => {
    const forWidgets = data.filter((a) => a.productivityBase > 0);
    let sumChat = 0;
    let sumManDays = 0;
    let sumQuota = 0;
    let sumGap = 0;
    let under = 0;

    forWidgets.forEach((agent) => {
      sumChat += agent.productivityTotal;
      sumManDays += agent.manDays;
      const quota = agent.manDays * PROD_TARGET;
      sumQuota += quota;
      sumGap += agent.productivityTotal - quota;
      const avg = agent.manDays > 0 ? agent.productivityTotal / agent.manDays : 0;
      if (avg > 0 && avg < PROD_TARGET) under++;
    });

    return {
      totalChat: sumChat,
      totalAvg: sumManDays > 0 ? sumChat / sumManDays : 0,
      totalManDays: sumManDays,
      activeAgents: forWidgets.length,
      underTarget: under,
      totalQuota: sumQuota,
      quotaAchievement: sumQuota > 0 ? (sumChat / sumQuota) * 100 : 0,
      totalGap: sumGap,
    };
  }, [data]);

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
        total: getSum(tableData),
        prev: previousData.length ? getSum(prevFiltered) : null,
        prev2: previousData2.length ? getSum(prev2Filtered) : null,
        prev3: previousData3.length ? getSum(prev3Filtered) : null,
      };
    });
  }, [tableData, previousData, previousData2, previousData3, search, filterTL]);

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
    <div className="flex flex-col gap-6 p-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Productivity Detail</h1>
          <p className="mt-0.5 text-[11px] text-text-muted">target {PROD_TARGET} chat / man-day</p>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Cari CS ID atau nama..."
            aria-label="Cari CS ID atau nama..."
            className="pl-8 pr-3 py-1.5 border border-border bg-card text-text-primary rounded-xl text-xs focus:border-primary focus:outline-none w-full md:w-56"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* HERO STRIP */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroTile
          label="Total chat"
          value={formatNum(totalChat, 0)}
          sub={`${activeAgents} agent aktif · ${formatNum(totalManDays, 0)} man-day`}
        />
        <HeroTile
          label="Avg / man-day"
          value={formatNum(totalAvg, 1)}
          status={avgStatus}
          sub={`${totalAvg >= PROD_TARGET ? "+" : ""}${formatNum(totalAvg - PROD_TARGET, 1)} vs ${PROD_TARGET}`}
        />
        <HeroTile
          label="Pencapaian kuota"
          value={`${formatNum(quotaAchievement, 0)}%`}
          progress={quotaAchievement}
          sub={`kuota ${formatNum(totalQuota, 0)}`}
        />
        <HeroTile
          label="Gap vs target"
          value={`${totalGap >= 0 ? "+" : ""}${formatNum(totalGap, 0)}`}
          status={totalGap < 0 ? "miss" : "none"}
          sub={`${underTarget} agent di bawah kuota`}
        />
      </div>

      {/* HOURLY CHART */}
      <div className="bg-card border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl p-4 flex flex-col gap-4">
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
                <Line type="monotone" name={comparisonMode === "mom" ? "Bulan Ini" : "Minggu Ini"} dataKey="total" stroke={chart.primary} strokeWidth={3} dot={{ r: 3, cursor: "pointer", onClick: handleChartIntervalClick }} activeDot={{ r: 5, cursor: "pointer", onClick: handleChartIntervalClick }} />
                <Line type="monotone" name={comparisonMode === "mom" ? "Bulan Lalu" : "Minggu Lalu"} dataKey="prev" stroke={chart.secondary} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                {previousData2.length > 0 && <Line type="monotone" name={comparisonMode === "mom" ? "2 Bulan Lalu" : "2 Minggu Lalu"} dataKey="prev2" stroke={chart.muted} strokeWidth={2} strokeDasharray="3 3" dot={false} />}
                {previousData3.length > 0 && <Line type="monotone" name={comparisonMode === "mom" ? "3 Bulan Lalu" : "3 Minggu Lalu"} dataKey="prev3" stroke={chart.disabled} strokeWidth={2} strokeDasharray="2 2" dot={false} />}
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
                <Bar dataKey="total" radius={[4, 4, 0, 0]} onClick={handleChartIntervalClick}>
                  {hourlyDataWow.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      cursor="pointer"
                      onClick={() => setSelectedHourIndex(index)}
                      fill={
                        index === activeHourIndex
                          ? "var(--color-text-primary)"
                          : entry.total > 0
                            ? "var(--color-border-strong)"
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
                    <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${selectedIntervalInsight.change > 0 ? "bg-surface-muted text-text-secondary" : "bg-danger-soft text-danger-text"}`}>
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
        <span className="text-[11px] text-text-muted">Klik baris untuk chat harian · 3 terbawah ditandai garis merah</span>
      </div>
      <MobileScrollHint label="Geser → untuk lihat semua kolom" />
      <div
        ref={tableScrollRef}
        className="relative w-full overflow-auto bg-card border text-sm border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl max-h-[calc(100vh-200px)]"
      >
        <table className="kpi-data-table w-full text-left border-collapse">
          <thead className="bg-surface text-text-secondary sticky top-0 z-30">
            <tr>
              <th className="p-2 font-bold text-center border-b border-border bg-surface w-[48px]">No</th>
              <SortableHeader label="Nama / CS ID" sortKey="name" config={sortConfig} onSort={handleSort} className="border-b border-border bg-surface min-w-[200px]" />
              <SortableHeader label="BPO · TL" sortKey="teamLeader" config={sortConfig} onSort={handleSort} className="border-b border-border bg-surface min-w-[130px]" />
              <th className="p-2 font-bold text-text-muted border-b border-border bg-surface min-w-[150px]">Tren harian</th>
              <SortableHeader label="Total" sortKey="total" config={sortConfig} onSort={handleSort} className="text-right text-text-primary border-b border-border bg-surface w-[90px]" />
              <SortableHeader label={`Avg/MD · t ${PROD_TARGET}`} sortKey="average" config={sortConfig} onSort={handleSort} className="text-right text-text-primary border-b border-border bg-surface w-[110px]" />
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
              const dailyByDate = uniqueDates.map((date) => {
                const d = getByCalendarDate(prodByDate, date);
                return d && d.value !== null && d.value !== undefined ? d.value : null;
              });
              const sparkVals = [...dailyByDate].reverse();
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
                      <div className="text-[9px] text-text-muted truncate">{agent.csId}</div>
                    </td>
                    <td className="p-2 text-text-secondary min-w-[130px] truncate">
                      <span className="uppercase">{agent.bpo || "-"}</span>
                      <span className="text-text-muted"> · {agent.teamLeader || "-"}</span>
                    </td>
                    <td className="p-2 min-w-[150px]">
                      <div className={avgStat === "miss" ? "text-danger" : avgStat === "watch" ? "text-warning" : "text-text-muted"}>
                        <Sparkline values={sparkVals} height={22} />
                      </div>
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
                        <div className="text-[9px] text-text-muted uppercase tracking-wide pt-3 pb-2">
                          Chat per hari &mdash; hanya di bawah {PROD_TARGET} yang berwarna &middot; sel kosong = tidak ada data &middot; ²² shift 22:00, ᴾᴼ pullout
                        </div>
                        <DayStrip
                          kpiType="productivity"
                          items={chronoDates.map((date) => {
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

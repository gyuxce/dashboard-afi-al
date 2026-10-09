import React from "react";
import { formatNum, getKpiStatus, parseDateForSort, type KpiType } from "../../lib/utils";
import { chart } from "../../lib/themeColors";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LabelList
} from "recharts";

interface DashboardChartsProps {
  stats: any;
  dailyTrend: any[];
}

const STATUS_TEXT: Record<string, string> = {
  none: "text-text-disabled",
  on: "text-text-primary",
  watch: "text-warning",
  miss: "text-danger",
};

/** One KPI as a bullet row: label · fill vs a target tick · value + Δ.
 *  Colour only when the value misses target (discipline). */
const KpiBulletRow: React.FC<{
  label: string;
  value: number;
  type: KpiType;
  valueText: string;
  target: number;
  targetText: string;
}> = ({ label, value, type, valueText, target, targetText }) => {
  const hasVal = value > 0;
  const status = hasVal ? getKpiStatus(value, type) : "none";
  const toPct = (v: number) => (type === "csatOfficial" ? (v / 5) * 100 : v);
  const fillPct = Math.max(0, Math.min(toPct(value), 100));
  const targetPct = Math.max(0, Math.min(toPct(target), 100));
  const delta = value - target;
  const fillClass =
    status === "miss" ? "bg-danger" : status === "watch" ? "bg-warning" : "bg-text-muted";

  return (
    <div className="grid grid-cols-[minmax(0,124px)_1fr_104px] items-center gap-3">
      <span className="truncate text-[11px] font-medium text-text-secondary" title={label}>{label}</span>
      <div className="relative h-2 rounded-full bg-surface-muted">
        <div className={`absolute inset-y-0 left-0 rounded-full ${fillClass}`} style={{ width: `${fillPct}%` }} />
        <div className="absolute inset-y-[-3px] w-px bg-text-primary" style={{ left: `${targetPct}%` }} title={`target ${targetText}`} />
      </div>
      <span className="flex items-baseline justify-end gap-1.5 tabular-nums">
        <span className={`text-[13px] font-bold ${STATUS_TEXT[status]}`}>{valueText}</span>
        {hasVal && (
          <span className={`text-[10px] ${delta < 0 ? "text-danger" : "text-text-muted"}`}>
            {delta >= 0 ? "+" : "−"}{formatNum(Math.abs(delta), type === "csatOfficial" ? 2 : 1)}
          </span>
        )}
      </span>
    </div>
  );
};

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ stats, dailyTrend }) => {
  const [trendMode, setTrendMode] = React.useState<'weekly' | 'daily'>('daily');

  const weeklyTrend = React.useMemo(() => {
    const weeks = new Map<string, {
      label: string,
      startDate: string,
      productivity: number,
      prevProductivity: number,
      hasPrevious: boolean,
      dayKeys: Set<string>,
    }>();

    const getWeekBucket = (date: string) => {
      const parsedTimestamp = parseDateForSort(date);
      if (!parsedTimestamp) return { key: date, label: date, startDate: date };

      const start = new Date(parsedTimestamp);
      const day = start.getDay();
      start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const toDateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
      const formatDate = (value: Date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(value);
      const label = start.getMonth() === end.getMonth()
        ? `${start.getDate()}-${end.getDate()} ${new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(start)}`
        : `${formatDate(start)}-${formatDate(end)}`;

      return { key: toDateKey(start), label, startDate: toDateKey(start) };
    };

    dailyTrend.forEach(item => {
      const bucket = getWeekBucket(item.date);
      if (!weeks.has(bucket.key)) {
        weeks.set(bucket.key, {
          label: bucket.label,
          startDate: bucket.startDate,
          productivity: 0,
          prevProductivity: 0,
          hasPrevious: false,
          dayKeys: new Set(),
        });
      }

      const week = weeks.get(bucket.key)!;
      // Only count days with real productivity so zero placeholder days
      // do not suppress partial-week projection.
      if ((item.productivity || 0) > 0) {
        week.dayKeys.add(item.date);
      }
      week.productivity += item.productivity || 0;
      if (item.prevProductivity !== null && item.prevProductivity !== undefined) {
        week.prevProductivity += item.prevProductivity;
        week.hasPrevious = true;
      }
    });

    // Minggu lintas bulan / period filter sering hanya punya 1–2 hari → total terkesan anjlok.
    // Proyeksikan ke setara 7 hari agar perbandingan antar minggu adil.
    return Array.from(weeks.values())
      .map(week => {
        const dayCount = week.dayKeys.size;
        const isPartial = dayCount > 0 && dayCount < 7;
        const scale = isPartial ? 7 / dayCount : 1;
        return {
          date: week.startDate,
          dateLabel: isPartial ? `${week.label}*` : week.label,
          productivity: week.productivity * scale,
          prevProductivity: week.hasPrevious ? week.prevProductivity * scale : null,
          dayCount,
          isPartial,
        };
      })
      .filter(week => week.dayCount >= 2)
      .sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date));
  }, [dailyTrend]);

  const trendData = trendMode === 'weekly' ? weeklyTrend : dailyTrend;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6 min-w-0">
      {/* KPI vs Target — bullet rows */}
      <div className="bg-card border border-border rounded-lg p-5 min-w-0">
        <div className="flex items-center justify-between gap-4 mb-5">
          <h2 className="text-sm font-bold text-text-primary">KPI vs Target</h2>
          <span className="inline-flex items-center gap-3 text-[9px] text-text-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-text-muted" />aktual</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-px bg-text-primary" />target</span>
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {([
            { label: "CSAT Official", value: stats.csat || 0, type: "csatOfficial" as KpiType, valueText: formatNum(stats.csat || 0, 2), target: 3.75, targetText: "3.75" },
            { label: "CSAT SC Full", value: stats.csatScFull || 0, type: "csatFull" as KpiType, valueText: `${formatNum(stats.csatScFull || 0, 1)}%`, target: 75, targetText: "75%" },
            { label: "CSAT SC After Takeout", value: stats.csatScFair || 0, type: "csatFair" as KpiType, valueText: `${formatNum(stats.csatScFair || 0, 1)}%`, target: 92, targetText: "92%" },
            { label: "QA Score", value: stats.qa || 0, type: "qa" as KpiType, valueText: `${formatNum(stats.qa || 0, 1)}%`, target: 92, targetText: "92%" },
            { label: "Avg Attendance", value: stats.attendance || 0, type: "attendance" as KpiType, valueText: `${formatNum(stats.attendance || 0, 1)}%`, target: 95, targetText: "95%" },
            { label: "WHU", value: stats.whu || 0, type: "whu" as KpiType, valueText: `${formatNum(stats.whu || 0, 1)}%`, target: 96, targetText: "96%" },
            { label: "SLA 1 Menit", value: stats.sla1m || 0, type: "sla1m" as KpiType, valueText: `${formatNum(stats.sla1m || 0, 1)}%`, target: 92, targetText: "92%" },
            { label: "SLA 3 Menit", value: stats.sla3m || 0, type: "sla3m" as KpiType, valueText: `${formatNum(stats.sla3m || 0, 1)}%`, target: 96, targetText: "96%" },
          ]).map((r) => (
            <KpiBulletRow key={r.label} {...r} />
          ))}
        </div>
      </div>

      {/* Weekly/Daily Trend Chart */}
      <div className="bg-card border border-border rounded-lg p-5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-sm font-bold text-text-primary">
            {trendMode === 'weekly' ? 'Weekly' : 'Daily'} Performance Trend <span className="text-text-muted font-medium text-xs ml-1">(Total Productivity)</span>
          </h2>
          <div className="inline-flex items-center self-start rounded-lg border border-border bg-surface-muted p-0.5 sm:self-auto">
            {(['weekly', 'daily'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setTrendMode(mode)}
                className={[
                  'rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors',
                  trendMode === mode ? 'bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary',
                ].join(' ')}
              >
                {mode === 'weekly' ? 'Weekly' : 'Daily'}
              </button>
            ))}
          </div>
        </div>
        {trendMode === 'weekly' && weeklyTrend.some(w => w.isPartial) && (
          <p className="mb-3 text-[10px] text-text-muted">
            * Minggu tidak penuh (lintas bulan / data period belum lengkap) diproyeksikan ke setara 7 hari agar perbandingan adil.
          </p>
        )}

        <div className="w-full h-[280px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trendData}
              margin={{ top: 40, right: 30, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="colorProd"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={chart.primary}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="95%"
                    stopColor={chart.primary}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--color-border)"
              />
              <XAxis
                dataKey="dateLabel"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--color-text-muted)", fontWeight: 500 }}
                dy={10}
                minTickGap={30}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                domain={[0, "auto"]}
                tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}K` : val}
              />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  backgroundColor: "var(--color-card)",
                  color: "var(--color-text-primary)",
                  padding: "8px 12px"
                }}
                labelStyle={{ fontSize: "10px", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "4px" }}
                itemStyle={{ fontWeight: "700", fontSize: "11px", padding: 0 }}
                formatter={(value: any, name: string) => [formatNum(value, 0), name === 'productivity' ? 'Current Period' : 'Previous Period']}
              />
              
              <Area
                type="monotone"
                dataKey="prevProductivity"
                stroke={chart.muted}
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="transparent"
                animationDuration={500}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: chart.muted }}
              />

              <Area
                type="monotone"
                dataKey="productivity"
                stroke={chart.primary}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorProd)"
                animationDuration={500}
                dot={(props: any) => {
                   const { cx, cy, index } = props;
                   const isLast = index === trendData.length - 1;
                   return (
                      <circle 
                         key={`dot-${index}`}
                         cx={cx} 
                         cy={cy} 
                         r={isLast ? 5 : 4} 
                         fill={isLast ? chart.primary : chart.card} 
                         stroke={chart.primary} 
                         strokeWidth={2}
                      />
                   );
                }}
                activeDot={{ r: 6, strokeWidth: 0, fill: chart.primary }}
              >
                {trendData.length <= 14 && (
                  <LabelList 
                    dataKey="productivity" 
                    position="top" 
                    offset={10}
                    fill="var(--color-text-primary)" 
                    fontSize={11} 
                    fontWeight={700} 
                    formatter={(val: number) => formatNum(val, 0)} 
                  />
                )}
              </Area>

            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

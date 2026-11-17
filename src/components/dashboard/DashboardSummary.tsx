import React, { useMemo, useState } from "react";
import { AgentKPI } from "../../lib/dataProcessor";
import { formatNum, getKpiStatus, KPI_TARGETS, type KpiType } from "../../lib/utils";
import { TrendingUp, Info, Download, ClipboardCopy } from "lucide-react";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { Pill } from "../ui/Pill";
import { SearchField } from "../ui/SearchField";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { DashboardCharts } from "./DashboardCharts";
import { TeamLeaderSummary } from "./TeamLeaderSummary";
import { EmptyState } from "../ui/EmptyState";
import type { CalendarWeek } from "../../lib/weeks";
import { downloadBlob, renderTableSlide } from "../../lib/slideExport";
import { buildDailyTrend, withPreviousProductivity } from "../../lib/dailyTrend";
import { buildReportPanel, periodHasActivity } from "../../lib/reportPanel";
import type { Period } from "../../lib/comparisonPlan";
import {
  REPORT_METRICS,
  buildReportSlideModel,
  calculatePeriodStats,
  formatMetricValue,
  columnTrend,
  toLocalIso,
  type PeriodStats,
  type ReportColumn,
  type ReportMetric,
} from "../../lib/weeklyReport";

interface Props {
  data: AgentKPI[];
  previousData?: AgentKPI[];
  previousData2?: AgentKPI[];
  previousData3?: AgentKPI[];
  /** Monday–Sunday weeks of the selected range (WoW over a longer range) and their KPI rows, same order. */
  weekRanges?: CalendarWeek[];
  weekData?: AgentKPI[][];
  /** The previous periods the app computed (lib/comparisonPlan); the report shows exactly these. */
  previousPeriods?: { prev1: Period | null; prev2: Period | null; prev3: Period | null };
}

const NO_PERIODS = { prev1: null, prev2: null, prev3: null } as const;

export const DashboardSummary: React.FC<Props> = ({ data, previousData = [], previousData2 = [], previousData3 = [], weekRanges = [], weekData = [], previousPeriods = NO_PERIODS }) => {
  const [search, setSearch] = useState("");
  const { startDate, endDate, comparisonMode } = useStore(useShallow((s) => ({
    startDate: s.startDate,
    endDate: s.endDate,
    comparisonMode: s.comparisonMode,
  })));

  const tableData = useMemo(() => {
    return data.filter(
      (a) =>
        a.csId.toLowerCase().includes(search.toLowerCase()) ||
        (a.name || "").toLowerCase().includes(search.toLowerCase()),
    );
  }, [data, search]);

  const stats = useMemo(() => {
    return {
      current: calculatePeriodStats(data),
      previous: calculatePeriodStats(previousData),
      previous2: calculatePeriodStats(previousData2),
      previous3: calculatePeriodStats(previousData3),
    };
  }, [data, previousData, previousData2, previousData3]);

  const isComparisonEnabled = useStore(state => state.isComparisonEnabled);
  const currentStats = stats.current;
  const previousStats = stats.previous;
  const previousStats2 = stats.previous2;
  const previousStats3 = stats.previous3;

  const getDelta = (curr: number, prev: number) => {
    // Passive mode (Bandingkan off): previousData is last month's same day range.
    if (!previousData.length || !periodHasActivity(previousData)) return undefined;
    if (!Number.isFinite(curr) || !Number.isFinite(prev)) return undefined;
    return curr - prev;
  };

  const reportPanel = useMemo(
    () =>
      buildReportPanel({
        comparisonMode, startDate, endDate, weekRanges, weekData,
        periods: previousPeriods,
        data: { previous: previousData, previous2: previousData2, previous3: previousData3 },
        stats: { current: currentStats, previous: previousStats, previous2: previousStats2, previous3: previousStats3 },
        todayIso: toLocalIso(new Date()),
      }),
    [
      comparisonMode, weekRanges, weekData, previousPeriods, previousData, previousData2, previousData3,
      startDate, endDate, currentStats, previousStats, previousStats2, previousStats3,
    ],
  );

  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()),
    [],
  );

  const dailyTrend = useMemo(
    () => withPreviousProductivity(buildDailyTrend(data), isComparisonEnabled ? buildDailyTrend(previousData) : []),
    [data, previousData, isComparisonEnabled],
  );


  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={todayLabel}
        title="Dashboard Summary"
        subtitle="Pulse KPI live chat: apa yang sudah tercapai, apa yang meleset, dan apa yang perlu perhatian."
        actions={<SearchField value={search} onChange={setSearch} />}
      />

      {!data.length && (
        <EmptyState
          title="Belum ada data KPI untuk ditampilkan"
          description="Pilih bulan data di File Center, lalu sync. Dashboard akan menampilkan KPI sesuai periode aktif."
          variant="data"
          showDataActions
        />
      )}

      {data.length > 0 && (
        <>


          {(() => {
            const cmp = isComparisonEnabled && previousData.length > 0;
            const prev = (s: string | undefined) => (cmp ? s : undefined);
            return (
              <>
                {/* Hero KPI strip — the five people lead with */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-5">
                  <StatCard
                    title="Total Productivity"
                    value={formatNum(currentStats.productivity, 0)}
                    delta={getDelta(currentStats.productivity, previousStats.productivity)}
                    previousValue={prev(formatNum(previousStats.productivity, 0))}
                  />
                  <StatCard
                    title="Avg Productivity"
                    value={formatNum(currentStats.avgProductivity, 0)}
                    rawValue={currentStats.avgProductivity}
                    targetType="productivity"
                    targetLabel="100"
                    delta={getDelta(currentStats.avgProductivity, previousStats.avgProductivity)}
                    previousValue={prev(formatNum(previousStats.avgProductivity, 0))}
                  />
                  <StatCard
                    title="CSAT Official"
                    value={formatNum(currentStats.csat)}
                    unit="/ 5"
                    rawValue={currentStats.csat}
                    targetType="csatOfficial"
                    targetLabel="3,75"
                    delta={getDelta(currentStats.csat, previousStats.csat)}
                    deltaDec={2}
                    previousValue={prev(formatNum(previousStats.csat) + " / 5")}
                  />
                  <StatCard
                    title="QA Score"
                    value={formatNum(currentStats.qa) + "%"}
                    rawValue={currentStats.qa}
                    targetType="qa"
                    targetLabel="92%"
                    delta={getDelta(currentStats.qa, previousStats.qa)}
                    previousValue={prev(formatNum(previousStats.qa) + "%")}
                  />
                  <StatCard
                    title="Attendance"
                    value={formatNum(currentStats.attendance) + "%"}
                    rawValue={currentStats.attendance}
                    targetType="attendance"
                    targetLabel="95%"
                    delta={getDelta(currentStats.attendance, previousStats.attendance)}
                    previousValue={prev(formatNum(previousStats.attendance) + "%")}
                  />
                </div>

                {/* Secondary KPI tiles */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-5">
                  <StatCard
                    title="CSAT SC Full"
                    value={formatNum(currentStats.csatScFull) + "%"}
                    rawValue={currentStats.csatScFull}
                    targetType="csatFull"
                    targetLabel="75%"
                    subValue={currentStats.csatScFull > 0 ? formatNum((currentStats.csatScFull / 100) * 5, 2) + " poin" : undefined}
                    delta={getDelta(currentStats.csatScFull, previousStats.csatScFull)}
                    previousValue={prev(formatNum(previousStats.csatScFull) + "%")}
                  />
                  <StatCard
                    title="CSAT SC After Takeout"
                    value={formatNum(currentStats.csatScFair) + "%"}
                    rawValue={currentStats.csatScFair}
                    targetType="csatFair"
                    targetLabel="92%"
                    subValue={currentStats.csatScFair > 0 ? formatNum((currentStats.csatScFair / 100) * 5, 2) + " poin" : undefined}
                    delta={getDelta(currentStats.csatScFair, previousStats.csatScFair)}
                    previousValue={prev(formatNum(previousStats.csatScFair) + "%")}
                  />
                  <StatCard
                    title="SLA 1 Menit"
                    value={formatNum(currentStats.sla1m) + "%"}
                    rawValue={currentStats.sla1m}
                    targetType="sla1m"
                    targetLabel="92%"
                    delta={getDelta(currentStats.sla1m, previousStats.sla1m)}
                    previousValue={prev(formatNum(previousStats.sla1m) + "%")}
                  />
                  <StatCard
                    title="SLA 3 Menit"
                    value={formatNum(currentStats.sla3m) + "%"}
                    rawValue={currentStats.sla3m}
                    targetType="sla3m"
                    targetLabel="96%"
                    delta={getDelta(currentStats.sla3m, previousStats.sla3m)}
                    previousValue={prev(formatNum(previousStats.sla3m) + "%")}
                  />
                  <StatCard
                    title="WHU (%)"
                    value={formatNum(currentStats.whu) + "%"}
                    rawValue={currentStats.whu}
                    targetType="whu"
                    targetLabel="96%"
                    delta={getDelta(currentStats.whu, previousStats.whu)}
                    previousValue={prev(formatNum(previousStats.whu) + "%")}
                  />
                </div>
              </>
            );
          })()}

          {/* Weekly Report Panel - only shown when comparison is active + has data */}
          {isComparisonEnabled && reportPanel && (
            <WeeklyReportPanel
              title={reportPanel.title}
              columns={reportPanel.columns}
              deltaTo={reportPanel.deltaTo}
              deltaFrom={reportPanel.deltaFrom}
              note={reportPanel.note}
            />
          )}

          <DashboardCharts stats={currentStats} dailyTrend={dailyTrend} />
          <TeamLeaderSummary data={tableData} />
        </>
      )}
    </div>
  );
};

type KpiFormula = {
  target?: string;
  formula: string;
  source: string;
  note?: string;
};

const KPI_FORMULAS: Record<string, KpiFormula> = {
  "Total Productivity": {
    formula: "Jumlah seluruh chat atau tiket pada periode yang dipilih.",
    source: "Data produktivitas",
  },
  "Avg Productivity": {
    target: "100",
    formula: "Total produktivitas dibagi jumlah hari kerja.",
    source: "Data produktivitas dan jadwal",
  },
  "CSAT Official": {
    target: "3,75 / 5",
    formula: "Jumlah poin rating dibagi jumlah responden.",
    source: "Data CSAT Official",
    note: "Rating 1 sampai 5 dihitung sesuai jumlah responden.",
  },
  "CSAT SC Full": {
    target: "75%",
    formula: "Jumlah rating 4 dan 5 dibagi seluruh rating yang valid.",
    source: "Data survei CSAT",
    note: "Seluruh rating valid, termasuk rating 3, tetap dihitung.",
  },
  "CSAT SC After Takeout": {
    target: "92%",
    formula: "Jumlah rating 4 dan 5 dibagi rating valid setelah kasus takeout dikeluarkan.",
    source: "Data survei CSAT",
    note: "Kasus yang masuk kategori takeout tidak ikut dihitung.",
  },
  "SLA 1 Menit": {
    target: "92%",
    formula: "Rata-rata persentase respons yang memenuhi batas 1 menit.",
    source: "Data SLA",
  },
  "SLA 3 Menit": {
    target: "96%",
    formula: "Rata-rata persentase respons yang memenuhi batas 3 menit.",
    source: "Data SLA",
  },
  "WHU (%)": {
    target: "96%",
    formula: "Rata-rata persentase WHU dari data yang tersedia.",
    source: "Data produktivitas",
  },
  "QA Score": {
    target: "92%",
    formula: "Rata-rata nilai pemeriksaan QA yang memiliki nilai.",
    source: "Data QA",
  },
  "Attendance": {
    target: "95%",
    formula: "Hari hadir dibagi hari kerja, lalu dikali 100.",
    source: "Data jadwal",
    note: "Hari PULLOUT tetap dihitung sebagai hari kerja dan hadir.",
  },
  "Training Completion": {
    target: "100%",
    formula: "Nilai mengikuti status penyelesaian training.",
    source: "Data training",
    note: "Data training belum tersedia, sehingga sementara dinilai 100%.",
  },
  "Quiz": {
    target: "92%",
    formula: "Nilai mengikuti hasil quiz dibandingkan target.",
    source: "Data quiz",
    note: "Data quiz belum tersedia, sehingga sementara dinilai 100%.",
  },
  "Final Score": {
    target: "100",
    formula: "Gabungan QA 50%, produktivitas 20%, CSAT 20%, training 5%, dan quiz 5%.",
    source: "Seluruh KPI",
  },
};

const FormulaTooltip = ({ title }: { title: string }) => {
  const formula = KPI_FORMULAS[title];
  if (!formula) return null;

  return (
    <span className="group/formula relative inline-flex shrink-0 items-center">
      <button
        type="button"
        aria-label={`Penjelasan ${title}`}
        title={`${title}: ${formula.formula}`}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-muted hover:bg-surface-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <Info size={12} />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-72 -translate-x-1/2 rounded-lg border border-border bg-card p-3 text-left shadow-xl group-hover/formula:block group-focus-within/formula:block">
        <span className="block text-[11px] font-medium tracking-wide text-text-primary">
          {title}
        </span>
        {formula.target && (
          <span className="mt-1 block text-[11px] text-text-muted">
            Target: <span className="font-semibold text-text-secondary">{formula.target}</span>
          </span>
        )}
        <span className="mt-2 block text-[11px] leading-relaxed text-text-secondary">
          {formula.formula}
        </span>
        <span className="mt-2 block text-[10px] text-text-muted">
          Sumber data: {formula.source}
        </span>
        {formula.note && (
          <span className="mt-1 block text-[10px] leading-relaxed text-text-muted">
            Note: {formula.note}
          </span>
        )}
      </span>
    </span>
  );
};

const STATUS_TEXT_CLASS: Record<string, string> = {
  on: 'text-text-primary',
  none: 'text-text-primary',
  watch: 'text-warning-text',
  miss: 'text-danger-text',
};

const StatCard = ({
  title,
  value,
  unit,
  rawValue,
  targetType,
  targetLabel,
  subValue,
  delta,
  deltaDec,
  previousValue,
}: {
  title: string;
  value: string;
  unit?: string;
  rawValue?: number | null;
  targetType?: KpiType;
  targetLabel?: string;
  subValue?: string;
  delta?: number;
  /** Fixed decimals for the delta chip (e.g. 2 for CSAT stars); default: 0 for ≥100, else 1. */
  deltaDec?: number;
  previousValue?: string;
}) => {
  const status = targetType ? getKpiStatus(rawValue, targetType) : 'none';
  const numberColor = STATUS_TEXT_CLASS[status] ?? 'text-text-primary';
  const targetValue = targetType ? KPI_TARGETS[targetType] : null;
  const progress = targetValue && rawValue !== null && rawValue !== undefined && Number.isFinite(rawValue) ? Math.max(0, Math.min(100, (rawValue / targetValue) * 100)) : null;
  const barColor = status === 'miss' ? 'bg-danger' : status === 'watch' ? 'bg-warning' : 'bg-primary';
  const isCompareMode = previousValue !== undefined;
  const showDelta = delta !== undefined && Math.abs(delta) >= 0.5 * 10 ** -(deltaDec ?? 1);

  return (
    <Card as="article" size="sm" className="flex w-full flex-col gap-3">
      <div className="flex w-full items-center gap-2">
        <p title={title} className="ui-card-label min-w-0 flex-1 truncate">{title}</p>
        <FormulaTooltip title={title} />
      </div>

      <div className={`ui-stat-value ui-stat-md flex items-baseline tabular-nums ${numberColor}`}>
        {value}
        {unit && <span className="ui-stat-unit">{unit}</span>}
      </div>

      <div className="flex min-h-[26px] flex-wrap items-center gap-x-2 gap-y-1.5">
        {showDelta && (
          <Pill
            tone="neutral"
            className="tabular-nums"
            title={isCompareMode ? undefined : 'Dibanding bulan lalu pada jumlah hari yang sama (bulan berjalan dipotong sampai tanggal data terakhir)'}
          >
            <b className={delta! > 0 ? 'text-success-text' : 'text-danger-text'}>{delta! > 0 ? '▲' : '▼'}</b>
            {delta! > 0 ? '+' : '−'}{formatNum(Math.abs(delta!), deltaDec ?? (Math.abs(delta!) >= 100 ? 0 : 1))}
            {!isCompareMode && <span className="font-normal opacity-70">vs bln lalu</span>}
          </Pill>
        )}
        {targetLabel && !isCompareMode && <span className="text-[12.5px] tabular-nums text-text-muted">target {targetLabel}</span>}
        {(status === 'miss' || status === 'watch') && !isCompareMode && (
          <Pill tone={status === 'miss' ? 'bad' : 'warn'}>{status === 'miss' ? '▼ Di bawah' : '▽ Hampir'}</Pill>
        )}
        {subValue && !isCompareMode && <span className="text-[12px] font-medium text-text-muted">{subValue}</span>}
      </div>

      {progress !== null && (
        <div className="mt-auto" aria-label={`Capaian terhadap target: ${formatNum(progress, 0)}%`}>
          <div className="h-2 overflow-hidden rounded-full bg-black/[0.07]">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1.5 text-right text-[11.5px] tabular-nums text-text-muted">{progress >= 100 ? 'Target tercapai' : `${formatNum(progress, 0)}% dari target`}</div>
        </div>
      )}

      {isCompareMode && (
        <div className="flex items-center gap-2 border-t border-border/60 pt-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Prev</span>
          <span className="text-[14px] font-semibold tabular-nums text-text-secondary">{previousValue}</span>
        </div>
      )}
    </Card>
  );
};

// --- Weekly Report Panel ---
const WeeklyReportPanel = ({
  title,
  columns,
  deltaTo,
  deltaFrom,
  note,
}: {
  title: string;
  columns: ReportColumn[];
  /** Column indexes whose values the "Perubahan" column compares (to − from). */
  deltaTo: number;
  deltaFrom: number;
  note?: string;
}) => {


  const deltaTitle = `${columns[deltaTo]?.label ?? ''} vs ${columns[deltaFrom]?.label ?? ''}`;

  const [exportState, setExportState] = useState<{ busy: boolean; message: string }>({ busy: false, message: '' });
  const flashMessage = (message: string) => {
    setExportState({ busy: false, message });
    setTimeout(() => setExportState((s) => (s.message === message ? { busy: false, message: '' } : s)), 2500);
  };

  const buildSlideModel = () => buildReportSlideModel({ title, columns, deltaTo, deltaFrom, note });

  const slideFileName = () => {
    const starts = columns.map((c) => c.start).filter(Boolean).sort();
    const ends = columns.map((c) => c.end).filter(Boolean).sort();
    return `${title.toLowerCase().replace(/\s+/g, '-')}_${starts[0] ?? ''}_${ends[ends.length - 1] ?? ''}.png`;
  };

  const handleDownloadSlide = async () => {
    setExportState({ busy: true, message: '' });
    try {
      downloadBlob(slideFileName(), await renderTableSlide(buildSlideModel()));
      flashMessage('Gambar diunduh');
    } catch {
      flashMessage('Gagal membuat gambar');
    }
  };

  const handleCopySlide = async () => {
    setExportState({ busy: true, message: '' });
    try {
      const blob = await renderTableSlide(buildSlideModel());
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flashMessage('Gambar tersalin');
    } catch {
      flashMessage('Browser menolak menyalin, pakai Unduh');
    }
  };

  return (
    <div className="ui-card p-0! overflow-hidden relative group">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-border bg-surface/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">{title}</h2>
            <p className="text-[10px] text-text-muted mt-0.5">Perbandingan antar periode</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] flex-wrap justify-end mt-2 sm:mt-0">
          {columns.map((col, i) => (
            <div
              key={col.key}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full whitespace-nowrap ${
                i === deltaTo ? 'tint-blue tint-pill font-bold' : 'bg-surface-muted text-text-muted font-semibold'
              }`}
              title={col.title}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${i === deltaTo ? 'bg-[rgb(var(--tint))]' : 'bg-text-muted'}`}></span>
              {col.label}
            </div>
          ))}
          <div className="flex items-center gap-1.5 sm:ml-2">
            <button
              type="button"
              onClick={handleDownloadSlide}
              disabled={exportState.busy}
              title="Unduh sebagai gambar siap tempel ke slide"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[11px] font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Unduh slide
            </button>
            <button
              type="button"
              onClick={handleCopySlide}
              disabled={exportState.busy}
              title="Salin gambar untuk langsung ditempel (Ctrl/Cmd+V) di PowerPoint"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[11px] font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:opacity-50"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              Salin
            </button>
            {exportState.message && <span className="text-[11px] font-medium text-text-muted" role="status">{exportState.message}</span>}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-[11px] font-medium text-text-muted tracking-wide">KPI</th>
              <th className="text-right px-4 py-3 text-[11px] font-medium text-text-muted tracking-wide">Target</th>
              {columns.map((col) => (
                <th key={col.key} className="text-right px-4 py-3 text-[11px] font-medium text-text-muted tracking-wide whitespace-nowrap" title={col.title}>
                  {col.label}
                  {col.sublabel && <span className="block text-[10px] font-normal text-text-muted/80">{col.sublabel}</span>}
                </th>
              ))}
              <th className="text-right px-5 py-3 text-[11px] font-medium text-text-muted tracking-wide whitespace-nowrap" title={deltaTitle}>
                Perubahan
                <span className="block text-[10px] font-normal text-text-muted/80">{deltaTitle}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {REPORT_METRICS.map((metric, i) => {
              const delta = (columns[deltaTo]?.stats[metric.key] ?? 0) - (columns[deltaFrom]?.stats[metric.key] ?? 0);
              const isUp = delta > 0;
              const isFlat = Math.abs(delta) < 0.5 * 10 ** -(metric.kind === 'count' ? 0 : 2);

              return (
                <tr key={metric.key} className={`border-b border-border/50 transition-colors ${ i % 2 === 0 ? 'bg-surface/20' : '' }`}>
                  <td className="px-5 py-3 font-semibold text-text-primary text-[13px] whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {metric.label}
                      <FormulaTooltip title={metric.label} />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[12px] font-medium text-text-muted">
                    {metric.target !== null ? metric.kind === 'score' ? formatNum(metric.target) : `${metric.target}%` : '-'}
                  </td>
                  {columns.map((col, ci) => {
                    const raw = col.stats[metric.key] ?? 0;
                    // Same as the exported slide: numbers stay neutral, the latest period gets a coloured arrow vs the one before.
                    const trend = ci === deltaTo && deltaFrom >= 0 ? columnTrend(metric, columns[deltaFrom].stats[metric.key], raw) : 'flat';
                    return (
                      <td key={col.key} className="px-4 py-3 text-right text-[14px] font-bold text-text-primary">
                        {trend !== 'flat' && (
                          <span aria-hidden className={`mr-1.5 text-[12px] ${trend === 'up' ? 'text-success' : 'text-danger'}`}>{trend === 'up' ? '▲' : '▼'}</span>
                        )}
                        {formatMetricValue(metric, raw)}
                      </td>
                    );
                  })}
                  <td className="px-5 py-3 text-right">
                    {isFlat ? (
                      <span className="text-[11px] font-semibold text-text-muted">–</span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums ${isUp ? 'text-success' : 'text-danger'}`}>
                        {isUp ? '▲' : '▼'}
                        {Math.abs(delta).toFixed(metric.kind === 'count' ? 0 : 2)}
                        {metric.kind === 'count' ? '' : ' poin'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {note && <p className="px-5 py-3 text-[10px] leading-relaxed text-text-muted border-t border-border/50">{note}</p>}
    </div>
  );
};

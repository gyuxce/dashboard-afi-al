import React, { useMemo, useState, useEffect } from "react";
import { AgentKPI, getOfficialCsatAggregate, getPreviousMonthPeriod, getPreviousPeriod, normalizeDateStr } from "../../lib/dataProcessor";
import { formatNum, getKpiStatus, parseDateForSort, type KpiType } from "../../lib/utils";
import { Activity, Star, Clock, CheckCircle, TrendingUp, Users, Info, ChevronDown, ClipboardCheck } from "lucide-react";
import { Sparkline } from "../ui/Sparkline";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { DashboardCharts } from "./DashboardCharts";
import { TeamLeaderSummary } from "./TeamLeaderSummary";
import { EmptyState } from "../ui/EmptyState";

interface Props {
  data: AgentKPI[];
  previousData?: AgentKPI[];
  previousData2?: AgentKPI[];
  previousData3?: AgentKPI[];
}

export const DashboardSummary: React.FC<Props> = ({ data, previousData = [], previousData2 = [], previousData3 = [] }) => {
  const [search, setSearch] = useState("");
  const [isRulesOpen, setIsRulesOpen] = useState(false);
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
    const calculate = (dataset: AgentKPI[]) => {
      let totalProd = 0, sumManDays = 0, sumSla1m = 0, sumSla3m = 0, sumWhu = 0;
      let sumCsatScFull = 0, countCsatScFull = 0, sumCsatScFair = 0, countCsatScFair = 0;
      let sumQa = 0, countQa = 0, sla1mCount = 0, sla3mCount = 0, whuCount = 0, attPresence = 0, attDuty = 0;
      const officialCsat = getOfficialCsatAggregate(dataset);

      dataset.forEach((d) => {
        totalProd += d.productivityTotal;
        sumManDays += d.manDays;
        if (d.sla1m !== null) { sumSla1m += d.sla1m; sla1mCount++; }
        if (d.sla3m !== null) { sumSla3m += d.sla3m; sla3mCount++; }
        if (d.whu !== null) { sumWhu += d.whu; whuCount++; }
        sumCsatScFull += d.csatScGoodCount || 0;
        countCsatScFull += d.csatScTotalValid || 0;
        sumCsatScFair += d.csatScFairGoodCount || 0;
        countCsatScFair += d.csatScFairTotalValid || 0;
        sumQa += d.qaScoreSum;
        countQa += d.qaScoreCount;
        attPresence += d.attendancePresence || 0;
        attDuty += d.attendanceDuty || 0;
      });

      return {
        productivity: totalProd,
        avgProductivity: sumManDays > 0 ? totalProd / sumManDays : 0,
        csat: officialCsat.score || 0,
        csatPercent: officialCsat.score !== null ? (officialCsat.score / 5) * 100 : 0,
        csatScFull: countCsatScFull > 0 ? (sumCsatScFull / countCsatScFull) * 100 : 0,
        csatScFullCount: countCsatScFull,
        csatScFair: countCsatScFair > 0 ? (sumCsatScFair / countCsatScFair) * 100 : 0,
        csatScFairCount: countCsatScFair,
        sla1m: sla1mCount > 0 ? sumSla1m / sla1mCount : 0,
        sla3m: sla3mCount > 0 ? sumSla3m / sla3mCount : 0,
        whu: whuCount > 0 ? sumWhu / whuCount : 0,
        qa: countQa > 0 ? sumQa / countQa : 0,
        attendance: attDuty > 0 ? (attPresence / attDuty) * 100 : 0,
        agentsCount: dataset.length,
      };
    };

    return {
      current: calculate(data),
      previous: calculate(previousData),
      previous2: calculate(previousData2),
      previous3: calculate(previousData3),
    };
  }, [data, previousData, previousData2, previousData3]);

  const isComparisonEnabled = useStore(state => state.isComparisonEnabled);
  const currentStats = stats.current;
  const previousStats = stats.previous;
  const previousStats2 = stats.previous2;
  const previousStats3 = stats.previous3;

  const getDelta = (curr: number, prev: number) => {
    if (!isComparisonEnabled || !previousData.length) return undefined;
    return curr - prev;
  };

  // A comparison period with rows but no activity (e.g. an un-populated month:
  // CSID roster loaded, activity sheets empty) must not render as columns of 0.
  const periodHasActivity = (d: AgentKPI[]) =>
    d.some((a) =>
      a.productivityBase > 0 ||
      a.qaScoreCount > 0 ||
      a.csatScTotalValid > 0 ||
      a.manDays > 0 ||
      (a.csat4Count || 0) + (a.csat5Count || 0) > 0 ||
      a.sla1m !== null ||
      a.whu !== null,
    );

  const generateDailyTrend = (dataset: AgentKPI[]) => {
    type DayAcc = {
      totalProd: number;
      sumCsat: number;
      countCsat: number;
      sumCsatFull: number;
      countCsatFull: number;
      sumCsatFair: number;
      countCsatFair: number;
      sumSla1m: number;
      countSla1m: number;
      sumSla3m: number;
      countSla3m: number;
      sumWhu: number;
      countWhu: number;
      sumQa: number;
      countQa: number;
      totalAttendancePresence: number;
      totalAttendanceDuty: number;
      hasProductivity: boolean;
    };

    const byDate = new Map<string, DayAcc>();
    const toKey = (raw?: string | null, norm?: string | null) => {
      if (norm) return norm;
      if (!raw) return '';
      return normalizeDateStr(raw) || raw;
    };
    const ensure = (date: string): DayAcc => {
      let acc = byDate.get(date);
      if (!acc) {
        acc = {
          totalProd: 0,
          sumCsat: 0,
          countCsat: 0,
          sumCsatFull: 0,
          countCsatFull: 0,
          sumCsatFair: 0,
          countCsatFair: 0,
          sumSla1m: 0,
          countSla1m: 0,
          sumSla3m: 0,
          countSla3m: 0,
          sumWhu: 0,
          countWhu: 0,
          sumQa: 0,
          countQa: 0,
          totalAttendancePresence: 0,
          totalAttendanceDuty: 0,
          hasProductivity: false,
        };
        byDate.set(date, acc);
      }
      return acc;
    };

    // Normalize all series to ISO keys so label dates and schedule normDates merge.
    dataset.forEach((a) => {
      const hist = a.dailyHistory;
      if (!hist) return;

      hist.productivity?.forEach((h) => {
        const key = toKey(h.date, h.normDate);
        if (!key || !h.value) return;
        const acc = ensure(key);
        acc.totalProd += h.value;
        acc.hasProductivity = true;
      });

      hist.csat?.forEach((h) => {
        const key = toKey(h.date, h.normDate);
        if (!key || !h.value) return;
        const acc = ensure(key);
        const respondentCount = h.count || 1;
        acc.sumCsat += h.sum ?? h.value * respondentCount;
        acc.countCsat += respondentCount;
      });

      hist.sla1m?.forEach((h) => {
        const key = toKey(h.date, h.normDate);
        if (!key || !h.value) return;
        const acc = ensure(key);
        acc.sumSla1m += h.value;
        acc.countSla1m += 1;
      });

      hist.sla3m?.forEach((h) => {
        const key = toKey(h.date, h.normDate);
        if (!key || !h.value) return;
        const acc = ensure(key);
        acc.sumSla3m += h.value;
        acc.countSla3m += 1;
      });

      hist.whu?.forEach((h) => {
        const key = toKey(h.date, h.normDate);
        if (!key || !h.value) return;
        const acc = ensure(key);
        acc.sumWhu += h.value;
        acc.countWhu += 1;
      });

      hist.csatScFull?.forEach((h) => {
        const key = toKey(h.date, h.normDate);
        if (!key || !(h.count > 0)) return;
        const acc = ensure(key);
        acc.sumCsatFull += h.score;
        acc.countCsatFull += h.count;
      });

      hist.csatScFair?.forEach((h) => {
        const key = toKey(h.date, h.normDate);
        if (!key || !(h.count > 0)) return;
        const acc = ensure(key);
        acc.sumCsatFair += h.score;
        acc.countCsatFair += h.count;
      });

      // Schedule/QA only enrich days that already have productivity — avoids zero-only days.
      hist.schedule?.forEach((s) => {
        const key = toKey(s.date, s.normDate);
        if (!key || !byDate.has(key)) return;
        const acc = byDate.get(key)!;
        // Mirror the processor's duty/presence rules exactly so the daily
        // Attendance line matches the headline Attendance KPI card.
        if (s.isManDay || s.status === "PULLOUT") acc.totalAttendanceDuty += 1;
        if (s.status === "PULLOUT" || (s.isManDay && s.status !== "S")) {
          acc.totalAttendancePresence += 1;
        }
      });

      a.qaHistory?.forEach((q) => {
        const key = toKey(q.date, q.normDate);
        if (!key || q.score === undefined || !byDate.has(key)) return;
        const acc = byDate.get(key)!;
        acc.sumQa += q.score;
        acc.countQa += 1;
      });
    });

    const sortedDates = Array.from(byDate.keys())
      .filter((date) => byDate.get(date)?.hasProductivity)
      .sort((a, b) => parseDateForSort(a) - parseDateForSort(b));

    return sortedDates.map((date) => {
      const acc = byDate.get(date)!;
      let dateLabel = date;
      const parts = date.split("-");
      if (parts.length === 3 && parts[0].length === 4) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if (!isNaN(d.getTime())) {
          dateLabel = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(d);
        }
      }

      return {
        date,
        dateLabel,
        productivity: acc.totalProd,
        csat: acc.countCsat > 0 ? Number((acc.sumCsat / acc.countCsat).toFixed(2)) : null,
        csatScFull: acc.countCsatFull > 0 ? Number(((acc.sumCsatFull / acc.countCsatFull) * 100).toFixed(2)) : null,
        csatScFair: acc.countCsatFair > 0 ? Number(((acc.sumCsatFair / acc.countCsatFair) * 100).toFixed(2)) : null,
        sla1m: acc.countSla1m > 0 ? Number((acc.sumSla1m / acc.countSla1m).toFixed(2)) : null,
        sla3m: acc.countSla3m > 0 ? Number((acc.sumSla3m / acc.countSla3m).toFixed(2)) : null,
        whu: acc.countWhu > 0 ? Number((acc.sumWhu / acc.countWhu).toFixed(2)) : null,
        qa: acc.countQa > 0 ? Number((acc.sumQa / acc.countQa).toFixed(2)) : null,
        attendance: acc.totalAttendanceDuty > 0 ? Number(((acc.totalAttendancePresence / acc.totalAttendanceDuty) * 100).toFixed(2)) : null,
        avgProductivity: acc.totalAttendanceDuty > 0 ? Number((acc.totalProd / acc.totalAttendanceDuty).toFixed(2)) : null,
      };
    });
  };

  const dailyTrend = useMemo(() => {
    const current = generateDailyTrend(data);
    const previous = isComparisonEnabled ? generateDailyTrend(previousData) : [];
    const originCurrent = current[0]?.date || '';
    const originPrevious = previous[0]?.date || '';
    const dayOffset = (iso: string, origin: string) => {
      if (!iso || !origin) return Number.NaN;
      return Math.round((parseDateForSort(iso) - parseDateForSort(origin)) / 86400000);
    };
    const prevByOffset = new Map(
      previous.map((item) => [dayOffset(item.date, originPrevious), item]),
    );

    return current.map((item) => {
      const prevItem = prevByOffset.get(dayOffset(item.date, originCurrent));
      return {
        ...item,
        prevProductivity: prevItem ? prevItem.productivity : null,
        prevDateLabel: prevItem ? prevItem.dateLabel : null,
      };
    });
  }, [data, previousData, isComparisonEnabled]);


  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-4 gap-4">
        <h1 className="text-lg font-bold text-text-primary shrink-0">
          Dashboard Summary{" "}
          <span className="text-text-muted font-normal text-sm ml-2">
            Active Period: Live
          </span>
        </h1>

        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Cari CS ID atau nama..."
              aria-label="Cari CS ID atau nama..."
              className="pl-8 pr-3 py-1.5 border border-border bg-card text-text-primary rounded-xl text-xs focus:border-primary focus:outline-none w-full md:w-56"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <svg
              className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          </div>
        </div>
      </div>

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
            const trend = (key: keyof (typeof dailyTrend)[number]) =>
              dailyTrend.map((d) => d[key] as number | null);
            return (
              <>
                {/* Hero KPI strip — the five people lead with */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <StatCard
                    variant="hero"
                    title="Total Productivity"
                    value={formatNum(currentStats.productivity, 0)}
                    sparkValues={trend("productivity")}
                    delta={getDelta(currentStats.productivity, previousStats.productivity)}
                    previousValue={prev(formatNum(previousStats.productivity, 0))}
                    kpiTheme="productivity"
                  />
                  <StatCard
                    variant="hero"
                    title="Avg Productivity"
                    value={formatNum(currentStats.avgProductivity, 0)}
                    rawValue={currentStats.avgProductivity}
                    targetType="productivity"
                    targetLabel="100"
                    sparkValues={trend("avgProductivity")}
                    delta={getDelta(currentStats.avgProductivity, previousStats.avgProductivity)}
                    previousValue={prev(formatNum(previousStats.avgProductivity, 0))}
                    kpiTheme="productivity-avg"
                  />
                  <StatCard
                    variant="hero"
                    title="CSAT Official"
                    value={formatNum(currentStats.csat)}
                    unit="/ 5"
                    rawValue={currentStats.csat}
                    targetType="csatOfficial"
                    targetLabel="3.75"
                    sparkValues={trend("csat")}
                    delta={getDelta(currentStats.csatPercent, previousStats.csatPercent)}
                    previousValue={prev(formatNum(previousStats.csat) + " / 5")}
                    kpiTheme="csat"
                  />
                  <StatCard
                    variant="hero"
                    title="QA Score"
                    value={formatNum(currentStats.qa) + "%"}
                    rawValue={currentStats.qa}
                    targetType="qa"
                    targetLabel="92%"
                    sparkValues={trend("qa")}
                    delta={getDelta(currentStats.qa, previousStats.qa)}
                    previousValue={prev(formatNum(previousStats.qa) + "%")}
                    kpiTheme="qa"
                  />
                  <StatCard
                    variant="hero"
                    title="Attendance"
                    value={formatNum(currentStats.attendance) + "%"}
                    rawValue={currentStats.attendance}
                    targetType="attendance"
                    targetLabel="95%"
                    sparkValues={trend("attendance")}
                    delta={getDelta(currentStats.attendance, previousStats.attendance)}
                    previousValue={prev(formatNum(previousStats.attendance) + "%")}
                    kpiTheme="attendance"
                  />
                </div>

                {/* Secondary KPI tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <StatCard
                    title="CSAT SC Full"
                    value={formatNum(currentStats.csatScFull) + "%"}
                    rawValue={currentStats.csatScFull}
                    targetType="csatFull"
                    targetLabel="75%"
                    subValue={currentStats.csatScFull > 0 ? formatNum((currentStats.csatScFull / 100) * 5, 2) + " poin" : undefined}
                    delta={getDelta(currentStats.csatScFull, previousStats.csatScFull)}
                    previousValue={prev(formatNum(previousStats.csatScFull) + "%")}
                    kpiTheme="csat"
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
                    kpiTheme="csat"
                  />
                  <StatCard
                    title="SLA 1 Menit"
                    value={formatNum(currentStats.sla1m) + "%"}
                    rawValue={currentStats.sla1m}
                    targetType="sla1m"
                    targetLabel="92%"
                    delta={getDelta(currentStats.sla1m, previousStats.sla1m)}
                    previousValue={prev(formatNum(previousStats.sla1m) + "%")}
                    kpiTheme="sla"
                  />
                  <StatCard
                    title="SLA 3 Menit"
                    value={formatNum(currentStats.sla3m) + "%"}
                    rawValue={currentStats.sla3m}
                    targetType="sla3m"
                    targetLabel="96%"
                    delta={getDelta(currentStats.sla3m, previousStats.sla3m)}
                    previousValue={prev(formatNum(previousStats.sla3m) + "%")}
                    kpiTheme="sla"
                  />
                  <StatCard
                    title="WHU (%)"
                    value={formatNum(currentStats.whu) + "%"}
                    rawValue={currentStats.whu}
                    targetType="whu"
                    targetLabel="96%"
                    delta={getDelta(currentStats.whu, previousStats.whu)}
                    previousValue={prev(formatNum(previousStats.whu) + "%")}
                    kpiTheme="whu"
                  />
                </div>
              </>
            );
          })()}

          <KpiRulesPanel
            isOpen={isRulesOpen}
            onToggle={() => setIsRulesOpen((value) => !value)}
          />

          {/* Weekly Report Panel - only shown when comparison is active + has data */}
          {isComparisonEnabled && periodHasActivity(previousData) && (
            <WeeklyReportPanel
              currentStats={currentStats}
              previousStats={previousStats}
              previousStats2={previousStats2}
              previousStats3={previousStats3}
              hasPrev2={periodHasActivity(previousData2)}
              hasPrev3={periodHasActivity(previousData3)}
              startDate={startDate}
              endDate={endDate}
              comparisonMode={comparisonMode}
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
    target: "3.75 / 5",
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

const KpiRulesPanel = ({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) => {
  const rules = Object.entries(KPI_FORMULAS);

  return (
    <section className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Info size={14} className="shrink-0 text-primary" />
            <h2 className="text-sm font-bold text-text-primary">Aturan KPI</h2>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Target dan ringkasan cara penilaian setiap KPI.
          </p>
        </div>
        <ChevronDown
          size={16}
          className={`shrink-0 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-surface text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium tracking-wide">KPI</th>
                  <th className="px-4 py-2 font-medium tracking-wide">Target</th>
                  <th className="px-4 py-2 font-medium tracking-wide">Cara Hitung</th>
                  <th className="px-4 py-2 font-medium tracking-wide">Sumber Data</th>
                  <th className="px-4 py-2 font-medium tracking-wide">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(([name, rule], index) => (
                  <tr
                    key={name}
                    className={`border-t border-border/60 ${index % 2 === 0 ? 'bg-surface/20' : ''}`}
                  >
                    <td className="px-4 py-3 font-semibold text-text-primary whitespace-nowrap">
                      {name}
                    </td>
                    <td className="px-4 py-3 font-semibold text-text-secondary whitespace-nowrap">
                      {rule.target || '-'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary min-w-[260px]">
                      {rule.formula}
                    </td>
                    <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                      {rule.source}
                    </td>
                    <td className="px-4 py-3 text-text-muted min-w-[220px]">
                      {rule.note || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

const parseDisplayValue = (value: string) => {
  const match = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const decimals = match[1].includes(".") ? match[1].split(".")[1].length : 0;
  return {
    target: Number(match[1]),
    decimals,
    suffix: match[2],
  };
};

const CountUpValue = ({ value }: { value: string }) => {
  const parsed = parseDisplayValue(value);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (!parsed || Number.isNaN(parsed.target)) {
      setDisplayValue(value);
      return;
    }

    let animationFrame = 0;
    const durationMs = 2400;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = parsed.target * eased;
      setDisplayValue(`${nextValue.toFixed(parsed.decimals)}${parsed.suffix}`);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    setDisplayValue(`${(0).toFixed(parsed.decimals)}${parsed.suffix}`);
    animationFrame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animationFrame);
  }, [value, parsed?.target, parsed?.decimals, parsed?.suffix]);

  return <>{displayValue}</>;
};

const STATUS_TEXT_CLASS: Record<string, string> = {
  on: 'text-text-primary',
  none: 'text-text-primary',
  watch: 'text-warning',
  miss: 'text-danger',
};

const StatCard = ({
  title,
  value,
  unit,
  rawValue,
  targetType,
  targetLabel,
  sparkValues,
  subValue,
  kpiTheme,
  delta,
  previousValue,
  variant = 'mini',
}: {
  title: string;
  value: string;
  unit?: string;
  rawValue?: number | null;
  targetType?: KpiType;
  targetLabel?: string;
  sparkValues?: Array<number | null | undefined>;
  subValue?: string;
  kpiTheme: string;
  delta?: number;
  previousValue?: string;
  variant?: 'hero' | 'mini';
}) => {
  let Icon = Users;
  if (kpiTheme.includes('productivity')) Icon = TrendingUp;
  else if (kpiTheme === 'csat') Icon = Star;
  else if (kpiTheme === 'sla') Icon = Clock;
  else if (kpiTheme === 'whu') Icon = Activity;
  else if (kpiTheme === 'qa') Icon = ClipboardCheck;
  else if (kpiTheme === 'attendance') Icon = CheckCircle;

  const status = targetType ? getKpiStatus(rawValue, targetType) : 'none';
  const numberColor = STATUS_TEXT_CLASS[status] ?? 'text-text-primary';
  const sparkColor =
    status === 'miss' ? 'text-danger' : status === 'watch' ? 'text-warning' : 'text-text-muted';
  const isCompareMode = previousValue !== undefined;
  const isHero = variant === 'hero';

  return (
    <div className={`bg-card w-full border border-border rounded-xl ${isHero ? 'p-4' : 'p-3'} flex flex-col gap-2 hover:border-border-strong transition-colors relative overflow-visible`}>
      <div className="flex items-center gap-2 w-full">
        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 bg-surface-muted border border-border">
          <Icon size={11} className="text-text-muted" />
        </div>
        <p className="min-w-0 flex-1 text-[10px] font-medium text-text-muted tracking-[0.08em] uppercase truncate">{title}</p>
        <FormulaTooltip title={title} />
      </div>

      <div className={`flex items-baseline gap-1 tabular-nums font-semibold tracking-tight leading-none ${numberColor} ${isHero ? 'text-[27px]' : 'text-[19px]'}`}>
        <CountUpValue value={value} />
        {unit && <span className="text-[13px] font-medium text-text-muted">{unit}</span>}
      </div>

      {isHero && sparkValues && (
        <div className={sparkColor}>
          <Sparkline values={sparkValues} height={24} />
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {targetLabel && !isCompareMode && (
          <span className={`inline-flex items-center text-[11px] tabular-nums rounded-md px-1.5 py-0.5 ${
            status === 'miss'
              ? 'text-danger bg-danger/10'
              : status === 'watch'
                ? 'text-warning bg-warning/10'
                : 'text-text-muted bg-surface-muted'
          }`}>
            target {targetLabel}
          </span>
        )}
        {isCompareMode && delta !== undefined && delta !== 0 && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${
            delta > 0 ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
          }`}>
            {delta > 0 ? '+' : '−'}{Math.abs(delta).toFixed(1)}
          </span>
        )}
        {subValue && !isCompareMode && (
          <span className="text-[10px] font-medium text-text-muted">{subValue}</span>
        )}
      </div>

      {isCompareMode && (
        <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/60">
          <span className="text-[9px] font-medium text-text-muted uppercase tracking-wide">Prev</span>
          <span className="text-[13px] font-semibold text-text-secondary tabular-nums">{previousValue}</span>
        </div>
      )}
    </div>
  );
};

// --- Weekly Report Panel ---
const WeeklyReportPanel = ({
  currentStats,
  previousStats,
  previousStats2,
  previousStats3,
  hasPrev2,
  hasPrev3,
  startDate,
  endDate,
  comparisonMode,
}: {
  currentStats: any;
  previousStats: any;
  previousStats2?: any;
  previousStats3?: any;
  hasPrev2?: boolean;
  hasPrev3?: boolean;
  startDate: string;
  endDate: string;
  comparisonMode: 'wow' | 'mom';
}) => {
  const formatDate = (d: string) => {
    if (!d) return '-';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(dt);
  };

  const getPeriodLabel = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const month = new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d);
    if (comparisonMode === 'mom') {
      return `${month} ${d.getFullYear()}`;
    }
    const weekNum = Math.ceil(d.getDate() / 7);
    return `W${weekNum} ${month}`;
  };

  const getPrevRange = comparisonMode === 'mom' ? getPreviousMonthPeriod : getPreviousPeriod;
  const prevRange = getPrevRange(startDate, endDate);
  const prev2Range = getPrevRange(prevRange.start, prevRange.end);
  const prev3Range = getPrevRange(prev2Range.start, prev2Range.end);

  const prevStart = (() => {
    return prevRange.start;
  })();
  const prevEnd = (() => {
    return prevRange.end;
  })();
  
  const prev2Start = (() => {
    return prev2Range.start;
  })();
  const prev2End = (() => {
    return prev2Range.end;
  })();
  
  const prev3Start = (() => {
    return prev3Range.start;
  })();
  const prev3End = (() => {
    return prev3Range.end;
  })();

  const showPrev3 = comparisonMode !== 'mom' && Boolean(hasPrev3);

  const rows: Array<{
    label: string; curr: string; prev: string; prev2: string; prev3: string;
    delta: number; isCount: boolean; target: number | null;
    kpiType: KpiType | null;
    rawCurr: number; rawPrev: number; rawPrev2: number; rawPrev3: number;
  }> = [
    { label: 'Total Productivity', curr: formatNum(currentStats.productivity, 0),  prev: formatNum(previousStats.productivity, 0), prev2: formatNum(previousStats2?.productivity || 0, 0), prev3: formatNum(previousStats3?.productivity || 0, 0), delta: currentStats.productivity - previousStats.productivity,   isCount: true, target: null, kpiType: null,  rawCurr: currentStats.productivity,    rawPrev: previousStats.productivity, rawPrev2: previousStats2?.productivity || 0, rawPrev3: previousStats3?.productivity || 0 },
    { label: 'Avg Productivity',   curr: formatNum(currentStats.avgProductivity, 0),prev: formatNum(previousStats.avgProductivity, 0),prev2: formatNum(previousStats2?.avgProductivity || 0, 0),prev3: formatNum(previousStats3?.avgProductivity || 0, 0),delta: currentStats.avgProductivity - previousStats.avgProductivity,isCount: true,  target: 100,   kpiType: 'productivity', rawCurr: currentStats.avgProductivity, rawPrev: previousStats.avgProductivity, rawPrev2: previousStats2?.avgProductivity || 0, rawPrev3: previousStats3?.avgProductivity || 0 },
    { label: 'CSAT Official',      curr: formatNum(currentStats.csat),        prev: formatNum(previousStats.csat), prev2: formatNum(previousStats2?.csat || 0), prev3: formatNum(previousStats3?.csat || 0), delta: currentStats.csat - previousStats.csat,                     isCount: false, target: 3.75,    kpiType: 'csatOfficial', rawCurr: currentStats.csat,            rawPrev: previousStats.csat, rawPrev2: previousStats2?.csat || 0, rawPrev3: previousStats3?.csat || 0 },
    { label: 'CSAT SC Full',       curr: formatNum(currentStats.csatScFull) + '%',  prev: formatNum(previousStats.csatScFull) + '%', prev2: formatNum(previousStats2?.csatScFull || 0) + '%', prev3: formatNum(previousStats3?.csatScFull || 0) + '%', delta: currentStats.csatScFull - previousStats.csatScFull,         isCount: false, target: 75,    kpiType: 'csatFull', rawCurr: currentStats.csatScFull,      rawPrev: previousStats.csatScFull, rawPrev2: previousStats2?.csatScFull || 0, rawPrev3: previousStats3?.csatScFull || 0 },
    { label: 'CSAT SC After Takeout', curr: formatNum(currentStats.csatScFair) + '%', prev: formatNum(previousStats.csatScFair) + '%', prev2: formatNum(previousStats2?.csatScFair || 0) + '%', prev3: formatNum(previousStats3?.csatScFair || 0) + '%', delta: currentStats.csatScFair - previousStats.csatScFair, isCount: false, target: 92, kpiType: 'csatFair', rawCurr: currentStats.csatScFair, rawPrev: previousStats.csatScFair, rawPrev2: previousStats2?.csatScFair || 0, rawPrev3: previousStats3?.csatScFair || 0 },
    { label: 'SLA 1 Menit',        curr: formatNum(currentStats.sla1m) + '%',       prev: formatNum(previousStats.sla1m) + '%', prev2: formatNum(previousStats2?.sla1m || 0) + '%', prev3: formatNum(previousStats3?.sla1m || 0) + '%', delta: currentStats.sla1m - previousStats.sla1m,                   isCount: false, target: 92,    kpiType: 'sla1m', rawCurr: currentStats.sla1m,           rawPrev: previousStats.sla1m, rawPrev2: previousStats2?.sla1m || 0, rawPrev3: previousStats3?.sla1m || 0 },
    { label: 'SLA 3 Menit',        curr: formatNum(currentStats.sla3m) + '%',       prev: formatNum(previousStats.sla3m) + '%', prev2: formatNum(previousStats2?.sla3m || 0) + '%', prev3: formatNum(previousStats3?.sla3m || 0) + '%', delta: currentStats.sla3m - previousStats.sla3m,                   isCount: false, target: 96,    kpiType: 'sla3m', rawCurr: currentStats.sla3m,           rawPrev: previousStats.sla3m, rawPrev2: previousStats2?.sla3m || 0, rawPrev3: previousStats3?.sla3m || 0 },
    { label: 'WHU (%)',             curr: formatNum(currentStats.whu) + '%',         prev: formatNum(previousStats.whu) + '%', prev2: formatNum(previousStats2?.whu || 0) + '%', prev3: formatNum(previousStats3?.whu || 0) + '%', delta: currentStats.whu - previousStats.whu,                       isCount: false, target: 96,    kpiType: 'whu', rawCurr: currentStats.whu,             rawPrev: previousStats.whu, rawPrev2: previousStats2?.whu || 0, rawPrev3: previousStats3?.whu || 0 },
    { label: 'QA Score',           curr: formatNum(currentStats.qa) + '%',          prev: formatNum(previousStats.qa) + '%', prev2: formatNum(previousStats2?.qa || 0) + '%', prev3: formatNum(previousStats3?.qa || 0) + '%', delta: currentStats.qa - previousStats.qa,                         isCount: false, target: 92,    kpiType: 'qa', rawCurr: currentStats.qa,              rawPrev: previousStats.qa, rawPrev2: previousStats2?.qa || 0, rawPrev3: previousStats3?.qa || 0 },
    { label: 'Attendance',         curr: formatNum(currentStats.attendance) + '%',  prev: formatNum(previousStats.attendance) + '%', prev2: formatNum(previousStats2?.attendance || 0) + '%', prev3: formatNum(previousStats3?.attendance || 0) + '%', delta: currentStats.attendance - previousStats.attendance,         isCount: false, target: 95,    kpiType: 'attendance', rawCurr: currentStats.attendance,      rawPrev: previousStats.attendance, rawPrev2: previousStats2?.attendance || 0, rawPrev3: previousStats3?.attendance || 0 },
  ];

  const cellClass = (rawVal: number, kpiType: KpiType | null) => {
    if (kpiType === null) return 'text-text-primary';
    const st = getKpiStatus(rawVal, kpiType);
    return st === 'miss' ? 'text-danger' : st === 'watch' ? 'text-warning' : 'text-text-primary';
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden mb-6 relative group">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-border bg-surface/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              {comparisonMode === 'mom' ? 'Monthly Performance Report' : 'Weekly Performance Report'}
            </h2>
            <p className="text-[10px] text-text-muted mt-0.5">Perbandingan antar periode</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] flex-wrap justify-end mt-2 sm:mt-0">
          <div
            className="flex items-center gap-1.5 bg-primary/10 text-primary px-2 py-1 rounded-full font-bold whitespace-nowrap"
            title={`${formatDate(startDate)} - ${formatDate(endDate)}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            {getPeriodLabel(endDate)}
          </div>
          <div
            className="flex items-center gap-1.5 bg-surface-muted text-text-muted px-2 py-1 rounded-full font-semibold whitespace-nowrap"
            title={`${formatDate(prevStart)} - ${formatDate(prevEnd)}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-text-muted"></span>
            {getPeriodLabel(prevEnd)}
          </div>
          {hasPrev2 && (
            <div
              className="flex items-center gap-1.5 bg-surface-muted text-text-muted px-2 py-1 rounded-full font-semibold whitespace-nowrap"
              title={`${formatDate(prev2Start)} - ${formatDate(prev2End)}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted"></span>
              {getPeriodLabel(prev2End)}
            </div>
          )}
          {showPrev3 && (
            <div
              className="flex items-center gap-1.5 bg-surface-muted text-text-muted px-2 py-1 rounded-full font-semibold whitespace-nowrap"
              title={`${formatDate(prev3Start)} - ${formatDate(prev3End)}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted"></span>
              {getPeriodLabel(prev3End)}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-[11px] font-medium text-text-muted tracking-wide">KPI</th>
              <th className="text-right px-4 py-3 text-[11px] font-medium text-text-muted tracking-wide">Target</th>
              <th className="text-right px-4 py-3 text-[11px] font-medium text-text-muted tracking-wide">{getPeriodLabel(endDate)}</th>
              <th className="text-right px-4 py-3 text-[11px] font-medium text-text-muted tracking-wide">{getPeriodLabel(prevEnd)}</th>
              {hasPrev2 && <th className="text-right px-4 py-3 text-[11px] font-medium text-text-muted tracking-wide">{getPeriodLabel(prev2End)}</th>}
              {showPrev3 && <th className="text-right px-4 py-3 text-[11px] font-medium text-text-muted tracking-wide">{getPeriodLabel(prev3End)}</th>}
              <th className="text-right px-5 py-3 text-[11px] font-medium text-text-muted tracking-wide">Perubahan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isUp = row.delta > 0;
              const isFlat = Math.abs(row.delta) < 0.01;

              return (
                <tr key={i} className={`border-b border-border/50 transition-colors ${ i % 2 === 0 ? 'bg-surface/20' : '' }`}>
                  <td className="px-5 py-3 font-semibold text-text-primary text-[13px] whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {row.label}
                      <FormulaTooltip title={row.label} />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[12px] font-medium text-text-muted">
                    {row.target !== null ? row.label === 'CSAT Official' ? formatNum(row.target) : `${row.target}%` : '-'}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold text-[14px] ${cellClass(row.rawCurr, row.kpiType)}`}>
                    {row.curr}
                  </td>
                  <td className={`px-4 py-3 text-right text-[14px] font-bold ${cellClass(row.rawPrev, row.kpiType)}`}>{row.prev}</td>
                  {hasPrev2 && <td className={`px-4 py-3 text-right text-[14px] font-bold ${cellClass(row.rawPrev2, row.kpiType)}`}>{row.prev2}</td>}
                  {showPrev3 && <td className={`px-4 py-3 text-right text-[14px] font-bold ${cellClass(row.rawPrev3, row.kpiType)}`}>{row.prev3}</td>}
                  <td className="px-5 py-3 text-right">
                    {isFlat ? (
                      <span className="text-[11px] font-semibold text-text-muted">–</span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums ${isUp ? 'text-success' : 'text-danger'}`}>
                        {isUp ? '▲' : '▼'}
                        {Math.abs(row.delta).toFixed(row.isCount ? 0 : 2)}
                        {row.isCount ? '' : ' poin'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};



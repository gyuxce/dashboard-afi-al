import { type AgentKPI } from './dataProcessor';
import { normalizeDateStr } from './dates';
import { parseDateForSort } from './utils';

/**
 * Day-by-day series behind the Summary trend chart: every KPI of every agent folded into one value per calendar day.
 * Pure (AgentKPI[] in, rows out) so the numbers can be tested without rendering.
 */
export function buildDailyTrend(dataset: AgentKPI[]) {
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
}

export type DailyTrendPoint = ReturnType<typeof buildDailyTrend>[number];

/**
 * Lines the previous period up with the current one by day offset (day 1 of each range, day 2 …) so the chart can
 * draw both on the same axis. `previous` is empty when no comparison is shown.
 */
export function withPreviousProductivity(current: DailyTrendPoint[], previous: DailyTrendPoint[]) {
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
}

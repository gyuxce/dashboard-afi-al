import type { AgentKPI } from './dataProcessor';
import type { CalendarWeek } from './weeks';
import { weekColumnLabels, weekHasData } from './weekCompare';
import type { ComparisonMode, Period } from './comparisonPlan';
import {
  calculatePeriodStats,
  formatPeriodLabel,
  formatReportDate,
  formatWeekSpan,
  type PeriodStats,
  type ReportColumn,
} from './weeklyReport';

export type ReportPanel = {
  title: string;
  columns: ReportColumn[];
  deltaTo: number;
  deltaFrom: number;
  note: string | undefined;
};

/**
 * A comparison period with rows but no activity (e.g. an un-populated month: CSID roster loaded, activity sheets empty)
 * must not render as columns of 0.
 */
export const periodHasActivity = (d: AgentKPI[]): boolean =>
  d.some((a) =>
    a.productivityBase > 0 ||
    a.qaScoreCount > 0 ||
    a.csatScTotalValid > 0 ||
    a.manDays > 0 ||
    (a.csat4Count || 0) + (a.csat5Count || 0) > 0 ||
    a.sla1m !== null ||
    a.whu !== null,
  );

export type ReportPanelInput = {
  comparisonMode: ComparisonMode;
  startDate: string;
  endDate: string;
  /** Monday–Sunday weeks of the range and their KPI rows, same order (WoW over a longer range). */
  weekRanges: CalendarWeek[];
  weekData: AgentKPI[][];
  /** The previous periods the app planned (lib/comparisonPlan): the report must show exactly the ones that were computed. */
  periods: { prev1: Period | null; prev2: Period | null; prev3: Period | null };
  data: { previous: AgentKPI[]; previous2: AgentKPI[]; previous3: AgentKPI[] };
  stats: { current: PeriodStats; previous: PeriodStats; previous2: PeriodStats; previous3: PeriodStats };
  todayIso: string;
};

/** Columns of the Weekly / Monthly Performance Report, or null while there is nothing worth comparing. */
export function buildReportPanel(input: ReportPanelInput): ReportPanel | null {
  const { comparisonMode, startDate, endDate, weekRanges, weekData, periods, data, stats, todayIso } = input;
  const rangeTitle = (start: string, end: string) => `${formatReportDate(start)} - ${formatReportDate(end)}`;

  // WoW over a multi-week range: the Monday–Sunday weeks side by side (W1, W2, …).
  if (comparisonMode === 'wow' && weekRanges.length > 0) {
    if (weekData.length !== weekRanges.length) return null; // week data still being computed
    const columns: ReportColumn[] = [];
    const weekLabels = weekColumnLabels(weekRanges);
    weekRanges.forEach((week, i) => {
      if (!weekHasData(weekData[i])) return;
      columns.push({
        key: `w${week.start}`,
        label: weekLabels[i],
        sublabel: formatWeekSpan(week.start, week.end),
        title: rangeTitle(week.start, week.end),
        start: week.start,
        end: week.end,
        stats: calculatePeriodStats(weekData[i]),
      });
    });
    if (columns.length < 2) return null;
    const running = weekRanges
      .map((week, i) => ({ week, label: weekLabels[i] }))
      .filter(({ week }) => week.end >= todayIso && columns.some((c) => c.key === `w${week.start}`))
      .map(({ label }) => label);
    const note = [
      'Minggu kalender Senin–Minggu; minggu pertama dan terakhir bisa mencakup tanggal bulan sebelum/sesudahnya, jadi jumlah semua minggu tidak selalu sama dengan total bulan.',
      running.length > 0 ? `Minggu berjalan (belum selesai): ${running.join(', ')}.` : '',
    ].filter(Boolean).join(' ');
    return { title: 'Weekly Performance Report', columns, deltaTo: columns.length - 1, deltaFrom: columns.length - 2, note };
  }

  const { prev1, prev2, prev3 } = periods;
  if (!prev1 || !periodHasActivity(data.previous)) return null;
  const labelOf = (end: string) => formatPeriodLabel(end, comparisonMode);
  const columns: ReportColumn[] = [
    { key: 'cur', label: labelOf(endDate), title: rangeTitle(startDate, endDate), start: startDate, end: endDate, stats: stats.current },
    { key: 'p1', label: labelOf(prev1.end), title: rangeTitle(prev1.start, prev1.end), start: prev1.start, end: prev1.end, stats: stats.previous },
  ];
  if (prev2 && periodHasActivity(data.previous2)) {
    columns.push({ key: 'p2', label: labelOf(prev2.end), title: rangeTitle(prev2.start, prev2.end), start: prev2.start, end: prev2.end, stats: stats.previous2 });
  }
  if (prev3 && comparisonMode !== 'mom' && periodHasActivity(data.previous3)) {
    columns.push({ key: 'p3', label: labelOf(prev3.end), title: rangeTitle(prev3.start, prev3.end), start: prev3.start, end: prev3.end, stats: stats.previous3 });
  }
  return {
    title: comparisonMode === 'mom' ? 'Monthly Performance Report' : 'Weekly Performance Report',
    columns,
    deltaTo: 0,
    deltaFrom: 1,
    note: undefined,
  };
}

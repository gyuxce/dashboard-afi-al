import type { ComparisonPlan, PlanTab } from './comparisonPlan';
import { getDateRangeForSheetMonth, getPreviousSheetMonthKey, getSheetMonthKeyFromDate } from './sheetsApi';

/** Most months of history the app ever loads before the selected month (MoM compares 3 previous months). */
export const MAX_HISTORY_MONTHS = 3;

/**
 * How many months before `selectedMonth` have to be loaded so that `earliestDate` (ISO) is covered.
 * 0 when the date is inside the selected month; capped at `max` for older dates.
 */
export function historyDepthFor(selectedMonth: string, earliestDate: string | null, max = MAX_HISTORY_MONTHS): number {
  if (!earliestDate) return 0;
  const range = getDateRangeForSheetMonth(selectedMonth);
  if (!range || earliestDate >= range.start) return 0;
  const target = getSheetMonthKeyFromDate(earliestDate.slice(0, 7));
  let key = selectedMonth;
  for (let depth = 1; depth <= max; depth++) {
    const previous = getPreviousSheetMonthKey(key);
    if (!previous) return depth - 1;
    key = previous;
    if (key === target) return depth;
  }
  return max;
}

const dayBefore = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

export type HistoryNeeds = {
  /** Months before the selected one that must be fully in memory. */
  depth: number;
  /**
   * Months back for which at least the Schedule tab is needed (>= depth). A chat before 07:00 belongs to the previous day
   * when that day is a shift-22 day, so a period that starts on the 1st needs the schedule of the last day of the month before.
   * That month does not need its other tabs.
   */
  scheduleDepth: number;
  /** The month after the selected one (QA for Simulasi Insentif, week-crossing days for the slide export). */
  nextMonth: boolean;
};

export type HistoryNeedsInput = {
  selectedMonth: string;
  tab: PlanTab;
  /** The Simulasi Insentif tab buckets QA by case date, which can sit in the following month's tab. */
  isIncentiveTab: boolean;
  startDate: string;
  endDate: string;
  plan: Pick<ComparisonPlan, 'prev1' | 'prev2' | 'prev3' | 'weekRanges' | 'monthRanges'>;
};

/**
 * What the current screen needs loaded, so the rest is not downloaded, parsed and kept in memory for nothing:
 * Summary needs last month for its "vs bln lalu" chips, comparisons need up to three periods back, the slide export
 * needs four months and the weeks crossing month boundaries.
 */
export function historyNeeds(input: HistoryNeedsInput): HistoryNeeds {
  const { selectedMonth, tab, isIncentiveTab, startDate, endDate, plan } = input;
  const starts = [
    startDate,
    plan.prev1?.start,
    plan.prev2?.start,
    plan.prev3?.start,
    plan.weekRanges[0]?.start,
    plan.monthRanges[0]?.start,
  ].filter((d): d is string => !!d);
  const earliest = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const monthEnd = getDateRangeForSheetMonth(selectedMonth)?.end;
  const nextMonth = tab === 'export' || isIncentiveTab || (!!monthEnd && !!endDate && endDate > monthEnd);
  const depth = historyDepthFor(selectedMonth, earliest);
  const scheduleDepth = earliest ? Math.max(depth, historyDepthFor(selectedMonth, dayBefore(earliest))) : depth;
  return { depth, scheduleDepth, nextMonth };
}

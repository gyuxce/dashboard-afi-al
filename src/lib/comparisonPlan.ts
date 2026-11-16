import { getPreviousMonthPeriodToDate, getPreviousPeriod } from './dataProcessor';
import { getMonthRanges, getRollingWeeks, type CalendarWeek, type MonthRange } from './weeks';

/**
 * Which extra periods the app has to compute for the current tab: the previous month shown quietly on Summary, the
 * WoW / MoM comparison columns, the rolling weeks and the months of the weekly export. Pure, so the rules are tested
 * once here instead of living inside App.tsx.
 */

export type ComparisonMode = 'wow' | 'mom';
export type Period = { start: string; end: string };

/** Only what matters for planning: Summary, the tabs that can compare, the slide export, or anything else. */
export type PlanTab = 'summary' | 'compare' | 'export' | 'other';

const COMPARE_TABS = new Set(['productivity', 'csat_official', 'csat']);

export function planTabOf(activeTab: string): PlanTab {
  if (activeTab === 'summary') return 'summary';
  if (activeTab === 'weekly_export') return 'export';
  return COMPARE_TABS.has(activeTab) ? 'compare' : 'other';
}

export type ComparisonPlanInput = {
  tab: PlanTab;
  isComparisonEnabled: boolean;
  comparisonMode: ComparisonMode;
  startDate: string;
  endDate: string;
  /** Last day the Productivity sheet has data for the active month (running months are compared up to there). */
  productivityLastDate: string | null;
  todayIso: string;
};

export type ComparisonPlan = {
  /** The tab can show a comparison (Summary, Productivity, CSAT Official, CSAT Room). */
  comparisonTabs: boolean;
  needsComparisonData: boolean;
  /** Summary shows "vs bulan lalu" even with the toggle off. */
  passivePrevMonth: boolean;
  prev1: Period | null;
  prev2: Period | null;
  prev3: Period | null;
  weekRanges: CalendarWeek[];
  monthRanges: MonthRange[];
};

// Stable empty references: downstream hooks compare these by identity.
export const NO_WEEKS: CalendarWeek[] = [];
export const NO_MONTHS: MonthRange[] = [];

export function planComparison(input: ComparisonPlanInput): ComparisonPlan {
  const { tab, isComparisonEnabled, comparisonMode, startDate, endDate, productivityLastDate, todayIso } = input;
  const comparisonTabs = tab === 'summary' || tab === 'compare';
  const needsComparisonData = isComparisonEnabled && comparisonTabs;
  const passivePrevMonth = !isComparisonEnabled && tab === 'summary';

  let prev1: Period | null = null;
  let prev2: Period | null = null;
  let prev3: Period | null = null;
  if (passivePrevMonth && startDate && endDate) {
    prev1 = getPreviousMonthPeriodToDate(startDate, endDate, productivityLastDate);
  } else if (needsComparisonData && startDate && endDate) {
    prev1 = comparisonMode === 'mom'
      ? getPreviousMonthPeriodToDate(startDate, endDate, productivityLastDate)
      : getPreviousPeriod(startDate, endDate);
    // Earlier periods are full copies of the (already cut) previous one, shifted back.
    const shiftBack = (p: Period) => (comparisonMode === 'mom' ? getPreviousMonthPeriodToDate(p.start, p.end, null) : getPreviousPeriod(p.start, p.end));
    prev2 = shiftBack(prev1);
    prev3 = shiftBack(prev2);
  }

  // WoW over a range longer than one week compares the Monday–Sunday weeks of that range (rolling into the previous month
  // early in a month); the export always needs them. A single week still compares against the previous 7 days.
  let weekRanges = NO_WEEKS;
  if ((needsComparisonData && comparisonMode === 'wow') || tab === 'export') {
    const weeks = getRollingWeeks(startDate, endDate, todayIso);
    weekRanges = weeks.length >= 2 ? weeks.slice(-6) : NO_WEEKS;
  }

  const monthRanges = tab === 'export' && endDate ? getMonthRanges(endDate, 4) : NO_MONTHS;
  return { comparisonTabs, needsComparisonData, passivePrevMonth, prev1, prev2, prev3, weekRanges, monthRanges };
}

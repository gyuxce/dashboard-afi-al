import type { AgentKPI } from './dataProcessor';
import type { CalendarWeek, MonthRange } from './weeks';
import { weekHasData, type WeekCompare } from './weekCompare';

export type ExportCol = { rows: AgentKPI[]; label: string; start: string; end: string };
export type PeriodMode = 'weekly' | 'monthly';

/**
 * The columns of the weekly / monthly slides, oldest to newest.
 * Monthly: the last four months that have data. Weekly: the calendar weeks from the comparison, newest-first in
 * `weekCompare`, so reversed here; empty slots are dropped. Fewer than two columns means nothing to compare (null).
 */
export function buildExportColumns(
  periodMode: PeriodMode,
  weekCompare: WeekCompare | null,
  monthRanges: MonthRange[],
  monthData: AgentKPI[][],
): ExportCol[] | null {
  if (periodMode === 'monthly') {
    const list = monthRanges
      .map((m, i) => ({ rows: monthData[i] ?? [], label: m.label, start: m.start, end: m.end }))
      .filter((c) => c.rows.length > 0 && weekHasData(c.rows))
      .slice(-4);
    return list.length >= 2 ? list : null;
  }
  if (!weekCompare) return null;
  const list = weekCompare.sets
    .map((rows, i) => ({ rows, label: weekCompare.labels[i], week: weekCompare.weeks[i] }))
    .filter((c): c is { rows: AgentKPI[]; label: string; week: CalendarWeek } => c.week !== null)
    .map((c) => ({ rows: c.rows, label: c.label, start: c.week.start, end: c.week.end }))
    .reverse();
  return list.length >= 2 ? list : null;
}

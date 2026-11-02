import type { AgentKPI } from './dataProcessor';
import type { CalendarWeek } from './weeks';

/**
 * The four comparison slots (newest first) that the WoW panels on Productivity / CSAT tabs read,
 * filled with calendar weeks instead of "previous periods of the same length".
 */
export type WeekCompare = {
  sets: AgentKPI[][];
  labels: string[];
};

/** A week counts only once it has real activity — man-days and QA rows exist for future weeks too. */
export const weekHasData = (rows: AgentKPI[]) =>
  rows.some((a) =>
    a.productivityTotal > 0 ||
    a.csatScTotalValid > 0 ||
    (a.csat4Count || 0) + (a.csat5Count || 0) > 0 ||
    a.sla1m !== null ||
    a.whu !== null,
  );

/** "W5 Okt": numbered inside the range, month taken from the week's Thursday (so 26 Okt–1 Nov is Oktober). */
export function weekLabel(week: CalendarWeek): string {
  const [y, m, d] = week.start.split('-').map(Number);
  const thursday = new Date(y, m - 1, d + 3);
  const month = new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(thursday);
  return `W${week.index} ${month}`;
}

/** Last four weeks that have data (newest first). Null when fewer than two — nothing to compare. */
export function buildWeekCompare(weeks: CalendarWeek[], weekData: AgentKPI[][]): WeekCompare | null {
  if (weeks.length === 0 || weekData.length !== weeks.length) return null;
  const withData = weeks
    .map((week, i) => ({ week, rows: weekData[i] }))
    .filter(({ rows }) => weekHasData(rows))
    .slice(-4)
    .reverse();
  if (withData.length < 2) return null;
  const sets: AgentKPI[][] = [];
  const labels: string[] = [];
  for (let i = 0; i < 4; i++) {
    sets.push(withData[i]?.rows ?? []);
    labels.push(withData[i] ? weekLabel(withData[i].week) : '');
  }
  return { sets, labels };
}

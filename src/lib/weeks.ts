export type CalendarWeek = {
  /** 1-based position of the week inside the range (W1 = the week containing the first day). */
  index: number;
  /** ISO yyyy-mm-dd, clipped to the range. */
  start: string;
  end: string;
  /** Days of this week that fall inside the range (7 for a full Monday–Sunday week). */
  days: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const parseIso = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Splits a date range into Monday–Sunday calendar weeks, clipped to the range:
 * 1–31 Oct 2026 → 1–4, 5–11, 12–18, 19–25, 26–31. The first and last week can be partial.
 */
export function getCalendarWeeks(startDate: string, endDate: string): CalendarWeek[] {
  if (!startDate || !endDate) return [];
  const start = parseIso(startDate);
  const end = parseIso(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];

  const weeks: CalendarWeek[] = [];
  let cursor = start;
  while (cursor <= end) {
    const dayOfWeek = cursor.getDay() || 7; // Monday = 1 … Sunday = 7
    const sunday = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + (7 - dayOfWeek));
    const weekEnd = sunday > end ? end : sunday;
    weeks.push({
      index: weeks.length + 1,
      start: toIso(cursor),
      end: toIso(weekEnd),
      days: Math.round((weekEnd.getTime() - cursor.getTime()) / DAY_MS) + 1,
    });
    cursor = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate() + 1);
  }
  return weeks;
}

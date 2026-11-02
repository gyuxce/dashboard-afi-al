export type CalendarWeek = {
  /** 1-based position of the week inside the range (W1 = the week containing the first day). */
  index: number;
  /** ISO yyyy-mm-dd of the full Monday and Sunday — NOT clipped, so a week can cross a month boundary. */
  start: string;
  end: string;
  /** Days of this week that fall inside the selected range. */
  daysInRange: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const parseIso = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Splits a date range into Monday–Sunday calendar weeks. A week belongs to the month that holds
 * most of its days (its Thursday, as in ISO weeks), so Week 1 of a month is the first week whose
 * Thursday falls in it. Weeks are kept whole and can reach into the neighbouring month:
 * for October 2026 → W1 28 Sep–4 Okt, W2 5–11, W3 12–18, W4 19–25, W5 26 Okt–1 Nov, while
 * November starts at W1 2–8 Nov (26 Okt–1 Nov already belongs to October).
 */
export function getCalendarWeeks(startDate: string, endDate: string): CalendarWeek[] {
  if (!startDate || !endDate) return [];
  const start = parseIso(startDate);
  const end = parseIso(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];

  const weeks: CalendarWeek[] = [];
  let monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() || 7) - 1));
  while (monday <= end) {
    const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    if (thursday >= start && thursday <= end) {
      const first = monday < start ? start : monday;
      const last = sunday > end ? end : sunday;
      weeks.push({
        index: weeks.length + 1,
        start: toIso(monday),
        end: toIso(sunday),
        daysInRange: Math.round((last.getTime() - first.getTime()) / DAY_MS) + 1,
      });
    }
    monday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  }
  return weeks;
}

export type MonthRange = { label: string; start: string; end: string };

/** The `count` calendar months ending with the month of `endIso` (oldest first), e.g. Agustus, September, Oktober. */
export function getMonthRanges(endIso: string, count: number): MonthRange[] {
  const [y, m] = endIso.split('-').map(Number);
  if (!y || !m) return [];
  const out: MonthRange[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const first = new Date(y, m - 1 - i, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const name = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(first);
    out.push({
      label: name.charAt(0).toUpperCase() + name.slice(1),
      start: toIso(first),
      end: toIso(last),
    });
  }
  return out;
}

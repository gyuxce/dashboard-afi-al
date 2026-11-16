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

/** The week's number inside the month that holds its Thursday (1–5): the first Thursday of a month is W1. */
const thursdayWeekIndex = (mondayIso: string) => {
  const monday = parseIso(mondayIso);
  return Math.ceil(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3).getDate() / 7);
};

/**
 * Calendar weeks for week-on-week comparison. Normally the weeks of the selected range, but early in
 * a month only a couple of them have happened (16 Nov: W1, W2), so earlier whole weeks are added in
 * front until `minWeeks` have started — the comparison then keeps its four columns across the month
 * boundary (W4 Okt, W5 Okt, W1 Nov, W2 Nov). Once the month has `minWeeks` elapsed weeks the result
 * is exactly {@link getCalendarWeeks}. A single week (< 2) is returned as is: it compares to the previous 7 days.
 * `todayIso` decides which weeks have started.
 */
export function getRollingWeeks(startDate: string, endDate: string, todayIso: string, minWeeks = 5): CalendarWeek[] {
  const weeks = getCalendarWeeks(startDate, endDate);
  if (weeks.length < 2) return weeks;
  const elapsed = weeks.filter((w) => w.start <= todayIso).length;
  if (elapsed >= minWeeks) return weeks;

  const firstMonday = parseIso(weeks[0].start);
  const earlier: CalendarWeek[] = [];
  for (let i = elapsed < 1 ? minWeeks : minWeeks - elapsed; i >= 1; i--) {
    const monday = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate() - 7 * i);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    earlier.push({ index: 0, start: toIso(monday), end: toIso(sunday), daysInRange: 7 });
  }
  // Mixed months: number every week by its Thursday's month so "W5 Okt" really is the fifth week of October.
  return [...earlier, ...weeks].map((w) => ({ ...w, index: thursdayWeekIndex(w.start) }));
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

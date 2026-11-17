export type DayCell = {
  /** Normalized ISO date `YYYY-MM-DD`. */
  date: string;
  /** null = no data that day. */
  value: number | null;
  /** `22` (shift 22) or `PO` (pullout), shown as a small badge. */
  marker?: string | null;
  /** Scheduled OFF / C: shown as a muted "off", never counted. */
  off?: boolean;
};

/** Weeks as rows, Monday → Sunday as columns; null = a day outside the shown range. */
export type WeekRow = (DayCell | null)[];

const parseIso = (date: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const DAY_MS = 86_400_000;

/**
 * Lays chronological day cells out as a Monday-first calendar so weekday patterns read at a glance.
 * Returns null when any date is not ISO (caller falls back to a flat strip).
 */
export function buildWeekGrid(cells: DayCell[]): WeekRow[] | null {
  if (cells.length === 0) return [];
  const byWeek = new Map<number, WeekRow>();
  for (const cell of cells) {
    const t = parseIso(cell.date);
    if (t === null) return null;
    const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
    const weekStart = t - dow * DAY_MS;
    let row = byWeek.get(weekStart);
    if (!row) {
      row = Array<DayCell | null>(7).fill(null);
      byWeek.set(weekStart, row);
    }
    row[dow] = cell;
  }
  return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

export type DaySummary = {
  /** Days that have a value. */
  daysWithData: number;
  /** Days whose value is under target. */
  belowTarget: number;
  lowest: { date: string; value: number } | null;
  highest: { date: string; value: number } | null;
};

/** One-line digest of an agent's days: how many fall short of `target` and the extremes. Earliest day wins a tie; off days are ignored. */
export function summarizeDays(cells: DayCell[], target: number): DaySummary {
  let daysWithData = 0;
  let belowTarget = 0;
  let lowest: DaySummary['lowest'] = null;
  let highest: DaySummary['highest'] = null;
  for (const c of cells) {
    if (c.off || c.value === null) continue;
    daysWithData++;
    if (c.value < target) belowTarget++;
    if (!lowest || c.value < lowest.value) lowest = { date: c.date, value: c.value };
    if (!highest || c.value > highest.value) highest = { date: c.date, value: c.value };
  }
  return { daysWithData, belowTarget, lowest, highest };
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** `2026-10-14` → `14 Okt`; anything else is returned unchanged. */
export function formatDayMonth(date: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${Number(m[2])} ${MONTH_ABBR[Number(m[1]) - 1] ?? ''}`.trim();
}

/** `2026-10-01` → `1 Okt 2026`; anything else is returned unchanged. */
export function formatDateFull(date: string): string {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(date);
  return m ? `${formatDayMonth(date)} ${m[1]}` : date;
}

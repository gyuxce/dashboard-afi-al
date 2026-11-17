import type { AgentKPI } from './dataProcessor';

/** Target chats per man-day (BUSINESS_RULES.md). */
export const PROD_TARGET = 100;

/** Chats per man-day of one agent; 0 when the agent has no man-day. */
export const agentAverage = (agent: AgentKPI): number =>
  agent.manDays > 0 ? agent.productivityTotal / agent.manDays : 0;

/** Chats above (or below, when negative) the quota of `manDays × target`. */
export const agentGap = (agent: AgentKPI, target = PROD_TARGET): number =>
  agent.productivityTotal - agent.manDays * target;

export type ProductivitySummary = {
  totalChat: number;
  totalAvg: number;
  totalManDays: number;
  activeAgents: number;
  /** Agents with output whose average is under target. */
  underTarget: number;
  totalQuota: number;
  quotaAchievement: number;
  totalGap: number;
};

/** The four headline tiles of Productivity Detail: team totals over agents that have any productivity. */
export function summarizeProductivity(data: AgentKPI[], target = PROD_TARGET): ProductivitySummary {
  const active = data.filter((a) => a.productivityBase > 0);
  let chat = 0;
  let manDays = 0;
  let quota = 0;
  let gap = 0;
  let under = 0;
  active.forEach((agent) => {
    chat += agent.productivityTotal;
    manDays += agent.manDays;
    const agentQuota = agent.manDays * target;
    quota += agentQuota;
    gap += agent.productivityTotal - agentQuota;
    const avg = agentAverage(agent);
    if (avg > 0 && avg < target) under++;
  });
  return {
    totalChat: chat,
    totalAvg: manDays > 0 ? chat / manDays : 0,
    totalManDays: manDays,
    activeAgents: active.length,
    underTarget: under,
    totalQuota: quota,
    quotaAchievement: quota > 0 ? (chat / quota) * 100 : 0,
    totalGap: gap,
  };
}

export type ProductivitySortKey = 'name' | 'bpo' | 'teamLeader' | 'total' | 'average' | 'gap';
export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

/** Agents in table order: the chosen column, or by default a ranking of output per man-day (best first). */
export function sortProductivityAgents(agents: AgentKPI[], sort: SortConfig): AgentKPI[] {
  const sorted = [...agents];
  if (!sort) return sorted.sort((a, b) => agentAverage(b) - agentAverage(a));
  return sorted.sort((a, b) => {
    let aVal: string | number = 0;
    let bVal: string | number = 0;
    switch (sort.key) {
      case 'name': aVal = a.name || a.csId; bVal = b.name || b.csId; break;
      case 'bpo': aVal = a.bpo || ''; bVal = b.bpo || ''; break;
      case 'teamLeader': aVal = a.teamLeader || ''; bVal = b.teamLeader || ''; break;
      case 'total': aVal = a.productivityTotal; bVal = b.productivityTotal; break;
      case 'average': aVal = agentAverage(a); bVal = agentAverage(b); break;
      case 'gap': aVal = agentGap(a); bVal = agentGap(b); break;
    }
    if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

/** The three agents with the lowest average among those with man-days (flagged red in the table). */
export function bottomThreeAgentIds(agents: AgentKPI[]): string[] {
  return [...agents]
    .filter((a) => a.manDays > 0)
    .sort((a, b) => agentAverage(a) - agentAverage(b))
    .slice(0, 3)
    .map((a) => a.csId);
}

export type DayCell = {
  /** Normalized ISO date `YYYY-MM-DD`. */
  date: string;
  /** null = no data that day. */
  value: number | null;
  /** `22` (shift 22) or `PO` (pullout), shown as a small badge. */
  marker?: string | null;
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

/** One-line digest of an agent's days: how many fall short and the extremes. Earliest day wins a tie. */
export function summarizeDays(cells: DayCell[], target = PROD_TARGET): DaySummary {
  let daysWithData = 0;
  let belowTarget = 0;
  let lowest: DaySummary['lowest'] = null;
  let highest: DaySummary['highest'] = null;
  for (const c of cells) {
    if (c.value === null) continue;
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

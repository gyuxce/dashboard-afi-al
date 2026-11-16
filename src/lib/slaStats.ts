import type { AgentKPI } from './dataProcessor';
import type { KpiType } from './utils';

export type SlaViewMode = '1m' | '3m' | 'whu';
export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

export type SlaView = {
  label: string;
  type: KpiType;
  /** Percent target shown in the "vs" column. */
  target: number;
  field: (a: AgentKPI) => number | null;
  hist: (a: AgentKPI) => { date: string; normDate?: string | null; value: number }[] | undefined;
};

export const SLA_VIEWS: Record<SlaViewMode, SlaView> = {
  '1m': { label: 'SLA 1 menit', type: 'sla1m', target: 92, field: (a) => a.sla1m, hist: (a) => a.dailyHistory?.sla1m },
  '3m': { label: 'SLA 3 menit', type: 'sla3m', target: 96, field: (a) => a.sla3m, hist: (a) => a.dailyHistory?.sla3m },
  whu: { label: 'WHU', type: 'whu', target: 96, field: (a) => a.whu, hist: (a) => a.dailyHistory?.whu },
};

/** Agents that have a value for the chosen metric and match the search box (CS ID or name) / TL filter. */
export function filterSlaAgents(data: AgentKPI[], search: string, filterTL: string | null, view: SlaView): AgentKPI[] {
  const q = search.toLowerCase();
  return data.filter((a) => {
    const matchSearch = a.csId.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q);
    const matchTL = filterTL ? a.teamLeader === filterTL : true;
    return matchSearch && matchTL && view.field(a) !== null;
  });
}

/** Table order: the chosen column, or the input order when none is chosen. Does not mutate the input. */
export function sortSlaAgents(agents: AgentKPI[], sort: SortConfig, view: SlaView): AgentKPI[] {
  const sorted = [...agents];
  if (!sort) return sorted;
  return sorted.sort((a, b) => {
    let aVal: string | number = 0;
    let bVal: string | number = 0;
    switch (sort.key) {
      case 'name': aVal = a.name || a.csId; bVal = b.name || b.csId; break;
      case 'teamLeader': aVal = a.teamLeader || ''; bVal = b.teamLeader || ''; break;
      case 'average': aVal = view.field(a) ?? 0; bVal = view.field(b) ?? 0; break;
    }
    if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

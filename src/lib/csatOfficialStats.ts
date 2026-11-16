import { getOfficialCsatAggregate, type AgentKPI } from './dataProcessor';
import { formatNum } from './utils';

/** CSAT Official target, stars out of 5 (BUSINESS_RULES.md). */
export const CSAT_OFFICIAL_TARGET = 3.75;

export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

/** Agents that have an official CSAT, matching the search box (CS ID or name) and the optional TL filter. */
export function filterOfficialAgents(data: AgentKPI[], search: string, filterTL: string | null): AgentKPI[] {
  const q = search.toLowerCase();
  return data.filter((a) => {
    const matchSearch = a.csId.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q);
    const matchTL = filterTL ? a.teamLeader === filterTL : true;
    return matchSearch && matchTL && a.csatAsli !== null;
  });
}

/** Table order: the chosen column, or the input order when no column is chosen. Does not mutate the input. */
export function sortOfficialAgents(agents: AgentKPI[], sort: SortConfig): AgentKPI[] {
  const sorted = [...agents];
  if (!sort) return sorted;
  return sorted.sort((a, b) => {
    let aVal: string | number = 0;
    let bVal: string | number = 0;
    switch (sort.key) {
      case 'name': aVal = a.name || a.csId; bVal = b.name || b.csId; break;
      case 'bpo': aVal = a.bpo || ''; bVal = b.bpo || ''; break;
      case 'teamLeader': aVal = a.teamLeader || ''; bVal = b.teamLeader || ''; break;
      case 'average': aVal = a.csatAsli || 0; bVal = b.csatAsli || 0; break;
    }
    if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

export type RankItem = { label: string; subLabel: string; value: string };

/** Team score and respondents, plus the top / bottom three days and agents for the "Highlight KPI" lists. */
export function buildOfficialHighlights(tableData: AgentKPI[]) {
  const aggregate = getOfficialCsatAggregate(tableData);
  const agentsByScore = [...tableData]
    .filter((agent) => agent.csatAsli !== null && agent.csatAsli !== undefined)
    .sort((a, b) => (b.csatAsli || 0) - (a.csatAsli || 0));

  const dailyMap = new Map<string, { sum: number; count: number }>();
  tableData.forEach((agent) => {
    agent.dailyHistory?.csat?.forEach((entry) => {
      const count = entry.count || 1;
      const current = dailyMap.get(entry.normDate || entry.date) || { sum: 0, count: 0 };
      dailyMap.set(entry.normDate || entry.date, {
        sum: current.sum + (entry.sum ?? entry.value * count),
        count: current.count + count,
      });
    });
  });

  const daysByScore = Array.from(dailyMap.entries())
    .map(([date, stats]) => ({ date, score: stats.count > 0 ? stats.sum / stats.count : 0, count: stats.count }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.score - a.score);

  const bottomOf = <T,>(list: T[]) => (list.length > 3 ? list.slice(Math.max(3, list.length - 3)).reverse() : []);
  const agentItem = (a: AgentKPI): RankItem => ({ label: a.name || a.csId, subLabel: a.teamLeader || a.csId, value: `${formatNum(a.csatAsli, 2)} / 5` });
  const dayItem = (d: { date: string; score: number; count: number }): RankItem => ({
    label: d.date,
    subLabel: `${formatNum(d.count, 0)} responden`,
    value: `${formatNum(d.score, 2)} / 5`,
  });

  return {
    aggregate,
    topAgents: agentsByScore.slice(0, 3).map(agentItem),
    bottomAgents: bottomOf(agentsByScore).map(agentItem),
    topDays: daysByScore.slice(0, 3).map(dayItem),
    bottomDays: bottomOf(daysByScore).map(dayItem),
  };
}

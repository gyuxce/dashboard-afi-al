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

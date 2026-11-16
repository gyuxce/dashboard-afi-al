import type { AgentKPI } from './dataProcessor';

export type IssueCategoryRow = {
  issue: string;
  count: number;
  categories: { name: string; count: number }[];
};

export type RcaBarRow = { name: string; count: number };

export type RcaAgentRow = {
  name: string;
  tl: string;
  agentCases: number;
  customerCases: number;
  akulakuCases: number;
  total: number;
};

/** True when at least one agent carries a RCA count, i.e. the sheet has the RCA columns filled. */
export const hasRcaData = (data: AgentKPI[]): boolean =>
  data.some(
    (a) =>
      Object.keys(a.rcaAgentAreaCounts).length > 0 ||
      Object.keys(a.rcaCustomerAreaCounts).length > 0 ||
      Object.keys(a.rcaAkulakuProcessCounts).length > 0,
  );

const toBar = (rec: Record<string, number>): RcaBarRow[] =>
  Object.entries(rec)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

const toIssueCategoryRows = (issueTotals: Record<string, number>, categoryMap: Record<string, Record<string, number>>): IssueCategoryRow[] =>
  Object.entries(issueTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([issue, count]) => ({
      issue,
      count,
      categories: Object.entries(categoryMap[issue] || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, categoryCount]) => ({ name, count: categoryCount })),
    }));

/**
 * Roll the RCA counts up into the three areas (Agent Area, Customer Area, Akulaku Process):
 * top eight issues per area as bars, top five issues with their top three case categories, per-agent totals, and area totals.
 */
export function buildRcaStats(data: AgentKPI[]) {
  const agentTotal: Record<string, number> = {};
  const customerTotal: Record<string, number> = {};
  const akulakuTotal: Record<string, number> = {};
  const agentCategoryMap: Record<string, Record<string, number>> = {};
  const customerCategoryMap: Record<string, Record<string, number>> = {};
  const akulakuCategoryMap: Record<string, Record<string, number>> = {};
  const agentCaseSummary: Record<string, { agentCases: number; customerCases: number; akulakuCases: number; name: string; tl: string }> = {};

  const addIssueCategory = (target: Record<string, Record<string, number>>, issue: string | undefined, category: string | undefined) => {
    const cleanIssue = String(issue || '').trim();
    if (!cleanIssue) return;
    const cleanCategory = String(category || 'Unknown Case').trim() || 'Unknown Case';
    if (!target[cleanIssue]) target[cleanIssue] = {};
    target[cleanIssue][cleanCategory] = (target[cleanIssue][cleanCategory] || 0) + 1;
  };

  data.forEach((a) => {
    const name = a.name || a.csId;
    if (!agentCaseSummary[a.csId]) {
      agentCaseSummary[a.csId] = { agentCases: 0, customerCases: 0, akulakuCases: 0, name, tl: a.teamLeader };
    }
    Object.entries(a.rcaAgentAreaCounts as Record<string, number>).forEach(([k, v]) => {
      agentTotal[k] = (agentTotal[k] || 0) + v;
      agentCaseSummary[a.csId].agentCases += v;
    });
    Object.entries(a.rcaCustomerAreaCounts as Record<string, number>).forEach(([k, v]) => {
      customerTotal[k] = (customerTotal[k] || 0) + v;
      agentCaseSummary[a.csId].customerCases += v;
    });
    Object.entries(a.rcaAkulakuProcessCounts as Record<string, number>).forEach(([k, v]) => {
      akulakuTotal[k] = (akulakuTotal[k] || 0) + v;
      agentCaseSummary[a.csId].akulakuCases += v;
    });

    a.csatHistory?.forEach((entry) => {
      addIssueCategory(agentCategoryMap, entry.rcaAgent, entry.category);
      addIssueCategory(customerCategoryMap, entry.rcaCustomer, entry.category);
      addIssueCategory(akulakuCategoryMap, entry.rcaAkulaku, entry.category);
    });
  });

  const sum = (rec: Record<string, number>) => Object.values(rec).reduce((a, b) => a + b, 0);

  const agentRanking: RcaAgentRow[] = Object.values(agentCaseSummary)
    .map((a) => ({ ...a, total: a.agentCases + a.customerCases + a.akulakuCases }))
    .filter((a) => a.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    agentDetailBar: toBar(agentTotal),
    customerDetailBar: toBar(customerTotal),
    akulakuDetailBar: toBar(akulakuTotal),
    agentIssueCategories: toIssueCategoryRows(agentTotal, agentCategoryMap),
    customerIssueCategories: toIssueCategoryRows(customerTotal, customerCategoryMap),
    akulakuIssueCategories: toIssueCategoryRows(akulakuTotal, akulakuCategoryMap),
    agentRanking,
    totalAgent: sum(agentTotal),
    totalCustomer: sum(customerTotal),
    totalAkulaku: sum(akulakuTotal),
  };
}

/** Search the per-agent table by agent name or team leader. A blank search keeps every row. */
export function filterRcaAgents(rows: RcaAgentRow[], search: string): RcaAgentRow[] {
  if (!search.trim()) return rows;
  const q = search.toLowerCase();
  return rows.filter((a) => a.name.toLowerCase().includes(q) || a.tl.toLowerCase().includes(q));
}

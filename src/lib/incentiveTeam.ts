import type { AgentKPI } from './dataProcessor';
import {
  DAILY_LIVECHAT_TARGET,
  TEAM_LEADER_GROSS_SALARY,
  bestLeaderBonuses,
  buildIncentiveRow,
  getCsatStats,
  getTeamLeaderTier,
  type IncentiveRow,
  type IncentiveStatus,
} from './incentiveScoring';

export interface TeamLeaderIncentiveRow {
  teamLeader: string;
  agentCount: number;
  incompleteCount: number;
  finalQaPct: number | null;
  finalCsatPct: number | null;
  finalProductivityPct: number | null;
  averageQaPoints: number | null;
  averageCsatPoints: number | null;
  averageProductivityPoints: number | null;
  finalScore: number | null;
  tier: string;
  baseIncentive: number | null;
  productivityBonus: number;
  bestLeaderBonus: number;
  totalIncentive: number | null;
  grossSalary: number;
  grossThp: number | null;
  status: IncentiveStatus;
}

/** One row in the tier list, normalised from either an agent or a TL row. */
export type IncentiveListItem = {
  id: string;
  name: string;
  meta: string;
  qcPts: number;
  csatPts: number;
  prodPts: number;
  qcPct: number | null;
  csatPct: number | null;
  prodPct: number | null;
  score: number | null;
  tier: string;
  status: IncentiveStatus;
  total: number | null;
};

/** Agent rows, highest total score first; agents without a score last (by name). */
export function buildAgentRows(agents: AgentKPI[]): IncentiveRow[] {
  return agents.map(buildIncentiveRow).sort((a, b) => {
    if (a.totalScore === null && b.totalScore === null) return a.name.localeCompare(b.name);
    if (a.totalScore === null) return 1;
    if (b.totalScore === null) return -1;
    return b.totalScore - a.totalScore;
  });
}

/**
 * One row per team leader. TL QA is the simple average of each agent's QA percentage; CSAT is pooled good/bad;
 * productivity is total chat over total duty x daily target. The Rp500k best-TL bonus goes to the single top score.
 */
export function buildTeamLeaderRows(agents: AgentKPI[]): TeamLeaderIncentiveRow[] {
  const grouped = new Map<string, AgentKPI[]>();
  agents.forEach((agent) => {
    const teamLeader = String(agent.teamLeader || '-').trim() || '-';
    const current = grouped.get(teamLeader) || [];
    current.push(agent);
    grouped.set(teamLeader, current);
  });

  const leaderRows = Array.from(grouped.entries())
    .map(([teamLeader, teamAgents]): TeamLeaderIncentiveRow => {
      const agentRows = teamAgents.map(buildIncentiveRow);
      const csatStats = teamAgents.reduce(
        (totals, agent) => {
          const stats = getCsatStats(agent);
          return { good: totals.good + stats.good, bad: totals.bad + stats.bad };
        },
        { good: 0, bad: 0 },
      );
      const totalDuty = teamAgents.reduce((sum, agent) => sum + agent.manDays, 0);
      const totalChat = teamAgents.reduce((sum, agent) => sum + agent.productivityTotal, 0);
      // TL QA uses the simple average of each agent's QA percentage.
      // Agent-level bucket points are intentionally not used here.
      const finalQaPct = agentRows.length > 0 && agentRows.every((row) => row.qaPct !== null)
        ? agentRows.reduce((sum, row) => sum + (row.qaPct || 0), 0) / agentRows.length
        : null;
      const csatTotal = csatStats.good + csatStats.bad;
      const finalCsatPct = csatTotal > 0 ? (csatStats.good / csatTotal) * 100 : null;
      const productivityTarget = totalDuty > 0 ? totalDuty * DAILY_LIVECHAT_TARGET : null;
      const finalProductivityPct = productivityTarget !== null ? (totalChat / productivityTarget) * 100 : null;
      const incompleteCount = agentRows.filter((row) => row.status === 'incomplete').length;
      const hasCompleteData = incompleteCount === 0
        && agentRows.length > 0
        && finalQaPct !== null
        && finalCsatPct !== null
        && finalProductivityPct !== null;
      const averageQaPoints = hasCompleteData ? ((finalQaPct || 0) / 100) * 55 : null;
      const averageCsatPoints = hasCompleteData
        ? agentRows.reduce((sum, row) => sum + (row.csatPoints || 0), 0) / agentRows.length
        : null;
      const averageProductivityPoints = hasCompleteData
        ? agentRows.reduce((sum, row) => sum + (row.productivityPoints || 0), 0) / agentRows.length
        : null;
      const finalScore = hasCompleteData
        ? (averageQaPoints || 0) + (averageCsatPoints || 0) + (averageProductivityPoints || 0)
        : null;

      if (finalScore === null) {
        return {
          teamLeader,
          agentCount: agentRows.length,
          incompleteCount,
          finalQaPct,
          finalCsatPct,
          finalProductivityPct,
          averageQaPoints,
          averageCsatPoints,
          averageProductivityPoints,
          finalScore,
          tier: '-',
          baseIncentive: null,
          productivityBonus: 0,
          bestLeaderBonus: 0,
          totalIncentive: null,
          grossSalary: TEAM_LEADER_GROSS_SALARY,
          grossThp: null,
          status: 'incomplete',
        };
      }

      const tier = getTeamLeaderTier(finalScore);
      const isEligible = tier.label !== '-';

      return {
        teamLeader,
        agentCount: agentRows.length,
        incompleteCount,
        finalQaPct,
        finalCsatPct,
        finalProductivityPct,
        averageQaPoints,
        averageCsatPoints,
        averageProductivityPoints,
        finalScore,
        tier: tier.label,
        baseIncentive: tier.incentive,
        productivityBonus: 0,
        bestLeaderBonus: 0,
        totalIncentive: isEligible ? tier.incentive : 0,
        grossSalary: TEAM_LEADER_GROSS_SALARY,
        grossThp: TEAM_LEADER_GROSS_SALARY + (isEligible ? tier.incentive : 0),
        status: isEligible ? 'eligible' : 'ineligible',
      };
    })
    .sort((a, b) => (b.finalScore || -1) - (a.finalScore || -1));

  // Best-TL bonus only for the highest final score; it needs no tier, and incomplete data cannot win.
  const bestBonus = bestLeaderBonuses(leaderRows.map((row) => ({ teamLeader: row.teamLeader, score: row.finalScore })));

  return leaderRows.map((row) => {
    // A TL with incomplete data (totalIncentive null) gets no THP, so the share stays empty.
    const bestLeaderBonus = row.totalIncentive === null ? 0 : bestBonus.get(row.teamLeader) ?? 0;
    const totalIncentive = row.totalIncentive === null ? null : (row.totalIncentive || 0) + bestLeaderBonus;
    return {
      ...row,
      bestLeaderBonus,
      totalIncentive,
      grossThp: totalIncentive === null ? null : row.grossSalary + totalIncentive,
    };
  });
}

export function agentListItems(rows: IncentiveRow[]): IncentiveListItem[] {
  return rows.map((row) => ({
    id: row.csId,
    name: row.name,
    meta: row.csId,
    qcPts: row.qaPoints ?? 0,
    csatPts: row.csatPoints ?? 0,
    prodPts: row.productivityPoints ?? 0,
    qcPct: row.qaPct,
    csatPct: row.csatPct,
    prodPct: row.productivityPct,
    score: row.totalScore,
    tier: row.tier,
    status: row.status,
    total: row.totalIncentive,
  }));
}

export function teamLeaderListItems(rows: TeamLeaderIncentiveRow[]): IncentiveListItem[] {
  return rows.map((row) => ({
    id: row.teamLeader,
    name: row.teamLeader,
    meta: `${row.agentCount} agent`,
    qcPts: row.averageQaPoints ?? 0,
    csatPts: row.averageCsatPoints ?? 0,
    prodPts: row.averageProductivityPoints ?? 0,
    qcPct: row.finalQaPct,
    csatPct: row.finalCsatPct,
    prodPct: row.finalProductivityPct,
    score: row.finalScore,
    tier: row.tier,
    status: row.status,
    total: row.totalIncentive,
  }));
}

/** Counts and the estimated total shown in the agent summary cards. Only eligible agents add to the total. */
export function summarizeAgentRows(rows: IncentiveRow[]) {
  const eligible = rows.filter((row) => row.status === 'eligible');
  return {
    count: rows.length,
    eligibleCount: eligible.length,
    ineligibleCount: rows.filter((row) => row.status === 'ineligible').length,
    incompleteCount: rows.filter((row) => row.status === 'incomplete').length,
    totalIncentive: eligible.reduce((sum, row) => sum + (row.totalIncentive || 0), 0),
  };
}

/** Totals shown in the Team Leader summary cards. */
export function summarizeTeamLeaderRows(rows: TeamLeaderIncentiveRow[]) {
  return {
    count: rows.length,
    agentCount: rows.reduce((sum, row) => sum + row.agentCount, 0),
    ineligibleCount: rows.reduce((sum, row) => sum + (row.status === 'ineligible' ? 1 : 0), 0),
    totalIncentive: rows.reduce((sum, row) => sum + (row.totalIncentive || 0), 0),
    totalGrossThp: rows.reduce((sum, row) => sum + (row.grossThp || 0), 0),
  };
}

/** The roster is known, but the incentive period has no QA / CSAT / productivity rows at all (e.g. an unpopulated month). */
export function isIncentivePeriodEmpty(rows: IncentiveRow[], agents: AgentKPI[]): boolean {
  return rows.length > 0 && rows.every((r) => r.status === 'incomplete')
    && agents.every((a) => a.manDays === 0 && a.qaScoreCount === 0 && a.productivityBase === 0);
}

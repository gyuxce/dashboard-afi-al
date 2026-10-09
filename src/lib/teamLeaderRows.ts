export const normalizeAgentName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export type TeamMemberStats = {
  manDays: number;
  productivityTotal: number;
  qaScoreSum: number;
  qaScoreCount: number;
  csatGood: number;
  csatBad: number;
};

export type TeamLeaderStats = {
  agentCount: number;
  /** Standard period duty — every TL shares one Target Call in the sheet. */
  duty: number;
  /** Per-agent average chats — the TL's Total Call in the official sheet. */
  avgChat: number;
  qaPct: number | null;
  csatGood: number;
  csatBad: number;
  csatPct: number | null;
};

/**
 * The official sheet gives every leader the same Target Call (2300 = 23 x 100)
 * regardless of team size, so a TL is measured against a full period of duty
 * rather than their team's attendance. Leaders work the whole roster cycle, so
 * take the highest man-days anyone reached in the period; the most common value
 * tracks agents who took days off and lands short (21 instead of 23).
 */
export const getStandardPeriodDuty = (manDaysPerAgent: number[]): number =>
  manDaysPerAgent.reduce((highest, manDays) => Math.max(highest, manDays || 0), 0);

/**
 * Team Leaders are scored on the per-agent average output of their team,
 * against the standard period target (duty x 100).
 */
export const aggregateTeamLeaderStats = (
  team: TeamMemberStats[],
  standardDuty: number,
): TeamLeaderStats | null => {
  const agentCount = team.length;
  if (agentCount === 0) return null;

  const totals = team.reduce(
    (acc, member) => {
      acc.chat += member.productivityTotal;
      acc.qaSum += member.qaScoreSum;
      acc.qaCount += member.qaScoreCount;
      acc.csatGood += member.csatGood;
      acc.csatBad += member.csatBad;
      return acc;
    },
    { chat: 0, qaSum: 0, qaCount: 0, csatGood: 0, csatBad: 0 },
  );

  const csatTotal = totals.csatGood + totals.csatBad;

  return {
    agentCount,
    duty: standardDuty,
    avgChat: totals.chat / agentCount,
    qaPct: totals.qaCount > 0 ? totals.qaSum / totals.qaCount : null,
    csatGood: totals.csatGood,
    csatBad: totals.csatBad,
    csatPct: csatTotal > 0 ? (totals.csatGood / csatTotal) * 100 : null,
  };
};

import { AgentKPI, getCsatBadRatingCount } from "./dataProcessor";

/**
 * Pure incentive-simulation math, split out of IncentiveSimulation.tsx so the
 * payroll numbers can be unit-tested without rendering the component.
 *
 * Scheme: QC 55 + CSAT 25 + Produktivitas 20 = 100. CSAT here is QA CSAT/DSAT
 * tagging, not the CSAT SC survey.
 */

export const DAILY_LIVECHAT_TARGET = 100;
export const LIVECHAT_PRODUCTIVITY_BONUS_PER_100 = 40000;
export const TEAM_LEADER_BEST_BONUS = 500000;
// PKWT TL: gaji Rp2.828.000 + jabatan Rp1.000.000 + transport Rp500.000 per bulan.
export const TEAM_LEADER_GROSS_SALARY = 4328000;

export type IncentiveStatus = "eligible" | "ineligible" | "incomplete";

export interface IncentiveRow {
  csId: string;
  name: string;
  teamLeader: string;
  qaPct: number | null;
  qaPoints: number | null;
  csatPct: number | null;
  csatPoints: number | null;
  productivityActual: number | null;
  productivityTarget: number | null;
  productivityPct: number | null;
  productivityPoints: number | null;
  totalScore: number | null;
  tier: string;
  baseIncentive: number | null;
  productivityBonus: number | null;
  totalIncentive: number | null;
  status: IncentiveStatus;
}

/** QC audit % → points on the Livechat curve (max 55). */
export const getQcPoints = (qaPct: number): number => {
  if (qaPct >= 98) return 55;
  if (qaPct >= 95) return 48.4;
  if (qaPct >= 90) return 38.5;
  if (qaPct >= 85) return 24.75;
  if (qaPct >= 80) return 11;
  return 0;
};

/** Agent composite score → tier + base incentive. */
export const getTier = (score: number): { label: string; incentive: number } => {
  if (score >= 96) return { label: "T1", incentive: 2000000 };
  if (score >= 88) return { label: "T2", incentive: 1250000 };
  if (score >= 80) return { label: "T3", incentive: 750000 };
  return { label: "-", incentive: 0 };
};

/** Team Leader composite score → tier + base incentive (different thresholds from agents). */
export const getTeamLeaderTier = (
  score: number,
): { label: string; incentive: number } => {
  if (score >= 90) return { label: "T1", incentive: 2000000 };
  if (score >= 85) return { label: "T2", incentive: 1250000 };
  if (score >= 80) return { label: "T3", incentive: 750000 };
  return { label: "-", incentive: 0 };
};

export const getCsatStats = (agent: AgentKPI) => {
  const good = agent.csat4Count + agent.csat5Count;
  const bad = getCsatBadRatingCount(agent);
  return { good, bad, total: good + bad };
};

export const getCsatPercent = (agent: AgentKPI): number | null => {
  const { good, total } = getCsatStats(agent);
  return total > 0 ? (good / total) * 100 : null;
};

export const buildIncentiveRow = (agent: AgentKPI): IncentiveRow => {
  const qaPct = agent.qaScoreCount > 0
    ? agent.qaScoreSum / agent.qaScoreCount
    : null;
  const csatPct = getCsatPercent(agent);
  const productivityTarget = agent.manDays > 0
    ? agent.manDays * DAILY_LIVECHAT_TARGET
    : null;
  const productivityActual = productivityTarget !== null
    ? agent.productivityTotal
    : null;
  const hasCompleteData =
    qaPct !== null && csatPct !== null && productivityActual !== null;

  if (!hasCompleteData) {
    return {
      csId: agent.csId,
      name: agent.name || agent.csId,
      teamLeader: agent.teamLeader || "-",
      qaPct,
      qaPoints: null,
      csatPct,
      csatPoints: null,
      productivityActual,
      productivityTarget,
      productivityPct: productivityTarget
        ? (productivityActual! / productivityTarget) * 100
        : null,
      productivityPoints: null,
      totalScore: null,
      tier: "-",
      baseIncentive: null,
      productivityBonus: null,
      totalIncentive: null,
      status: "incomplete",
    };
  }

  const qaPoints = getQcPoints(qaPct);
  const csatPoints = (csatPct / 100) * 25;
  const productivityPct = (productivityActual / productivityTarget!) * 100;
  const productivityPoints = (Math.min(productivityPct, 100) / 100) * 20;
  const totalScore = qaPoints + csatPoints + productivityPoints;
  const tier = getTier(totalScore);
  const isEligible = tier.label !== "-";
  const productivityBonus = isEligible
    ? (Math.max(0, productivityActual - productivityTarget!) / 100) *
      LIVECHAT_PRODUCTIVITY_BONUS_PER_100
    : 0;

  return {
    csId: agent.csId,
    name: agent.name || agent.csId,
    teamLeader: agent.teamLeader || "-",
    qaPct,
    qaPoints,
    csatPct,
    csatPoints,
    productivityActual,
    productivityTarget,
    productivityPct,
    productivityPoints,
    totalScore,
    tier: tier.label,
    baseIncentive: tier.incentive,
    productivityBonus,
    totalIncentive: tier.incentive + productivityBonus,
    status: isEligible ? "eligible" : "ineligible",
  };
};

/**
 * The Rp500.000 "best TL" pool is split evenly across every Team Leader
 * (not just the eligible ones). 5 TL → Rp100.000 each.
 */
export const bestLeaderBonusPerTeamLeader = (teamLeaderCount: number): number =>
  teamLeaderCount > 0 ? TEAM_LEADER_BEST_BONUS / teamLeaderCount : 0;

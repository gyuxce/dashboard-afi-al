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

/** Agent tiers, highest first. */
export const AGENT_TIERS = [
  { label: "T1", min: 96, incentive: 2000000 },
  { label: "T2", min: 88, incentive: 1250000 },
  { label: "T3", min: 80, incentive: 750000 },
] as const;

/** Agent composite score → tier + base incentive. */
export const getTier = (score: number): { label: string; incentive: number } => {
  const tier = AGENT_TIERS.find((t) => score >= t.min);
  return tier ? { label: tier.label, incentive: tier.incentive } : { label: "-", incentive: 0 };
};

/**
 * Training & Quiz (the client's "Pass Gate") live with the trainers, not in any
 * sheet. Until real data exists every agent counts as 100% / gate passed.
 */
export const TRAINING_QUIZ_DEFAULT = { trainingPct: 100, quizPct: 100, passGate: true } as const;

export const CSAT_MAX_POINTS = 25;
export const PRODUCTIVITY_MAX_POINTS = 20;
/** Highest score reachable with the given QA %: QC points + a perfect CSAT + full productivity. */
export const maxScoreForQa = (qaPct: number): number =>
  getQcPoints(qaPct) + CSAT_MAX_POINTS + PRODUCTIVITY_MAX_POINTS;

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

// ---------------------------------------------------------------------------
// What-if scoring + "naik tier" planner. Same formulas as buildIncentiveRow,
// but driven by raw inputs so a scenario can be tried without touching data.
// ---------------------------------------------------------------------------

export interface ScoreInputs {
  qaPct: number;
  csatGood: number;
  csatBad: number;
  chat: number;
  /** Productivity target in chats (man-days × DAILY_LIVECHAT_TARGET). */
  target: number;
}

export const scoreFromInputs = (input: ScoreInputs) => {
  const qaPoints = getQcPoints(input.qaPct);
  const csatTotal = input.csatGood + input.csatBad;
  const csatPct = csatTotal > 0 ? (input.csatGood / csatTotal) * 100 : null;
  const csatPoints = csatPct === null ? 0 : (csatPct / 100) * CSAT_MAX_POINTS;
  const productivityPct = input.target > 0 ? (input.chat / input.target) * 100 : 0;
  const productivityPoints = (Math.min(productivityPct, 100) / 100) * PRODUCTIVITY_MAX_POINTS;
  const totalScore = qaPoints + csatPoints + productivityPoints;
  const tier = getTier(totalScore);
  const productivityBonus = tier.label !== "-"
    ? (Math.max(0, input.chat - input.target) / 100) * LIVECHAT_PRODUCTIVITY_BONUS_PER_100
    : 0;
  return {
    qaPoints,
    csatPct,
    csatPoints,
    productivityPct,
    productivityPoints,
    totalScore,
    tier: tier.label,
    baseIncentive: tier.incentive,
    productivityBonus,
    totalIncentive: tier.incentive + productivityBonus,
  };
};

const QC_BAND_EDGES = [80, 85, 90, 95, 98] as const;

export interface TierPlanInput {
  qaSum: number;
  qaCount: number;
  csatGood: number;
  csatBad: number;
  chat: number;
  target: number;
  /** Expected number of QA-scored tickets still to come this period. */
  expectedMoreQa: number;
  remainingWorkDays: number;
}

export interface TierPlan {
  score: number;
  tier: string;
  nextTier: { label: string; min: number; incentive: number } | null;
  /** Points still missing for the next tier (null when already T1). */
  gap: number | null;
  /** Highest score reachable at the current QA band. */
  ceiling: number;
  /** True when no CSAT/productivity effort can reach the next tier without a higher QA band. */
  qaBottleneck: boolean;
  /** Needed on QA alone (others unchanged). */
  qa: { neededPct: number; requiredFutureAvg: number | null } | null;
  /** Needed on CSAT alone: percentage, and extra good ratings with no new bad ones. */
  csat: { neededPct: number; additionalGood: number | null } | null;
  /** Needed on productivity alone: extra chats overall and per remaining work day. */
  productivity: { additionalChats: number; perDay: number | null } | null;
}

export const planTierUp = (input: TierPlanInput): TierPlan | null => {
  if (input.qaCount <= 0 || input.csatGood + input.csatBad <= 0 || input.target <= 0) return null;

  const qaPct = input.qaSum / input.qaCount;
  const base = scoreFromInputs({ ...input, qaPct });
  const next = [...AGENT_TIERS].reverse().find((t) => t.min > base.totalScore) ?? null;
  const ceiling = maxScoreForQa(qaPct);

  const plan: TierPlan = {
    score: base.totalScore,
    tier: base.tier,
    nextTier: next ? { label: next.label, min: next.min, incentive: next.incentive } : null,
    gap: next ? next.min - base.totalScore : null,
    ceiling,
    qaBottleneck: next ? ceiling < next.min : false,
    qa: null,
    csat: null,
    productivity: null,
  };
  if (!next) return plan;

  // QA alone: smallest QC band edge whose points lift the total over the line.
  const band = QC_BAND_EDGES.find(
    (edge) => edge > qaPct && scoreFromInputs({ ...input, qaPct: edge }).totalScore >= next.min,
  );
  if (band !== undefined) {
    const futureAvg = input.expectedMoreQa > 0
      ? (band * (input.qaCount + input.expectedMoreQa) - input.qaSum) / input.expectedMoreQa
      : null;
    plan.qa = {
      neededPct: band,
      requiredFutureAvg: futureAvg !== null && futureAvg <= 100 ? futureAvg : null,
    };
  }

  // CSAT alone.
  const csatPointsNeeded = next.min - base.qaPoints - base.productivityPoints;
  if (csatPointsNeeded <= CSAT_MAX_POINTS) {
    const neededPct = (Math.max(0, csatPointsNeeded) / CSAT_MAX_POINTS) * 100;
    const p = neededPct / 100;
    let additionalGood: number | null;
    if (base.csatPct !== null && base.csatPct >= neededPct) additionalGood = 0;
    else if (p >= 1) additionalGood = input.csatBad === 0 ? 0 : null;
    else {
      additionalGood = Math.max(
        0,
        Math.ceil((p * (input.csatGood + input.csatBad) - input.csatGood) / (1 - p)),
      );
    }
    plan.csat = { neededPct, additionalGood };
  }

  // Productivity alone.
  const prodPointsNeeded = next.min - base.qaPoints - base.csatPoints;
  if (prodPointsNeeded <= PRODUCTIVITY_MAX_POINTS) {
    const neededChats = Math.ceil((Math.max(0, prodPointsNeeded) / PRODUCTIVITY_MAX_POINTS) * input.target);
    const additionalChats = Math.max(0, neededChats - input.chat);
    plan.productivity = {
      additionalChats,
      perDay: input.remainingWorkDays > 0 ? additionalChats / input.remainingWorkDays : null,
    };
  }

  return plan;
};

const SHIFT_CODE = /^(\d+([.,]\d+)?|\d{1,2}:\d{2}.*)$/;

/** Scheduled shift days from `todayIso` (inclusive) to `endIso` — what is still left to work. */
export const countRemainingWorkDays = (
  schedule: Array<{ normDate?: string | null; status?: string }> | undefined,
  todayIso: string,
  endIso: string,
): number =>
  (schedule || []).filter((entry) => {
    const date = entry.normDate || "";
    return date >= todayIso && date <= endIso && SHIFT_CODE.test(String(entry.status || "").trim());
  }).length;

/** Expected QA tickets still to come, from the pace so far. */
export const estimateRemainingQaTickets = (
  qaCount: number,
  manDays: number,
  remainingWorkDays: number,
): number => {
  const elapsedDays = Math.max(1, manDays - remainingWorkDays);
  return Math.max(0, Math.round((qaCount / elapsedDays) * remainingWorkDays));
};

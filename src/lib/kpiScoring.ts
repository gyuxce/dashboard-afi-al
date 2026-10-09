import { AgentKPI } from "./dataProcessor";

export const COMPOSITE_WEIGHTS = {
  qa: 50,
  productivity: 20,
  csat: 20,
  fixed: 10,
} as const;

export interface CompositeScoreInput {
  qaPct: number | null;
  productivityPct: number | null;
  csatPct: number | null;
}

export interface CompositeScoreResult extends CompositeScoreInput {
  score: number | null;
}

export function getAgentCompositeInputs(agent: AgentKPI): CompositeScoreInput & {
  qaOriginal: number | null;
  productivityOriginal: number | null;
  csatOriginal: number | null;
} {
  const qaOriginal =
    agent.qaScoreCount > 0 ? agent.qaScoreSum / agent.qaScoreCount : null;

  const productivityOriginal =
    agent.targetQuota > 0
      ? (agent.productivityTotal / agent.targetQuota) * 100
      : null;

  const csatOriginal = agent.csatAsli;
  let csatPct: number | null = null;
  if (csatOriginal !== null && !Number.isNaN(csatOriginal)) {
    csatPct = csatOriginal > 5 ? csatOriginal : (csatOriginal / 5) * 100;
  }

  return {
    qaOriginal,
    productivityOriginal,
    csatOriginal,
    qaPct: qaOriginal,
    productivityPct:
      productivityOriginal !== null ? Math.min(productivityOriginal, 100) : null,
    csatPct,
  };
}

export function calculateCompositeScore(input: CompositeScoreInput): CompositeScoreResult {
  const kpis = [
    {
      pct: input.qaPct,
      weight: COMPOSITE_WEIGHTS.qa,
    },
    {
      pct: input.productivityPct,
      weight: COMPOSITE_WEIGHTS.productivity,
    },
    {
      pct: input.csatPct,
      weight: COMPOSITE_WEIGHTS.csat,
    },
  ];

  const validKpis = kpis.filter((kpi) => kpi.pct !== null);
  if (validKpis.length === 0) {
    return { ...input, score: null };
  }

  const totalAvailableWeight = validKpis.reduce(
    (sum, kpi) => sum + kpi.weight,
    0,
  );
  const rawWeightedSum = validKpis.reduce(
    (sum, kpi) => sum + ((kpi.pct as number) / 100) * kpi.weight,
    0,
  );

  return {
    ...input,
    score:
      (rawWeightedSum / totalAvailableWeight) *
        (100 - COMPOSITE_WEIGHTS.fixed) +
      COMPOSITE_WEIGHTS.fixed,
  };
}

export function calculateAgentCompositeScore(agent: AgentKPI): CompositeScoreResult & {
  qaOriginal: number | null;
  productivityOriginal: number | null;
  csatOriginal: number | null;
} {
  const inputs = getAgentCompositeInputs(agent);
  return {
    ...inputs,
    score: calculateCompositeScore(inputs).score,
  };
}

import type { AgentKPI } from '../dataProcessor';
import type { ProcessorContext } from './context';

/**
 * Final computations — averages, gap, attendance score, CSAT SC %,
 * SLA averages, and roster filter. Extracted verbatim from processKPIs.
 */
export function finalizeAgents(ctx: ProcessorContext): AgentKPI[] {
  const { totalProdCsatAsliSum, totalWhuSum, sla1mSum, sla3mSum, periodDictionary } = ctx;

  let resultData = Object.values(ctx.agents).map((agent) => {
    agent.productivityTotal = agent.productivityBase;
    if (agent.manDays > 0) {
      agent.productivityAverage = agent.productivityTotal / agent.manDays;
    } else {
      agent.productivityAverage = 0;
    }

    agent.targetQuota = agent.manDays * 100;
    agent.gap = agent.productivityTotal - agent.targetQuota;

    if (agent.attendanceDuty > 0) {
      agent.attendanceScore = Math.min(
        100,
        (agent.attendancePresence / agent.attendanceDuty) * 100,
      );
    } else {
      agent.attendanceScore = 0;
    }

    agent.csatScFull = agent.csatScTotalValid > 0
      ? (agent.csatScGoodCount / agent.csatScTotalValid) * 100
      : null;

    agent.csatScFair = agent.csatScFairTotalValid > 0
      ? (agent.csatScFairGoodCount / agent.csatScFairTotalValid) * 100
      : null;

    if (
      totalProdCsatAsliSum[agent.csId] &&
      totalProdCsatAsliSum[agent.csId].count > 0
    ) {
      agent.csatAsli =
        (totalProdCsatAsliSum[agent.csId].sum /
        totalProdCsatAsliSum[agent.csId].count);
    }
    if (totalWhuSum[agent.csId] && totalWhuSum[agent.csId].count > 0) {
      agent.whu = totalWhuSum[agent.csId].sum / totalWhuSum[agent.csId].count;
    }
    if (sla1mSum[agent.csId] && sla1mSum[agent.csId].count > 0) {
      agent.sla1m = sla1mSum[agent.csId].sum / sla1mSum[agent.csId].count;
      agent.sla1mCount = sla1mSum[agent.csId].count;
    }
    if (sla3mSum[agent.csId] && sla3mSum[agent.csId].count > 0) {
      agent.sla3m = sla3mSum[agent.csId].sum / sla3mSum[agent.csId].count;
      agent.sla3mCount = sla3mSum[agent.csId].count;
    }

    return agent;
  });

  if (periodDictionary && Object.keys(periodDictionary).length > 0) {
    resultData = resultData.filter((a) => !!periodDictionary[a.csId]);
  }

  return resultData.sort((a, b) => a.csId.localeCompare(b.csId));
}

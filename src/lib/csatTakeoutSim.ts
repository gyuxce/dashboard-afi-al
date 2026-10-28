import {
  isCsatTakeoutCategory,
  isValidCsatScScore,
  normalizeCsatCategory,
  type AgentKPI,
} from './dataProcessor';

export interface TakeoutTotals {
  valid: number;
  good: number;
  pct: number | null;
}

export interface TakeoutCategoryRow {
  key: string;
  label: string;
  valid: number;
  good: number;
  csat: number | null;
  isOfficial: boolean;
  selected: boolean;
  /** pp change in official After Takeout if only this category were added; null for official rows. */
  aloneDelta: number | null;
}

export interface TakeoutAgentExtra {
  key: string;
  label: string;
  valid: number;
  good: number;
  csat: number | null;
}

export interface TakeoutAgentRow {
  csId: string;
  name: string;
  bpo: string;
  teamLeader: string;
  valid: number;
  before: number | null;
  official: number | null;
  simulated: number | null;
  delta: number | null;
  extras: TakeoutAgentExtra[];
}

export interface TakeoutSimulation {
  before: TakeoutTotals;
  official: TakeoutTotals;
  simulated: TakeoutTotals;
  extraCount: number;
  categories: TakeoutCategoryRow[];
  agents: TakeoutAgentRow[];
}

type Tally = { valid: number; good: number };

const pct = (good: number, valid: number): number | null => (valid > 0 ? (good / valid) * 100 : null);

const totals = (valid: number, good: number): TakeoutTotals => ({ valid, good, pct: pct(good, valid) });

const categoryLabel = (raw: string) => raw.trim() || 'Unknown Case';

/**
 * What-if for CSAT SC "After Takeout": the official takeout categories stay excluded,
 * `extraKeys` (normalized category names) are excluded on top. Pure — never mutates the agents.
 * Uses `csatHistory` valid-score entries, the same rows behind `csatScFullCount`.
 */
export function buildTakeoutSimulation(
  agents: readonly AgentKPI[],
  extraKeys: ReadonlySet<string>,
): TakeoutSimulation {
  const catTally = new Map<string, Tally & { label: string; official: boolean }>();
  const agentRows: Array<{
    agent: AgentKPI;
    total: Tally;
    cats: Map<string, Tally>;
  }> = [];

  for (const agent of agents) {
    const total: Tally = { valid: 0, good: 0 };
    const cats = new Map<string, Tally>();
    for (const h of agent.csatHistory ?? []) {
      if (!isValidCsatScScore(h.score)) continue;
      const key = normalizeCsatCategory(h.category);
      const good = h.score >= 4 ? 1 : 0;
      total.valid += 1;
      total.good += good;
      const a = cats.get(key) ?? { valid: 0, good: 0 };
      a.valid += 1;
      a.good += good;
      cats.set(key, a);
      const c = catTally.get(key) ?? {
        valid: 0,
        good: 0,
        label: categoryLabel(h.category),
        official: isCsatTakeoutCategory(h.category),
      };
      c.valid += 1;
      c.good += good;
      catTally.set(key, c);
    }
    if (total.valid > 0) agentRows.push({ agent, total, cats });
  }

  const isOfficial = (key: string) => catTally.get(key)?.official ?? false;
  const isExtra = (key: string) => !isOfficial(key) && extraKeys.has(key);

  let beforeValid = 0;
  let beforeGood = 0;
  let officialValid = 0;
  let officialGood = 0;
  let simValid = 0;
  let simGood = 0;
  let extraCount = 0;
  for (const [key, c] of catTally) {
    beforeValid += c.valid;
    beforeGood += c.good;
    if (c.official) continue;
    officialValid += c.valid;
    officialGood += c.good;
    if (isExtra(key)) {
      extraCount += 1;
      continue;
    }
    simValid += c.valid;
    simGood += c.good;
  }

  const officialPct = pct(officialGood, officialValid);

  const categories: TakeoutCategoryRow[] = [...catTally.entries()].map(([key, c]) => {
    const alone = c.official
      ? null
      : (() => {
          const rest = pct(officialGood - c.good, officialValid - c.valid);
          return rest !== null && officialPct !== null ? rest - officialPct : null;
        })();
    return {
      key,
      label: c.label,
      valid: c.valid,
      good: c.good,
      csat: pct(c.good, c.valid),
      isOfficial: c.official,
      selected: c.official || extraKeys.has(key),
      aloneDelta: alone,
    };
  });
  categories.sort((a, b) => {
    if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
    if (a.isOfficial) return b.valid - a.valid;
    return (b.aloneDelta ?? -Infinity) - (a.aloneDelta ?? -Infinity) || b.valid - a.valid;
  });

  const agentsOut: TakeoutAgentRow[] = agentRows.map(({ agent, total, cats }) => {
    let offValid = total.valid;
    let offGood = total.good;
    let simV = total.valid;
    let simG = total.good;
    const extras: TakeoutAgentExtra[] = [];
    for (const [key, t] of cats) {
      if (isOfficial(key)) {
        offValid -= t.valid;
        offGood -= t.good;
        simV -= t.valid;
        simG -= t.good;
      } else if (isExtra(key)) {
        simV -= t.valid;
        simG -= t.good;
        extras.push({
          key,
          label: catTally.get(key)?.label ?? key,
          valid: t.valid,
          good: t.good,
          csat: pct(t.good, t.valid),
        });
      }
    }
    extras.sort((a, b) => b.valid - a.valid);
    const official = pct(offGood, offValid);
    const simulated = pct(simG, simV);
    return {
      csId: agent.csId,
      name: agent.name,
      bpo: agent.bpo,
      teamLeader: agent.teamLeader,
      valid: total.valid,
      before: pct(total.good, total.valid),
      official,
      simulated,
      delta: official !== null && simulated !== null ? simulated - official : null,
      extras,
    };
  });
  agentsOut.sort(
    (a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity) || a.name.localeCompare(b.name),
  );

  return {
    before: totals(beforeValid, beforeGood),
    official: totals(officialValid, officialGood),
    simulated: totals(simValid, simGood),
    extraCount,
    categories,
    agents: agentsOut,
  };
}

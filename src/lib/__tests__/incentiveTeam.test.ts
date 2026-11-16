import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { TEAM_LEADER_GROSS_SALARY } from '../incentiveScoring';
import {
  agentListItems,
  buildAgentRows,
  buildTeamLeaderRows,
  isIncentivePeriodEmpty,
  summarizeAgentRows,
  summarizeTeamLeaderRows,
  teamLeaderListItems,
} from '../incentiveTeam';

const makeAgent = (over: Partial<AgentKPI>): AgentKPI =>
  ({
    csId: '3-1-1', name: 'Agent', bpo: 'NSI', teamLeader: 'Aufar',
    qaScoreSum: 0, qaScoreCount: 0, productivityTotal: 0, productivityBase: 0, manDays: 0,
    csat4Count: 0, csat5Count: 0, qaHistory: [],
    ...over,
  }) as unknown as AgentKPI;

// QA 98 -> 55 pts, CSAT 100% -> 25 pts, productivity 1000/1000 -> 20 pts: score 100, tier T1.
const perfect = (csId: string, tl = 'Aufar') =>
  makeAgent({ csId, name: csId, teamLeader: tl, qaScoreSum: 98, qaScoreCount: 1, csat5Count: 10, manDays: 10, productivityTotal: 1000, productivityBase: 1000 });
// QA 90 -> 38.5, CSAT 25, prod 120% (capped 20): 83.5, agent tier T3 (750k) + 200 chat over target = 80k bonus.
const solid = (csId: string, tl = 'Aufar') =>
  makeAgent({ csId, name: csId, teamLeader: tl, qaScoreSum: 90, qaScoreCount: 1, csat5Count: 10, manDays: 10, productivityTotal: 1200, productivityBase: 1200 });
const incomplete = (csId: string, tl = 'Aufar') => makeAgent({ csId, name: csId, teamLeader: tl });

describe('buildAgentRows', () => {
  it('orders by score, then agents without a score by name', () => {
    const rows = buildAgentRows([incomplete('zed'), solid('b'), incomplete('abe'), perfect('a')]);
    expect(rows.map((r) => r.csId)).toEqual(['a', 'b', 'abe', 'zed']);
  });

  it('computes tier and productivity bonus', () => {
    const [a, b] = buildAgentRows([perfect('a'), solid('b')]);
    expect(a.totalScore).toBeCloseTo(100, 6);
    expect(a.tier).toBe('T1');
    expect(a.totalIncentive).toBe(2000000);
    expect(b.tier).toBe('T3');
    expect(b.productivityBonus).toBe(80000);
    expect(b.totalIncentive).toBe(830000);
  });
});

describe('summarizeAgentRows', () => {
  it('counts statuses and sums incentive of eligible agents only', () => {
    const s = summarizeAgentRows(buildAgentRows([perfect('a'), solid('b'), incomplete('c')]));
    expect(s).toEqual({ count: 3, eligibleCount: 2, ineligibleCount: 0, incompleteCount: 1, totalIncentive: 2830000 });
  });
});

describe('buildTeamLeaderRows', () => {
  it('averages agent QA %, pools CSAT, and uses total chat over total duty x 100', () => {
    const [row] = buildTeamLeaderRows([perfect('a'), solid('b')]);
    expect(row.teamLeader).toBe('Aufar');
    expect(row.agentCount).toBe(2);
    expect(row.finalQaPct).toBe(94);
    expect(row.finalCsatPct).toBe(100);
    expect(row.finalProductivityPct).toBeCloseTo(110, 6);
    expect(row.averageQaPoints).toBeCloseTo(51.7, 6);
    expect(row.averageCsatPoints).toBeCloseTo(25, 6);
    expect(row.averageProductivityPoints).toBeCloseTo(20, 6);
    expect(row.finalScore).toBeCloseTo(96.7, 6);
    expect(row.tier).toBe('T1');
    expect(row.status).toBe('eligible');
  });

  it('pays the Rp500k best-TL bonus only to the highest score, and adds it to THP', () => {
    const rows = buildTeamLeaderRows([perfect('a'), solid('b'), solid('c', 'Agra')]);
    const aufar = rows.find((r) => r.teamLeader === 'Aufar')!;
    const agra = rows.find((r) => r.teamLeader === 'Agra')!;
    expect(rows.map((r) => r.teamLeader)).toEqual(['Aufar', 'Agra']);
    expect(aufar.bestLeaderBonus).toBe(500000);
    expect(aufar.totalIncentive).toBe(2500000);
    expect(aufar.grossThp).toBe(TEAM_LEADER_GROSS_SALARY + 2500000);
    expect(agra.bestLeaderBonus).toBe(0);
    expect(agra.totalIncentive).toBe(2000000);
  });

  it('marks a TL incomplete when any agent lacks data: no tier, no THP, cannot win the bonus', () => {
    const rows = buildTeamLeaderRows([perfect('a'), incomplete('b'), solid('c', 'Agra')]);
    const aufar = rows.find((r) => r.teamLeader === 'Aufar')!;
    expect(aufar.status).toBe('incomplete');
    expect(aufar.finalScore).toBeNull();
    expect(aufar.totalIncentive).toBeNull();
    expect(aufar.grossThp).toBeNull();
    expect(aufar.bestLeaderBonus).toBe(0);
    expect(aufar.incompleteCount).toBe(1);
    expect(rows.find((r) => r.teamLeader === 'Agra')!.bestLeaderBonus).toBe(500000);
  });

  it('groups a blank team leader under "-"', () => {
    expect(buildTeamLeaderRows([perfect('a', '  ')])[0].teamLeader).toBe('-');
  });
});

describe('summarizeTeamLeaderRows', () => {
  it('totals agents, ineligible TLs, incentive and gross THP', () => {
    const s = summarizeTeamLeaderRows(buildTeamLeaderRows([perfect('a'), solid('b'), solid('c', 'Agra')]));
    expect(s.count).toBe(2);
    expect(s.agentCount).toBe(3);
    expect(s.ineligibleCount).toBe(0);
    expect(s.totalIncentive).toBe(4500000);
    expect(s.totalGrossThp).toBe(2 * TEAM_LEADER_GROSS_SALARY + 4500000);
  });
});

describe('list items', () => {
  it('normalises agent and TL rows to one shape', () => {
    const agents = [perfect('a'), solid('b')];
    const [first] = agentListItems(buildAgentRows(agents));
    expect(first).toMatchObject({ id: 'a', meta: 'a', qcPts: 55, csatPts: 25, prodPts: 20, tier: 'T1', total: 2000000 });
    const [tl] = teamLeaderListItems(buildTeamLeaderRows(agents));
    expect(tl).toMatchObject({ id: 'Aufar', meta: '2 agent', tier: 'T1', status: 'eligible' });
  });

  it('shows missing points as 0 and missing percentages as null', () => {
    const [item] = agentListItems(buildAgentRows([incomplete('x')]));
    expect(item).toMatchObject({ qcPts: 0, csatPts: 0, prodPts: 0, qcPct: null, score: null, status: 'incomplete' });
  });
});

describe('isIncentivePeriodEmpty', () => {
  it('is true only when every agent is incomplete AND has no duty, QA or productivity rows', () => {
    const empty = [incomplete('a'), incomplete('b')];
    expect(isIncentivePeriodEmpty(buildAgentRows(empty), empty)).toBe(true);
    const partial = [incomplete('a'), makeAgent({ csId: 'b', manDays: 5 })];
    expect(isIncentivePeriodEmpty(buildAgentRows(partial), partial)).toBe(false);
    expect(isIncentivePeriodEmpty([], [])).toBe(false);
  });
});

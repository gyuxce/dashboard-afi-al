import { describe, it, expect } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import {
  bestLeaderBonusPerTeamLeader,
  buildIncentiveRow,
  getQcPoints,
  getTeamLeaderTier,
  getTier,
} from '../incentiveScoring';

const makeAgent = (over: Partial<AgentKPI>): AgentKPI =>
  ({
    csId: '3-1-1',
    name: 'Agent',
    bpo: 'TIN',
    teamLeader: 'Gagas',
    qaScoreSum: 0,
    qaScoreCount: 0,
    productivityTotal: 0,
    manDays: 0,
    csat4Count: 0,
    csat5Count: 0,
    qaHistory: [],
    ...over,
  }) as unknown as AgentKPI;

describe('getQcPoints (QC curve)', () => {
  it('maps each band, boundaries inclusive on the lower edge', () => {
    expect(getQcPoints(98)).toBe(55);
    expect(getQcPoints(97.99)).toBe(48.4);
    expect(getQcPoints(95)).toBe(48.4);
    expect(getQcPoints(94.99)).toBe(38.5);
    expect(getQcPoints(90)).toBe(38.5);
    expect(getQcPoints(85)).toBe(24.75);
    expect(getQcPoints(80)).toBe(11);
    expect(getQcPoints(79.99)).toBe(0);
    expect(getQcPoints(0)).toBe(0);
  });
});

describe('getTier (agent) vs getTeamLeaderTier', () => {
  it('agent tiers: 96 / 88 / 80', () => {
    expect(getTier(96)).toEqual({ label: 'T1', incentive: 2000000 });
    expect(getTier(95.99)).toEqual({ label: 'T2', incentive: 1250000 });
    expect(getTier(88)).toEqual({ label: 'T2', incentive: 1250000 });
    expect(getTier(87.99)).toEqual({ label: 'T3', incentive: 750000 });
    expect(getTier(80)).toEqual({ label: 'T3', incentive: 750000 });
    expect(getTier(79.99)).toEqual({ label: '-', incentive: 0 });
  });

  it('TL tiers use lower thresholds: 90 / 85 / 80', () => {
    expect(getTeamLeaderTier(90)).toEqual({ label: 'T1', incentive: 2000000 });
    expect(getTeamLeaderTier(89.99)).toEqual({ label: 'T2', incentive: 1250000 });
    expect(getTeamLeaderTier(85)).toEqual({ label: 'T2', incentive: 1250000 });
    expect(getTeamLeaderTier(84.99)).toEqual({ label: 'T3', incentive: 750000 });
    expect(getTeamLeaderTier(80)).toEqual({ label: 'T3', incentive: 750000 });
    expect(getTeamLeaderTier(79.99)).toEqual({ label: '-', incentive: 0 });
  });
});

describe('bestLeaderBonusPerTeamLeader (Rp500k pool split)', () => {
  it('splits evenly across every TL', () => {
    expect(bestLeaderBonusPerTeamLeader(5)).toBe(100000);
    expect(bestLeaderBonusPerTeamLeader(4)).toBe(125000);
    expect(bestLeaderBonusPerTeamLeader(1)).toBe(500000);
  });

  it('is 0 when there are no TLs', () => {
    expect(bestLeaderBonusPerTeamLeader(0)).toBe(0);
  });
});

describe('buildIncentiveRow', () => {
  it('marks incomplete when QA is missing (but still shows the other %s)', () => {
    const row = buildIncentiveRow(
      makeAgent({ qaScoreCount: 0, csat4Count: 5, manDays: 20, productivityTotal: 2000 }),
    );
    expect(row.status).toBe('incomplete');
    expect(row.qaPct).toBeNull();
    expect(row.qaPoints).toBeNull();
    expect(row.totalScore).toBeNull();
    expect(row.totalIncentive).toBeNull();
    // the visible-but-not-scored columns are still filled
    expect(row.csatPct).toBe(100);
    expect(row.productivityPct).toBe(100);
  });

  it('marks incomplete when the agent has zero CSAT ratings', () => {
    const row = buildIncentiveRow(
      makeAgent({ qaScoreCount: 1, qaScoreSum: 95, manDays: 20, productivityTotal: 2000 }),
    );
    expect(row.status).toBe('incomplete');
    expect(row.csatPct).toBeNull();
  });

  it('marks incomplete when man-days is 0 (no productivity target)', () => {
    const row = buildIncentiveRow(
      makeAgent({ qaScoreCount: 1, qaScoreSum: 95, csat4Count: 5, manDays: 0, productivityTotal: 2000 }),
    );
    expect(row.status).toBe('incomplete');
    expect(row.productivityTarget).toBeNull();
  });

  it('scores a perfect agent as T1 with no productivity bonus at exactly target', () => {
    const row = buildIncentiveRow(
      makeAgent({
        qaScoreCount: 1,
        qaScoreSum: 98, // qaPct 98 -> 55 pts
        csat4Count: 10, // 100% -> 25 pts
        manDays: 23,
        productivityTotal: 2300, // target 2300 -> 100% -> 20 pts
      }),
    );
    expect(row.qaPoints).toBe(55);
    expect(row.csatPoints).toBe(25);
    expect(row.productivityPoints).toBe(20);
    expect(row.totalScore).toBe(100);
    expect(row.tier).toBe('T1');
    expect(row.baseIncentive).toBe(2000000);
    expect(row.productivityBonus).toBe(0);
    expect(row.totalIncentive).toBe(2000000);
    expect(row.status).toBe('eligible');
  });

  it('adds Rp40.000 per 100 chats over target, score still capped at 20 prod pts', () => {
    const row = buildIncentiveRow(
      makeAgent({
        qaScoreCount: 1,
        qaScoreSum: 98,
        csat4Count: 10,
        manDays: 23,
        productivityTotal: 2500, // 200 over the 2300 target
      }),
    );
    expect(row.productivityPoints).toBe(20); // capped
    expect(row.totalScore).toBe(100);
    expect(row.productivityBonus).toBe(80000); // 200 / 100 * 40000
    expect(row.totalIncentive).toBe(2000000 + 80000);
  });

  it('gives an ineligible agent no productivity bonus even when far over target', () => {
    const row = buildIncentiveRow(
      makeAgent({
        qaScoreCount: 1,
        qaScoreSum: 80, // 11 pts
        csat4Count: 10, // 25 pts
        manDays: 23,
        productivityTotal: 900, // ~39% -> ~7.8 pts  => total ~43.8 -> '-'
      }),
    );
    expect(row.tier).toBe('-');
    expect(row.status).toBe('ineligible');
    expect(row.productivityBonus).toBe(0);
    expect(row.totalIncentive).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  aggregateTeamLeaderStats,
  getStandardPeriodDuty,
  type TeamMemberStats,
} from '../teamLeaderRows';

const member = (
  manDays: number,
  productivityTotal: number,
  extra: Partial<TeamMemberStats> = {},
): TeamMemberStats => ({
  manDays,
  productivityTotal,
  qaScoreSum: 0,
  qaScoreCount: 0,
  csatGood: 0,
  csatBad: 0,
  ...extra,
});

const productivityColumns = (chat: number, duty: number) => {
  const targetChat = duty * 100;
  const points = targetChat > 0 ? (chat / targetChat) * 20 : null;
  const finalPoints = points !== null ? Math.min(points, 20) : null;
  return { targetChat, points, finalPoints };
};

describe('getStandardPeriodDuty', () => {
  it('takes the full period duty, not the most common one', () => {
    // August 2026: plenty of agents log 21 days, but a full roster cycle is 23.
    expect(getStandardPeriodDuty([21, 21, 21, 23, 20, 18, 21])).toBe(23);
  });

  it('ignores agents with no attendance', () => {
    expect(getStandardPeriodDuty([0, 0, 22, 19])).toBe(22);
  });

  it('returns 0 when nobody has attendance', () => {
    expect(getStandardPeriodDuty([])).toBe(0);
    expect(getStandardPeriodDuty([0, 0])).toBe(0);
  });
});

describe('aggregateTeamLeaderStats', () => {
  it('gives every TL the same target call regardless of team attendance', () => {
    // Gagas: 5 agents averaging 2291 chats, some with partial attendance.
    const team = [
      member(23, 2300),
      member(19, 2280),
      member(23, 2291),
      member(23, 2305),
      member(21, 2279),
    ];
    const stats = aggregateTeamLeaderStats(team, 23);

    expect(stats?.agentCount).toBe(5);
    expect(stats?.duty).toBe(23);
    expect(stats?.avgChat).toBe(2291);

    const prod = productivityColumns(stats!.avgChat, stats!.duty);
    expect(prod.targetChat).toBe(2300);
    expect(prod.points).toBeCloseTo(19.92, 2);
    expect(prod.finalPoints).toBeCloseTo(19.92, 2);
  });

  it('caps final points at 20 while keeping raw points above target', () => {
    // Yuge: average 2333 chats against the shared 2300 target.
    const stats = aggregateTeamLeaderStats([member(23, 2333)], 23);
    const prod = productivityColumns(stats!.avgChat, stats!.duty);

    expect(prod.points).toBeCloseTo(20.29, 2);
    expect(prod.finalPoints).toBe(20);
    expect(Math.round(prod.points! - prod.finalPoints!)).toBe(0);
  });

  it('weights QA by the number of audited chats and sums CSAT counts', () => {
    const stats = aggregateTeamLeaderStats(
      [
        member(23, 2000, { qaScoreSum: 190, qaScoreCount: 2, csatGood: 8, csatBad: 2 }),
        member(23, 2000, { qaScoreSum: 100, qaScoreCount: 1, csatGood: 2, csatBad: 0 }),
      ],
      23,
    );

    expect(stats?.qaPct).toBeCloseTo(96.67, 2);
    expect(stats?.csatGood).toBe(10);
    expect(stats?.csatBad).toBe(2);
    expect(stats?.csatPct).toBeCloseTo(83.33, 2);
  });

  it('returns null KPIs when the team has no QA or CSAT data', () => {
    const stats = aggregateTeamLeaderStats([member(23, 2000)], 23);
    expect(stats?.qaPct).toBeNull();
    expect(stats?.csatPct).toBeNull();
  });

  it('returns null for an empty team', () => {
    expect(aggregateTeamLeaderStats([], 23)).toBeNull();
  });
});

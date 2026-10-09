import { describe, it, expect } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import {
  DAILY_LIVECHAT_TARGET,
  bestLeaderBonusPerTeamLeader,
  buildIncentiveRow,
  countRemainingWorkDays,
  estimateRemainingQaTickets,
  getQcPoints,
  getTeamLeaderTier,
  getTier,
  maxScoreForQa,
  planTierUp,
  scoreFromInputs,
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

// --- Regression fixture: the client's own incentive sheet (Oct 2026 sample) ---
// [name, duty, total chat, QC %, good ratings, bad ratings, final score, extra bonus Rp]
const CLIENT_ROWS: Array<[string, number, number, number, number, number, number, number]> = [
  ['Irvan', 17, 1996, 98.11, 148, 0, 100.0, 118400],
  ['Santi', 17, 1978, 99.04, 136, 0, 100.0, 111200],
  ['Rini', 17, 1972, 99.79, 156, 0, 100.0, 108800],
  ['Fadli', 20, 2243, 98.14, 201, 0, 100.0, 97200],
  ['Elfina', 17, 1857, 99.88, 142, 0, 100.0, 62800],
  ['Meilania', 16, 1737, 99.79, 162, 0, 100.0, 54800],
  ['Vania', 18, 2232, 97.32, 154, 0, 93.4, 172800],
  ['Adhnan', 19, 2165, 95.75, 149, 0, 93.4, 106000],
  ['Nayla', 17, 1961, 97.78, 147, 0, 93.4, 104400],
  ['Rizky', 17, 1948, 96.87, 144, 0, 93.4, 99200],
  ['Agus', 16, 1811, 96.37, 154, 0, 93.4, 84400],
  ['Yulia', 19, 2107, 95.78, 163, 0, 93.4, 82800],
  ['Ammar', 20, 2198, 97.72, 151, 0, 93.4, 79200],
  ['Sofyan', 18, 1985, 95.8, 179, 0, 93.4, 74000],
  ['Dian', 18, 1971, 97.96, 168, 1, 93.25, 68400],
  ['Solikhul', 19, 2036, 95.3, 104, 0, 93.4, 54400],
  ['Dita', 16, 1715, 96.03, 128, 0, 93.4, 46000],
];

describe('client incentive sheet regression (scoreFromInputs)', () => {
  it.each(CLIENT_ROWS)('%s matches the client score, tier and extra bonus', (_name, duty, chat, qa, good, bad, finalScore, extra) => {
    const result = scoreFromInputs({
      qaPct: qa,
      csatGood: good,
      csatBad: bad,
      chat,
      target: duty * DAILY_LIVECHAT_TARGET,
    });
    expect(result.totalScore).toBeCloseTo(finalScore, 1);
    expect(result.tier).toBe(finalScore >= 96 ? 'T1' : 'T2');
    expect(result.productivityBonus).toBeCloseTo(extra, 0);
    expect(result.totalIncentive).toBeCloseTo((finalScore >= 96 ? 2000000 : 1250000) + extra, 0);
  });
});

describe('maxScoreForQa', () => {
  it('caps the reachable score by the QC band', () => {
    expect(maxScoreForQa(98)).toBe(100);
    expect(maxScoreForQa(96)).toBeCloseTo(93.4, 5);
    expect(maxScoreForQa(92)).toBeCloseTo(83.5, 5);
    expect(maxScoreForQa(87)).toBeCloseTo(69.75, 5);
  });
});

describe('planTierUp', () => {
  const base = { expectedMoreQa: 0, remainingWorkDays: 0 };

  it('returns null while data is incomplete', () => {
    expect(planTierUp({ ...base, qaSum: 0, qaCount: 0, csatGood: 5, csatBad: 0, chat: 100, target: 100 })).toBeNull();
  });

  it("Dian: only QA can lift T2 → T1 (needs the 98% band)", () => {
    const plan = planTierUp({ ...base, qaSum: 97.96 * 10, qaCount: 10, csatGood: 168, csatBad: 1, chat: 1971, target: 1800 })!;
    expect(plan.tier).toBe('T2');
    expect(plan.nextTier?.label).toBe('T1');
    // at the 95–98 band the ceiling is 93.4, so T1 is only reachable via QA
    expect(plan.qaBottleneck).toBe(true);
    expect(plan.qa?.neededPct).toBe(98);
    expect(plan.csat).toBeNull();
    expect(plan.productivity).toBeNull();
  });

  it('flags a QA bottleneck when the ceiling is below the next tier', () => {
    const plan = planTierUp({ ...base, qaSum: 960, qaCount: 10, csatGood: 100, csatBad: 0, chat: 2000, target: 2000 })!;
    expect(plan.score).toBeCloseTo(93.4, 5);
    expect(plan.ceiling).toBeCloseTo(93.4, 5);
    expect(plan.qaBottleneck).toBe(true);
    expect(plan.qa?.neededPct).toBe(98);
  });

  it('computes the required average of the remaining QA tickets', () => {
    const plan = planTierUp({ ...base, expectedMoreQa: 10, qaSum: 960, qaCount: 10, csatGood: 100, csatBad: 0, chat: 2000, target: 2000 })!;
    // (98 * 20 - 960) / 10 = 100
    expect(plan.qa?.requiredFutureAvg).toBeCloseTo(100, 5);
  });

  it('CSAT alone: extra good ratings needed (no new bad ones)', () => {
    const plan = planTierUp({ ...base, qaSum: 980, qaCount: 10, csatGood: 80, csatBad: 20, chat: 2000, target: 2000 })!;
    expect(plan.nextTier?.label).toBe('T1');
    expect(plan.csat?.neededPct).toBeCloseTo(84, 5);
    expect(plan.csat?.additionalGood).toBe(25);
  });

  it('productivity alone: extra chats and per-day pace', () => {
    const plan = planTierUp({ qaSum: 980, qaCount: 10, csatGood: 90, csatBad: 10, chat: 1800, target: 2000, expectedMoreQa: 0, remainingWorkDays: 5 })!;
    expect(plan.score).toBeCloseTo(95.5, 5);
    expect(plan.productivity?.additionalChats).toBe(50);
    expect(plan.productivity?.perDay).toBe(10);
  });

  it('has no next tier at T1', () => {
    const plan = planTierUp({ ...base, qaSum: 990, qaCount: 10, csatGood: 100, csatBad: 0, chat: 2000, target: 2000 })!;
    expect(plan.nextTier).toBeNull();
    expect(plan.gap).toBeNull();
  });
});

describe('remaining work days helpers', () => {
  it('counts scheduled shifts from today to period end only', () => {
    const schedule = [
      { normDate: '2026-10-08', status: '08:00' },
      { normDate: '2026-10-09', status: '08:00' },
      { normDate: '2026-10-10', status: 'OFF' },
      { normDate: '2026-10-11', status: '22' },
      { normDate: '2026-10-12', status: 'C' },
      { normDate: '2026-11-01', status: '08:00' },
    ];
    expect(countRemainingWorkDays(schedule, '2026-10-09', '2026-10-31')).toBe(2);
  });

  it('estimates remaining QA tickets from the pace so far', () => {
    // 20 tickets over 10 elapsed days (20 duty - 10 remaining) → 2/day × 10
    expect(estimateRemainingQaTickets(20, 20, 10)).toBe(20);
    expect(estimateRemainingQaTickets(0, 20, 10)).toBe(0);
  });
});

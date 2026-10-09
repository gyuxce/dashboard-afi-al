import { describe, it, expect } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import {
  calculateCompositeScore,
  getAgentCompositeInputs,
} from '../kpiScoring';

const makeAgent = (over: Partial<AgentKPI>): AgentKPI =>
  ({
    csId: '3-1-1',
    qaScoreSum: 0,
    qaScoreCount: 0,
    targetQuota: 0,
    productivityTotal: 0,
    csatAsli: null,
    ...over,
  }) as unknown as AgentKPI;

describe('calculateCompositeScore', () => {
  it('all three KPIs at 100 -> score 100', () => {
    const { score } = calculateCompositeScore({ qaPct: 100, productivityPct: 100, csatPct: 100 });
    expect(score).toBe(100);
  });

  it('all three KPIs at 0 -> score is just the fixed 10', () => {
    const { score } = calculateCompositeScore({ qaPct: 0, productivityPct: 0, csatPct: 0 });
    expect(score).toBe(10);
  });

  it('no KPI available -> score null', () => {
    const { score } = calculateCompositeScore({ qaPct: null, productivityPct: null, csatPct: null });
    expect(score).toBeNull();
  });

  it('redistributes weight: one maxed KPI, the rest missing -> still 100', () => {
    const { score } = calculateCompositeScore({ qaPct: 100, productivityPct: null, csatPct: null });
    expect(score).toBe(100);
  });

  it('QA 90 only (prod/csat missing) -> 91', () => {
    // (0.9 * 50 / 50) * 90 + 10
    const { score } = calculateCompositeScore({ qaPct: 90, productivityPct: null, csatPct: null });
    expect(score).toBeCloseTo(91, 6);
  });

  it('QA 88, prod 100, csat 100 -> 94 (all weights available)', () => {
    // raw = 0.88*50 + 20 + 20 = 84 ; (84 / 90) * 90 + 10
    const { score } = calculateCompositeScore({ qaPct: 88, productivityPct: 100, csatPct: 100 });
    expect(score).toBeCloseTo(94, 6);
  });

  it('missing productivity rescales against the remaining 70 weight', () => {
    // valid = qa(50) + csat(20) ; raw = 50 + 0.8*20 = 66 ; (66 / 70) * 90 + 10
    const { score } = calculateCompositeScore({ qaPct: 100, productivityPct: null, csatPct: 80 });
    expect(score).toBeCloseTo(94.857142, 4);
  });
});

describe('getAgentCompositeInputs', () => {
  it('scales a 0-5 CSAT to a percentage, leaves an already-% CSAT alone', () => {
    expect(getAgentCompositeInputs(makeAgent({ csatAsli: 4 })).csatPct).toBe(80);
    expect(getAgentCompositeInputs(makeAgent({ csatAsli: 92 })).csatPct).toBe(92);
    expect(getAgentCompositeInputs(makeAgent({ csatAsli: null })).csatPct).toBeNull();
  });

  it('caps productivityPct at 100 but keeps the raw original', () => {
    const inputs = getAgentCompositeInputs(
      makeAgent({ targetQuota: 2000, productivityTotal: 3000 }),
    );
    expect(inputs.productivityOriginal).toBe(150);
    expect(inputs.productivityPct).toBe(100);
  });

  it('productivityPct is null when there is no target quota', () => {
    const inputs = getAgentCompositeInputs(makeAgent({ targetQuota: 0, productivityTotal: 500 }));
    expect(inputs.productivityPct).toBeNull();
  });

  it('qaPct is the raw QA average, uncapped', () => {
    const inputs = getAgentCompositeInputs(makeAgent({ qaScoreSum: 202, qaScoreCount: 2 }));
    expect(inputs.qaPct).toBe(101);
  });
});

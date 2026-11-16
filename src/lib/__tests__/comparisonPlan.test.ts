import { describe, expect, it } from 'vitest';
import { planComparison, planTabOf, type ComparisonPlanInput } from '../comparisonPlan';

const base: ComparisonPlanInput = {
  tab: 'summary',
  isComparisonEnabled: false,
  comparisonMode: 'wow',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  productivityLastDate: '2026-11-16',
  todayIso: '2026-11-17',
};

describe('planTabOf', () => {
  it('groups tabs by what they need', () => {
    expect(planTabOf('summary')).toBe('summary');
    expect(planTabOf('productivity')).toBe('compare');
    expect(planTabOf('csat_official')).toBe('compare');
    expect(planTabOf('csat')).toBe('compare');
    expect(planTabOf('weekly_export')).toBe('export');
    expect(planTabOf('qa')).toBe('other');
    expect(planTabOf('incentive')).toBe('other');
  });
});

describe('planComparison', () => {
  it('Summary with the toggle off still plans last month, cut to the days that have data', () => {
    const p = planComparison(base);
    expect(p.passivePrevMonth).toBe(true);
    expect(p.needsComparisonData).toBe(false);
    expect(p.prev1).toEqual({ start: '2026-10-01', end: '2026-10-16' });
    expect(p.prev2).toBeNull();
    expect(p.prev3).toBeNull();
    expect(p.weekRanges).toEqual([]);
  });

  it('MoM chains three previous months, all cut to the same days', () => {
    const p = planComparison({ ...base, isComparisonEnabled: true, comparisonMode: 'mom' });
    expect(p.passivePrevMonth).toBe(false);
    expect(p.prev1).toEqual({ start: '2026-10-01', end: '2026-10-16' });
    expect(p.prev2).toEqual({ start: '2026-09-01', end: '2026-09-16' });
    expect(p.prev3).toEqual({ start: '2026-08-01', end: '2026-08-16' });
  });

  it('WoW on Productivity compares with the previous period of the same length and plans rolling weeks', () => {
    const p = planComparison({ ...base, tab: 'compare', isComparisonEnabled: true, comparisonMode: 'wow' });
    expect(p.prev1).toEqual({ start: '2026-10-02', end: '2026-10-31' });
    expect(p.prev2).toEqual({ start: '2026-09-02', end: '2026-10-01' });
    expect(p.weekRanges.length).toBeGreaterThanOrEqual(2);
    expect(p.weekRanges.length).toBeLessThanOrEqual(6);
    expect(p.weekRanges.map((w) => w.start)).toContain('2026-10-26'); // W5 Okt fills the early-month comparison
  });

  it('tabs that cannot compare plan nothing, even if the toggle is on', () => {
    const p = planComparison({ ...base, tab: 'other', isComparisonEnabled: true });
    expect(p).toMatchObject({ comparisonTabs: false, needsComparisonData: false, passivePrevMonth: false, prev1: null, prev2: null, prev3: null });
    expect(p.weekRanges).toEqual([]);
  });

  it('the slide export always plans weeks and four months, but no previous periods', () => {
    const p = planComparison({ ...base, tab: 'export' });
    expect(p.prev1).toBeNull();
    expect(p.weekRanges.length).toBeGreaterThanOrEqual(2);
    expect(p.monthRanges.map((m) => m.label)).toEqual(['Agustus', 'September', 'Oktober', 'November']);
  });

  it('plans nothing without dates', () => {
    const p = planComparison({ ...base, startDate: '', endDate: '' });
    expect(p.prev1).toBeNull();
    expect(p.weekRanges).toEqual([]);
  });

  it('returns the same empty arrays every time, so downstream hooks see stable references', () => {
    expect(planComparison({ ...base, tab: 'other' }).weekRanges).toBe(planComparison({ ...base, tab: 'other' }).weekRanges);
    expect(planComparison({ ...base, tab: 'other' }).monthRanges).toBe(planComparison({ ...base, tab: 'summary' }).monthRanges);
  });
});

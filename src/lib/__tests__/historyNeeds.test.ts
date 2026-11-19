import { describe, expect, it } from 'vitest';
import { historyDepthFor, historyNeeds } from '../historyNeeds';
import { planComparison } from '../comparisonPlan';
import { sheetMonthOrdinal } from '../sheetsApi';

describe('historyDepthFor', () => {
  it('needs nothing for a date inside the selected month', () => {
    expect(historyDepthFor('OCT_2026', '2026-10-01')).toBe(0);
    expect(historyDepthFor('OCT_2026', '2026-10-20')).toBe(0);
    expect(historyDepthFor('OCT_2026', null)).toBe(0);
  });

  it('counts the months back to the month that holds the date', () => {
    expect(historyDepthFor('OCT_2026', '2026-09-30')).toBe(1);
    expect(historyDepthFor('OCT_2026', '2026-09-01')).toBe(1);
    expect(historyDepthFor('OCT_2026', '2026-08-15')).toBe(2);
    expect(historyDepthFor('OCT_2026', '2026-07-01')).toBe(3);
  });

  it('caps at three months and crosses the year boundary', () => {
    expect(historyDepthFor('OCT_2026', '2026-01-01')).toBe(3);
    expect(historyDepthFor('JAN_2027', '2026-12-31')).toBe(1);
    expect(historyDepthFor('FEB_2027', '2026-12-01')).toBe(2);
  });

  it('reaches the legacy (May) tab', () => {
    expect(historyDepthFor('JUL_2026', '2026-06-10')).toBe(1);
    expect(historyDepthFor('JUL_2026', '2026-05-20')).toBe(2);
  });
});

const baseInput = { selectedMonth: 'OCT_2026', startDate: '2026-10-01', endDate: '2026-10-31', productivityLastDate: '2026-10-31', todayIso: '2026-11-19' };
const needs = (over: { tab: 'summary' | 'compare' | 'export' | 'other'; isComparisonEnabled?: boolean; comparisonMode?: 'wow' | 'mom'; isIncentiveTab?: boolean }) => {
  const plan = planComparison({ ...baseInput, tab: over.tab, isComparisonEnabled: over.isComparisonEnabled ?? false, comparisonMode: over.comparisonMode ?? 'wow' });
  return historyNeeds({ selectedMonth: baseInput.selectedMonth, tab: over.tab, isIncentiveTab: over.isIncentiveTab ?? false, startDate: baseInput.startDate, endDate: baseInput.endDate, plan });
};

describe('historyNeeds', () => {
  it('Summary needs last month for its delta chips, nothing else', () => {
    expect(needs({ tab: 'summary' })).toEqual({ depth: 1, scheduleDepth: 2, nextMonth: false });
  });

  it('a tab without comparison needs no full history, only the schedule of the last day before the month', () => {
    expect(needs({ tab: 'other' })).toEqual({ depth: 0, scheduleDepth: 1, nextMonth: false });
    expect(needs({ tab: 'compare' })).toEqual({ depth: 0, scheduleDepth: 1, nextMonth: false });
  });

  it('MoM comparison needs three months back, and never asks for a fourth (three is the most that is ever loaded)', () => {
    expect(needs({ tab: 'compare', isComparisonEnabled: true, comparisonMode: 'mom' })).toMatchObject({ depth: 3, scheduleDepth: 3 });
  });

  it('a start date in the middle of a month needs no extra schedule month', () => {
    const plan = planComparison({ ...baseInput, tab: 'other', isComparisonEnabled: false, comparisonMode: 'wow', startDate: '2026-10-10' });
    expect(historyNeeds({ selectedMonth: 'OCT_2026', tab: 'other', isIncentiveTab: false, startDate: '2026-10-10', endDate: '2026-10-31', plan })).toMatchObject({ depth: 0, scheduleDepth: 0 });
  });

  it('WoW comparison over a whole month also plans three month-long periods back, so it loads three months', () => {
    const n = needs({ tab: 'compare', isComparisonEnabled: true, comparisonMode: 'wow' });
    expect(n).toEqual({ depth: 3, scheduleDepth: 3, nextMonth: false });
  });

  it('the slide export needs four months and the next month', () => {
    expect(needs({ tab: 'export' })).toEqual({ depth: 3, scheduleDepth: 3, nextMonth: true });
  });

  it('Simulasi Insentif needs the next month for late-checked QA cases', () => {
    expect(needs({ tab: 'other', isIncentiveTab: true })).toEqual({ depth: 0, scheduleDepth: 1, nextMonth: true });
  });

  it('a date range that runs past the month asks for the next month', () => {
    const plan = planComparison({ ...baseInput, tab: 'other', isComparisonEnabled: false, comparisonMode: 'wow', endDate: '2026-11-05' });
    expect(historyNeeds({ selectedMonth: 'OCT_2026', tab: 'other', isIncentiveTab: false, startDate: '2026-10-01', endDate: '2026-11-05', plan }).nextMonth).toBe(true);
  });

  it('a start date before the month asks for the months it touches', () => {
    const plan = planComparison({ ...baseInput, tab: 'other', isComparisonEnabled: false, comparisonMode: 'wow', startDate: '2026-08-20' });
    expect(historyNeeds({ selectedMonth: 'OCT_2026', tab: 'other', isIncentiveTab: false, startDate: '2026-08-20', endDate: '2026-10-31', plan }).depth).toBe(2);
  });
});

describe('sheetMonthOrdinal', () => {
  it('orders month keys on the calendar, legacy being May 2026', () => {
    const keys = ['OCT_2026', 'legacy', 'JAN_2027', 'JUN_2026', 'DEC_2026'];
    expect([...keys].sort((a, b) => sheetMonthOrdinal(a) - sheetMonthOrdinal(b))).toEqual(['legacy', 'JUN_2026', 'OCT_2026', 'DEC_2026', 'JAN_2027']);
    expect(sheetMonthOrdinal('JUN_2026') - sheetMonthOrdinal('legacy')).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { getPreviousMonthPeriod, getPreviousMonthPeriodToDate } from '../dataProcessor';

describe('getPreviousMonthPeriodToDate', () => {
  it('cuts a running month to the last day with data, so 1–15 Nov is compared with 1–15 Okt', () => {
    expect(getPreviousMonthPeriodToDate('2026-11-01', '2026-11-30', '2026-11-15')).toEqual({ start: '2026-10-01', end: '2026-10-15' });
  });

  it('leaves a closed month alone (data reaches the last day)', () => {
    expect(getPreviousMonthPeriodToDate('2026-10-01', '2026-10-31', '2026-10-31')).toEqual(getPreviousMonthPeriod('2026-10-01', '2026-10-31'));
  });

  it('does nothing when the last data date is unknown or outside the range', () => {
    const full = getPreviousMonthPeriod('2026-11-01', '2026-11-30');
    expect(getPreviousMonthPeriodToDate('2026-11-01', '2026-11-30', null)).toEqual(full);
    expect(getPreviousMonthPeriodToDate('2026-11-01', '2026-11-30', '2026-10-20')).toEqual(full); // data older than the range
    expect(getPreviousMonthPeriodToDate('2026-11-01', '2026-11-30', '2026-12-05')).toEqual(full); // data past the range
  });

  it('clamps a 31st to the shorter previous month', () => {
    expect(getPreviousMonthPeriodToDate('2026-03-01', '2026-03-31', '2026-03-30')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

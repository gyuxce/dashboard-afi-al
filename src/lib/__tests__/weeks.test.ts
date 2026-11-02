import { describe, expect, it } from 'vitest';
import { getCalendarWeeks, getMonthRanges } from '../weeks';

describe('getCalendarWeeks', () => {
  it('gives October 2026 five whole weeks, the last one reaching 1 Nov', () => {
    expect(getCalendarWeeks('2026-10-01', '2026-10-31')).toEqual([
      { index: 1, start: '2026-09-28', end: '2026-10-04', daysInRange: 4 },
      { index: 2, start: '2026-10-05', end: '2026-10-11', daysInRange: 7 },
      { index: 3, start: '2026-10-12', end: '2026-10-18', daysInRange: 7 },
      { index: 4, start: '2026-10-19', end: '2026-10-25', daysInRange: 7 },
      { index: 5, start: '2026-10-26', end: '2026-11-01', daysInRange: 6 },
    ]);
  });

  it('starts November at 2 Nov: the week of 26 Oct–1 Nov belongs to October', () => {
    const nov = getCalendarWeeks('2026-11-01', '2026-11-30');
    expect(nov.map((w) => [w.start, w.end])).toEqual([
      ['2026-11-02', '2026-11-08'],
      ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22'],
      ['2026-11-23', '2026-11-29'],
    ]);
  });

  it('counts a straddling week for the month that has most of its days (August 2026)', () => {
    const aug = getCalendarWeeks('2026-08-01', '2026-08-31');
    expect(aug.map((w) => w.start)).toEqual(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24']);
  });

  it('gives a full Monday–Sunday week as a single week', () => {
    expect(getCalendarWeeks('2026-10-05', '2026-10-11')).toEqual([
      { index: 1, start: '2026-10-05', end: '2026-10-11', daysInRange: 7 },
    ]);
  });

  it('returns nothing for empty or inverted ranges', () => {
    expect(getCalendarWeeks('', '')).toEqual([]);
    expect(getCalendarWeeks('2026-10-10', '2026-10-01')).toEqual([]);
  });
});

describe('getMonthRanges', () => {
  it('lists the months ending with the given date, oldest first', () => {
    expect(getMonthRanges('2026-10-31', 3)).toEqual([
      { label: 'Agustus', start: '2026-08-01', end: '2026-08-31' },
      { label: 'September', start: '2026-09-01', end: '2026-09-30' },
      { label: 'Oktober', start: '2026-10-01', end: '2026-10-31' },
    ]);
  });
});

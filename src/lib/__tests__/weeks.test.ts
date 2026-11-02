import { describe, expect, it } from 'vitest';
import { getCalendarWeeks } from '../weeks';

describe('getCalendarWeeks', () => {
  it('splits October 2026 into Monday–Sunday weeks with partial edges', () => {
    expect(getCalendarWeeks('2026-10-01', '2026-10-31')).toEqual([
      { index: 1, start: '2026-10-01', end: '2026-10-04', days: 4 },
      { index: 2, start: '2026-10-05', end: '2026-10-11', days: 7 },
      { index: 3, start: '2026-10-12', end: '2026-10-18', days: 7 },
      { index: 4, start: '2026-10-19', end: '2026-10-25', days: 7 },
      { index: 5, start: '2026-10-26', end: '2026-10-31', days: 6 },
    ]);
  });

  it('gives a full Monday–Sunday week as a single week', () => {
    expect(getCalendarWeeks('2026-10-05', '2026-10-11')).toEqual([
      { index: 1, start: '2026-10-05', end: '2026-10-11', days: 7 },
    ]);
  });

  it('handles a 6-week month and month boundaries', () => {
    const weeks = getCalendarWeeks('2026-08-01', '2026-08-31');
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toMatchObject({ start: '2026-08-01', end: '2026-08-02', days: 2 });
    expect(weeks[5]).toMatchObject({ start: '2026-08-31', end: '2026-08-31', days: 1 });
  });

  it('returns nothing for empty or inverted ranges', () => {
    expect(getCalendarWeeks('', '')).toEqual([]);
    expect(getCalendarWeeks('2026-10-10', '2026-10-01')).toEqual([]);
  });
});

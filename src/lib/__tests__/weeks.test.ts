import { describe, expect, it } from 'vitest';
import { getCalendarWeeks } from '../weeks';

describe('getCalendarWeeks', () => {
  it('gives whole Monday–Sunday weeks that cross month boundaries', () => {
    expect(getCalendarWeeks('2026-10-01', '2026-10-31')).toEqual([
      { index: 1, start: '2026-09-28', end: '2026-10-04', daysInRange: 4 },
      { index: 2, start: '2026-10-05', end: '2026-10-11', daysInRange: 7 },
      { index: 3, start: '2026-10-12', end: '2026-10-18', daysInRange: 7 },
      { index: 4, start: '2026-10-19', end: '2026-10-25', daysInRange: 7 },
      { index: 5, start: '2026-10-26', end: '2026-11-01', daysInRange: 6 },
    ]);
  });

  it('gives a full Monday–Sunday week as a single week', () => {
    expect(getCalendarWeeks('2026-10-05', '2026-10-11')).toEqual([
      { index: 1, start: '2026-10-05', end: '2026-10-11', daysInRange: 7 },
    ]);
  });

  it('handles a 6-week month and a month starting on Sunday', () => {
    const aug = getCalendarWeeks('2026-08-01', '2026-08-31');
    expect(aug).toHaveLength(6);
    expect(aug[0]).toMatchObject({ start: '2026-07-27', end: '2026-08-02', daysInRange: 2 });
    expect(aug[5]).toMatchObject({ start: '2026-08-31', end: '2026-09-06', daysInRange: 1 });

    const nov = getCalendarWeeks('2026-11-01', '2026-11-30');
    expect(nov[0]).toMatchObject({ start: '2026-10-26', end: '2026-11-01', daysInRange: 1 });
  });

  it('returns nothing for empty or inverted ranges', () => {
    expect(getCalendarWeeks('', '')).toEqual([]);
    expect(getCalendarWeeks('2026-10-10', '2026-10-01')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { buildWeekGrid, formatDateFull, formatDayMonth, summarizeDays } from '../dayCalendar';

describe('buildWeekGrid', () => {
  it('places days Monday-first and pads the partial weeks with null', () => {
    // 2026-10-01 is a Thursday, 2026-10-05 a Monday.
    const grid = buildWeekGrid([
      { date: '2026-10-01', value: 120 },
      { date: '2026-10-04', value: null },
      { date: '2026-10-05', value: 90, marker: '22' },
    ]);
    expect(grid).toHaveLength(2);
    expect(grid![0].map((c) => c?.date ?? null)).toEqual([null, null, null, '2026-10-01', null, null, '2026-10-04']);
    expect(grid![1][0]).toMatchObject({ date: '2026-10-05', value: 90, marker: '22' });
    expect(grid![1].slice(1).every((c) => c === null)).toBe(true);
  });

  it('returns null when a date is not ISO, and [] for no days', () => {
    expect(buildWeekGrid([{ date: '13/8/2026', value: 1 }])).toBeNull();
    expect(buildWeekGrid([])).toEqual([]);
  });
});

describe('summarizeDays', () => {
  it('counts days under target and finds the extremes, ignoring empty days', () => {
    const s = summarizeDays([
      { date: '2026-10-01', value: 120 },
      { date: '2026-10-02', value: 42 },
      { date: '2026-10-03', value: null },
      { date: '2026-10-04', value: 99 },
      { date: '2026-10-05', value: 202 },
    ], 100);
    expect(s).toEqual({
      daysWithData: 4,
      belowTarget: 2,
      lowest: { date: '2026-10-02', value: 42 },
      highest: { date: '2026-10-05', value: 202 },
    });
  });

  it('treats exactly the target as met, and handles no data', () => {
    expect(summarizeDays([{ date: '2026-10-01', value: 100 }], 100).belowTarget).toBe(0);
    expect(summarizeDays([{ date: '2026-10-01', value: null }], 100)).toEqual({ daysWithData: 0, belowTarget: 0, lowest: null, highest: null });
  });
});

describe('formatDayMonth', () => {
  it('uses Indonesian month abbreviations', () => {
    expect(formatDayMonth('2026-10-14')).toBe('14 Okt');
    expect(formatDayMonth('2026-08-01')).toBe('1 Agu');
    expect(formatDayMonth('weird')).toBe('weird');
  });
});

describe('summarizeDays off days', () => {
  it('ignores scheduled off days even when they carry a value', () => {
    const s = summarizeDays([{ date: '2026-10-01', value: 50, off: true }, { date: '2026-10-02', value: 120 }], 100);
    expect(s).toMatchObject({ daysWithData: 1, belowTarget: 0, lowest: { value: 120 } });
  });
});

describe('formatDateFull', () => {
  it('adds the year to the Indonesian day-month form', () => {
    expect(formatDateFull('2026-10-01')).toBe('1 Okt 2026');
    expect(formatDateFull('29-Sep-2026')).toBe('29-Sep-2026');
  });
});

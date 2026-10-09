import { describe, it, expect } from 'vitest';
import { normalizeDateStr } from '../dates';

describe('normalizeDateStr', () => {
  it('returns null for empty input', () => {
    expect(normalizeDateStr('')).toBeNull();
    expect(normalizeDateStr('   ')).toBeNull();
  });

  it('parses DD-MMM-YYYY with Indonesian month abbreviations', () => {
    expect(normalizeDateStr('13-Agu-2026')).toBe('2026-08-13');
    expect(normalizeDateStr('1-Jan-2026')).toBe('2026-01-01');
    expect(normalizeDateStr('31-Des-2026')).toBe('2026-12-31');
    expect(normalizeDateStr('15-Okt-2026')).toBe('2026-10-15');
    expect(normalizeDateStr('15-Mei-2026')).toBe('2026-05-15');
  });

  it('parses DD-MMM-YYYY with English month abbreviations', () => {
    expect(normalizeDateStr('13-Aug-2026')).toBe('2026-08-13');
    expect(normalizeDateStr('1-Jan-2026')).toBe('2026-01-01');
    expect(normalizeDateStr('31-Dec-2026')).toBe('2026-12-31');
  });

  it('parses full Indonesian month names', () => {
    expect(normalizeDateStr('13-Agustus-2026')).toBe('2026-08-13');
    expect(normalizeDateStr('1-Januari-2026')).toBe('2026-01-01');
    expect(normalizeDateStr('31-Desember-2026')).toBe('2026-12-31');
  });

  it('parses DD MMM YYYY with space separator', () => {
    expect(normalizeDateStr('13 Agu 2026')).toBe('2026-08-13');
    expect(normalizeDateStr('1 Jan 2026')).toBe('2026-01-01');
  });

  it('defaults to current year when year is missing', () => {
    const year = new Date().getFullYear();
    expect(normalizeDateStr('13-Agu')).toBe(`${year}-08-13`);
    expect(normalizeDateStr('1-Jan')).toBe(`${year}-01-01`);
  });

  it('parses DD/MM/YYYY as DD/MM (day first when ambiguous)', () => {
    expect(normalizeDateStr('13/8/2026')).toBe('2026-08-13');
    expect(normalizeDateStr('1/7/2026')).toBe('2026-07-01');
    expect(normalizeDateStr('31/12/2026')).toBe('2026-12-31');
  });

  it('resolves ambiguous DD/MM by treating first as day when both ≤ 12', () => {
    // 5/6/2026 — both ≤ 12, treated as DD/MM → 5 June
    expect(normalizeDateStr('5/6/2026')).toBe('2026-06-05');
    // 7/8/2026 — both ≤ 12, treated as DD/MM → 7 August
    expect(normalizeDateStr('7/8/2026')).toBe('2026-08-07');
  });

  it('detects MM/DD when day > 12', () => {
    // 13/8 — 13 > 12, so first must be day
    expect(normalizeDateStr('13/8/2026')).toBe('2026-08-13');
    // 8/13 — 13 > 12, so second must be day → 8 August (MM/DD)
    expect(normalizeDateStr('8/13/2026')).toBe('2026-08-13');
  });

  it('parses ISO YYYY-MM-DD', () => {
    expect(normalizeDateStr('2026-08-13')).toBe('2026-08-13');
    expect(normalizeDateStr('2026-01-01')).toBe('2026-01-01');
  });

  it('strips time from numeric date strings (DD/MM/YYYY)', () => {
    // Numeric dates: split(" ")[0] strips the time, then parsed as DD/MM/YYYY
    expect(normalizeDateStr('13/8/2026 14:30')).toBe('2026-08-13');
  });

  it('strips trailing clock time from month-name dates', () => {
    expect(normalizeDateStr('13-Agu-2026 14:30')).toBe('2026-08-13');
    expect(normalizeDateStr('13 Agu 2026 09:00:00')).toBe('2026-08-13');
    expect(normalizeDateStr('1-Jan-2026 7:05 AM')).toBe('2026-01-01');
  });

  it('returns null for unparseable strings', () => {
    expect(normalizeDateStr('not a date')).toBeNull();
    expect(normalizeDateStr('abc')).toBeNull();
  });

  it('caches results (same input returns same reference)', () => {
    const a = normalizeDateStr('13-Agu-2026');
    const b = normalizeDateStr('13-Agu-2026');
    expect(a).toBe(b);
  });

  it('handles leading/trailing whitespace', () => {
    expect(normalizeDateStr('  13-Agu-2026  ')).toBe('2026-08-13');
  });
});

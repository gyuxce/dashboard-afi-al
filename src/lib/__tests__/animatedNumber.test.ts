import { describe, expect, it } from 'vitest';
import { formatAnimatedNumber, parseAnimatedNumber } from '../animatedNumber';
import { isLowEndDevice, parsePerfPreference, resolvePerfLite } from '../perfMode';

describe('parseAnimatedNumber', () => {
  it('reads Indonesian numbers with their prefix, decimals and suffix', () => {
    expect(parseAnimatedNumber('63.121')).toEqual({ prefix: '', target: 63121, decimals: 0, suffix: '' });
    expect(parseAnimatedNumber('95,83%')).toEqual({ prefix: '', target: 95.83, decimals: 2, suffix: '%' });
    expect(parseAnimatedNumber('+12.998')).toEqual({ prefix: '+', target: 12998, decimals: 0, suffix: '' });
    expect(parseAnimatedNumber('Rp 34.285.600')).toEqual({ prefix: 'Rp ', target: 34285600, decimals: 0, suffix: '' });
    expect(parseAnimatedNumber('−0,05')).toEqual({ prefix: '−', target: 0.05, decimals: 2, suffix: '' });
    expect(parseAnimatedNumber('123')).toMatchObject({ target: 123, decimals: 0 });
  });

  it('leaves anything that is not one plain number alone', () => {
    expect(parseAnimatedNumber('3,62 / 5')).toBeNull();
    expect(parseAnimatedNumber('1 Okt 2026')).toBeNull();
    expect(parseAnimatedNumber('-')).toBeNull();
    expect(parseAnimatedNumber('')).toBeNull();
    expect(parseAnimatedNumber('12,3,4')).toBeNull();
  });
});

describe('formatAnimatedNumber', () => {
  it('formats like formatNum: grouping dot, decimal comma, same prefix and suffix', () => {
    const p = parseAnimatedNumber('95,83%')!;
    expect(formatAnimatedNumber(p, 47.915)).toBe('47,92%');
    expect(formatAnimatedNumber(p, p.target)).toBe('95,83%');
    const q = parseAnimatedNumber('Rp 34.285.600')!;
    expect(formatAnimatedNumber(q, 1234567)).toBe('Rp 1.234.567');
    expect(formatAnimatedNumber(parseAnimatedNumber('63.121')!, 63121)).toBe('63.121');
  });
});

describe('perf mode', () => {
  it('treats few cores or little memory as a low-end device', () => {
    expect(isLowEndDevice({ hardwareConcurrency: 4 })).toBe(true);
    expect(isLowEndDevice({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe(true);
    expect(isLowEndDevice({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(isLowEndDevice({})).toBe(false);
  });

  it('lets the user override the automatic choice', () => {
    expect(resolvePerfLite('auto', true)).toBe(true);
    expect(resolvePerfLite('auto', false)).toBe(false);
    expect(resolvePerfLite('lite', false)).toBe(true);
    expect(resolvePerfLite('full', true)).toBe(false);
    expect(parsePerfPreference('lite')).toBe('lite');
    expect(parsePerfPreference('nonsense')).toBe('auto');
  });
});

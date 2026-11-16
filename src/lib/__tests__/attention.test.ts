import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { buildAttentionItems, lowestCsatScAgent } from '../attention';

describe('buildAttentionItems', () => {
  it('lists only KPIs that miss or nearly miss their target, worst first', () => {
    const items = buildAttentionItems({ csatScFair: 77.47, csatScFull: 67.26, csat: 3.61, qa: 96.14, attendance: 98.78, sla1m: 98.61, sla3m: 99.81, whu: 99.66, avgProductivity: 118 });
    expect(items.map((i) => [i.key, i.level])).toEqual([['csatFair', 'miss'], ['csatFull', 'miss'], ['csatOfficial', 'watch']]);
    expect(items[0]).toMatchObject({ title: 'CSAT SC After Takeout', value: '77,5%', target: '92%', gap: '−14,5' });
    expect(items[2]).toMatchObject({ value: '3,61', target: '3,75', gap: '−0,14' });
  });

  it('is empty when everything is on target and ignores missing values', () => {
    expect(buildAttentionItems({ qa: 96, sla1m: 99, csat: null, whu: undefined, csatScFull: Number.NaN })).toEqual([]);
  });
});

describe('lowestCsatScAgent', () => {
  const agent = (name: string, good: number, total: number) => ({ name, csId: name, csatScGoodCount: good, csatScTotalValid: total }) as unknown as AgentKPI;

  it('ignores agents with too few responses and picks the lowest good-rate', () => {
    const r = lowestCsatScAgent([agent('A', 10, 20), agent('B', 60, 109), agent('C', 90, 100)]);
    expect(r).toEqual({ name: 'B', pct: (60 / 109) * 100, n: 109 });
  });

  it('is null when nobody has enough responses', () => {
    expect(lowestCsatScAgent([agent('A', 10, 20)])).toBeNull();
    expect(lowestCsatScAgent([])).toBeNull();
  });
});

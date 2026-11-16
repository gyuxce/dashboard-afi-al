import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { buildExportColumns } from '../exportColumns';
import type { WeekCompare } from '../weekCompare';

const active = [{ productivityTotal: 10, csatScTotalValid: 0, csat4Count: 0, csat5Count: 0, sla1m: null, whu: null }] as unknown as AgentKPI[];
const idle = [{ productivityTotal: 0, csatScTotalValid: 0, csat4Count: 0, csat5Count: 0, sla1m: null, whu: null }] as unknown as AgentKPI[];
const week = (start: string, end: string) => ({ start, end }) as unknown as NonNullable<WeekCompare['weeks'][number]>;

describe('buildExportColumns (monthly)', () => {
  const months = ['Jul', 'Agu', 'Sep', 'Okt', 'Nov'].map((label, i) => ({ label, start: `2026-0${i + 7 > 9 ? 9 : i + 7}-01`, end: `2026-0${i + 7 > 9 ? 9 : i + 7}-28` }));

  it('keeps the last four months that have activity, oldest first', () => {
    const data = [active, active, active, active, active];
    expect(buildExportColumns('monthly', null, months, data)?.map((c) => c.label)).toEqual(['Agu', 'Sep', 'Okt', 'Nov']);
  });

  it('skips months without data and returns null below two columns', () => {
    expect(buildExportColumns('monthly', null, months, [idle, [], active, idle, idle])).toBeNull();
    expect(buildExportColumns('monthly', null, months, [idle, active, active, idle, idle])?.map((c) => c.label)).toEqual(['Agu', 'Sep']);
  });
});

describe('buildExportColumns (weekly)', () => {
  it('reverses the newest-first weeks to oldest-first and drops empty slots', () => {
    const wc: WeekCompare = {
      sets: [active, active, [], active],
      labels: ['W4', 'W3', 'W2', 'W1'],
      weeks: [week('2026-10-26', '2026-11-01'), week('2026-10-19', '2026-10-25'), null, week('2026-10-05', '2026-10-11')],
    };
    const cols = buildExportColumns('weekly', wc, [], []);
    expect(cols?.map((c) => c.label)).toEqual(['W1', 'W3', 'W4']);
    expect(cols?.[0]).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('is null without a week comparison or with a single week', () => {
    expect(buildExportColumns('weekly', null, [], [])).toBeNull();
    const one: WeekCompare = { sets: [active], labels: ['W1'], weeks: [week('2026-10-05', '2026-10-11')] };
    expect(buildExportColumns('weekly', one, [], [])).toBeNull();
  });
});

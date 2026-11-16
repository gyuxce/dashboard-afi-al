import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { buildReportPanel, periodHasActivity, type ReportPanelInput } from '../reportPanel';
import { getRollingWeeks } from '../weeks';

const active = { productivityBase: 100, productivityTotal: 100, manDays: 1, qaScoreCount: 0, csatScTotalValid: 0, sla1m: null, whu: null, csat4Count: 0, csat5Count: 0 } as unknown as AgentKPI;
const empty = { productivityBase: 0, productivityTotal: 0, manDays: 0, qaScoreCount: 0, csatScTotalValid: 0, sla1m: null, whu: null, csat4Count: 0, csat5Count: 0 } as unknown as AgentKPI;
const stats = { productivity: 100 };

const base: ReportPanelInput = {
  comparisonMode: 'mom',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  weekRanges: [],
  weekData: [],
  periods: { prev1: { start: '2026-10-01', end: '2026-10-16' }, prev2: { start: '2026-09-01', end: '2026-09-16' }, prev3: { start: '2026-08-01', end: '2026-08-16' } },
  data: { previous: [active], previous2: [active], previous3: [active] },
  stats: { current: stats, previous: stats, previous2: stats, previous3: stats },
  todayIso: '2026-11-17',
};

describe('periodHasActivity', () => {
  it('is false for rows that only carry a roster', () => {
    expect(periodHasActivity([empty])).toBe(false);
    expect(periodHasActivity([empty, active])).toBe(true);
    expect(periodHasActivity([])).toBe(false);
  });
});

describe('buildReportPanel', () => {
  it('MoM: current column plus up to two previous months, delta = current vs the month before', () => {
    const p = buildReportPanel(base)!;
    expect(p.title).toBe('Monthly Performance Report');
    expect(p.columns.map((c) => c.key)).toEqual(['cur', 'p1', 'p2']); // MoM never shows a third previous month
    expect(p).toMatchObject({ deltaTo: 0, deltaFrom: 1 });
    expect(p.columns[1]).toMatchObject({ start: '2026-10-01', end: '2026-10-16' });
  });

  it('WoW without week ranges uses the planned previous periods (three of them)', () => {
    const p = buildReportPanel({ ...base, comparisonMode: 'wow' })!;
    expect(p.title).toBe('Weekly Performance Report');
    expect(p.columns.map((c) => c.key)).toEqual(['cur', 'p1', 'p2', 'p3']);
  });

  it('skips previous periods that have no activity', () => {
    const p = buildReportPanel({ ...base, data: { previous: [active], previous2: [empty], previous3: [empty] } })!;
    expect(p.columns.map((c) => c.key)).toEqual(['cur', 'p1']);
  });

  it('is null when the first previous period has no activity or was not planned', () => {
    expect(buildReportPanel({ ...base, data: { ...base.data, previous: [empty] } })).toBeNull();
    expect(buildReportPanel({ ...base, periods: { prev1: null, prev2: null, prev3: null } })).toBeNull();
  });

  it('WoW with calendar weeks: one column per week with data, last vs second-last, running week flagged', () => {
    const weekRanges = getRollingWeeks('2026-11-01', '2026-11-30', '2026-11-17').slice(-6);
    // Rows only for W5 Okt, W1 and W2 Nov (indexes found by start date); the rest are empty.
    const withData = new Set(['2026-10-26', '2026-11-02', '2026-11-09']);
    const weekData = weekRanges.map((w) => (withData.has(w.start) ? [active] : [empty]));
    const p = buildReportPanel({ ...base, comparisonMode: 'wow', weekRanges, weekData })!;
    expect(p.columns.map((c) => c.start)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
    expect(p.columns.map((c) => c.label)).toEqual(['W5 Okt', 'W1 Nov', 'W2 Nov']);
    expect(p).toMatchObject({ deltaTo: 2, deltaFrom: 1 });
  });

  it('WoW with calendar weeks waits for the week data (null while still computing)', () => {
    const weekRanges = getRollingWeeks('2026-11-01', '2026-11-30', '2026-11-17');
    expect(buildReportPanel({ ...base, comparisonMode: 'wow', weekRanges, weekData: [] })).toBeNull();
  });
});

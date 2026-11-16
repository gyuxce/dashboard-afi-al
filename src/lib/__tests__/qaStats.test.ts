import { describe, expect, it } from 'vitest';
import type { AgentKPI, QAEntry } from '../dataProcessor';
import { buildDefectData, buildQaHighlights, filterQaAgents, isQaDefect, sortDefectAgents, sortPerformanceAgents } from '../qaStats';

const entry = (date: string, mistakeLevel: string, category = '', score = 100, extra: Partial<QAEntry> = {}): QAEntry =>
  ({ date, normDate: date, ticketId: `${date}-${mistakeLevel}-${category}`, mistakeLevel, category, remarks: '', score, hasScore: true, ...extra }) as QAEntry;

const agent = (csId: string, qaHistory: QAEntry[], extra: Record<string, unknown> = {}): AgentKPI => {
  const scored = qaHistory.filter((e) => e.hasScore !== false);
  return {
    csId, name: csId.toUpperCase(), bpo: 'NSI', teamLeader: 'TL', qaHistory,
    qaScoreSum: scored.reduce((s, e) => s + e.score, 0), qaScoreCount: scored.length,
    ...extra,
  } as unknown as AgentKPI;
};

describe('isQaDefect', () => {
  it('counts LOW, MEDIUM, HIGH and VERY HIGH, any case; not NO MISTAKE or blank', () => {
    expect(['Low', 'medium', 'HIGH', 'Very High'].every((l) => isQaDefect(entry('2026-10-01', l)))).toBe(true);
    expect(isQaDefect(entry('2026-10-01', 'NO MISTAKE'))).toBe(false);
    expect(isQaDefect(entry('2026-10-01', ''))).toBe(false);
  });
});

describe('filterQaAgents', () => {
  const data = [agent('a1', [entry('2026-10-01', '')]), agent('b2', []), agent('c3', [entry('2026-10-01', '')], { teamLeader: 'Aufar' })];

  it('drops agents without QA scores, matches search on id or name', () => {
    expect(filterQaAgents(data, '', null).map((a) => a.csId)).toEqual(['a1', 'c3']);
    expect(filterQaAgents(data, 'C3', null).map((a) => a.csId)).toEqual(['c3']);
  });

  it('filters by team leader', () => {
    expect(filterQaAgents(data, '', 'Aufar').map((a) => a.csId)).toEqual(['c3']);
  });
});

describe('buildDefectData', () => {
  const a = agent('a', [
    entry('2026-10-01', 'LOW', 'Salam'),
    entry('2026-10-03', 'VERY HIGH', 'Salah info'),
    entry('2026-10-02', 'HIGH', 'Salam'),
    entry('2026-10-04', 'MEDIUM', 'Salam'),
    entry('2026-10-05', 'NO MISTAKE'),
  ]);
  const [row] = buildDefectData([a]);

  it('counts severities, treating VERY HIGH separately from HIGH', () => {
    expect([row.lowCount, row.mediumCount, row.highCount, row.veryHighCount, row.totalDefect]).toEqual([1, 1, 1, 1, 4]);
  });

  it('lists defects newest first and finds the most frequent category', () => {
    expect(row.defects.map((d) => d.normDate)).toEqual(['2026-10-04', '2026-10-03', '2026-10-02', '2026-10-01']);
    expect(row.mostFrequentMistake).toBe('Salam');
  });

  it('uses "-" when there are no defects, and orders agents by total defects', () => {
    const clean = agent('clean', [entry('2026-10-01', 'NO MISTAKE')]);
    const out = buildDefectData([clean, a]);
    expect(out.map((x) => x.csId)).toEqual(['a', 'clean']);
    expect(out[1].mostFrequentMistake).toBe('-');
  });
});

describe('sorting', () => {
  const rows = buildDefectData([
    agent('b', [entry('2026-10-01', 'LOW', 'X', 90), entry('2026-10-02', 'LOW', 'X', 90)]),
    agent('a', [entry('2026-10-01', 'HIGH', 'Y', 80)]),
    agent('c', [entry('2026-10-01', 'NO MISTAKE', '', 100)]),
  ]);

  it('performance: keeps defect order by default, sorts by average QA (default key) and name', () => {
    expect(sortPerformanceAgents(rows, null).map((r) => r.csId)).toEqual(['b', 'a', 'c']);
    expect(sortPerformanceAgents(rows, { key: 'average', direction: 'asc' }).map((r) => r.csId)).toEqual(['a', 'b', 'c']);
    expect(sortPerformanceAgents(rows, { key: 'name', direction: 'desc' }).map((r) => r.csId)).toEqual(['c', 'b', 'a']);
  });

  it('defect: hides agents without defects and sorts by chosen column', () => {
    expect(sortDefectAgents(rows, null).map((r) => r.csId)).toEqual(['b', 'a']);
    expect(sortDefectAgents(rows, { key: 'high', direction: 'desc' }).map((r) => r.csId)).toEqual(['a', 'b']);
    expect(sortDefectAgents(rows, { key: 'category', direction: 'asc' }).map((r) => r.csId)).toEqual(['b', 'a']);
  });
});

describe('buildQaHighlights', () => {
  const a = agent('a', [entry('2026-10-01', 'LOW', 'Salam', 90), entry('2026-10-02', 'NO MISTAKE', '', 100)]);
  const b = agent('b', [entry('2026-10-01', 'HIGH', 'Salam', 70), entry('2026-10-01', 'MEDIUM', 'Typo', 80)]);
  const tableData = [a, b];
  const h = buildQaHighlights(tableData, buildDefectData(tableData));

  it('totals evaluations, mistakes and the mistake rate', () => {
    expect(h.totalEvaluations).toBe(4);
    expect(h.totalMistakes).toBe(3);
    expect(h.mistakeRate).toBe(75);
  });

  it('ranks categories by count', () => {
    expect(h.topCategories).toEqual([
      { label: 'Salam', value: '2 temuan' },
      { label: 'Typo', value: '1 temuan' },
    ]);
  });

  it('ranks agents by QA average and days from worst to best', () => {
    expect(h.topAgents.map((x) => x.label)).toEqual(['A', 'B']);
    expect(h.topAgents[0].value).toBe('95,0%');
    expect(h.bottomAgents).toEqual([]);
    expect(h.bottomDays).toHaveLength(2);
    expect(h.bottomDays[0].value).toBe('80,0%');
    expect(h.bottomDays[0].subLabel).toBe('3 temuan · 3 evaluasi');
  });
});

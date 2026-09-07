import { describe, it, expect } from 'vitest';
import type { AgentKPI, CSATEntry } from '../dataProcessor';
import {
  parsePilotRows,
  getPilotBatches,
  csatScFullPct,
  weekBuckets,
  buildPilotAgentRow,
  summarizeBatch,
  type PilotEntry,
} from '../pilot';

const daily = (rows: Array<[string, number, number]>) =>
  rows.map(([date, score, count]) => ({ date, normDate: date, score, count }));

const csat = (rows: Array<[string, number, string, string]>): CSATEntry[] =>
  rows.map(([date, score, category, response]) => ({
    date,
    normDate: date,
    ticketId: 't',
    chatId: 'c',
    uid: 'u',
    score,
    category,
    response,
    isTakeout: false,
  }));

const makeAgent = (over: Partial<AgentKPI>): AgentKPI =>
  ({
    csId: '3-1-1',
    name: 'Agent A',
    teamLeader: 'Gagas',
    csatHistory: [],
    dailyHistory: { csatScFull: [], csatScFair: [], productivity: [], csat: [], sla1m: [], sla3m: [], whu: [], schedule: [] },
    ...over,
  } as unknown as AgentKPI);

describe('parsePilotRows', () => {
  it('parses by header names and skips incomplete rows', () => {
    const rows = [
      ['Batch', 'CS ID', 'Tanggal Mulai', 'Tanggal Selesai', 'Catatan Coaching'],
      ['Agu W1', '3-1-3875', '2026-08-03', '2026-08-30', 'Fokus empati'],
      ['Agu W1', '3-1-3535', '3-8-2026', '', 'Ongoing'],
      ['', '3-1-9999', '2026-08-03', '', 'no batch'],
      ['Agu W1', '', '2026-08-03', '', 'no csid'],
      ['Agu W1', '3-1-1', '', '', 'no start'],
    ];
    const out = parsePilotRows(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ batch: 'Agu W1', csId: '3-1-3875', startDate: '2026-08-03', endDate: '2026-08-30' });
    expect(out[1]).toMatchObject({ csId: '3-1-3535', startDate: '2026-08-03', endDate: null });
  });

  it('returns [] for empty / header-only input', () => {
    expect(parsePilotRows([])).toEqual([]);
    expect(parsePilotRows([['Batch', 'CS ID']])).toEqual([]);
  });

  it('reads the optional Baseline column (percent, "%", 0–1 fraction, blank, junk)', () => {
    const rows = [
      ['Batch', 'CS ID', 'Tanggal Mulai', 'Tanggal Selesai', 'Catatan', 'Baseline'],
      ['B', '3-1-1', '2026-08-03', '', '', '62'],
      ['B', '3-1-2', '2026-08-03', '', '', '68.5%'],
      ['B', '3-1-3', '2026-08-03', '', '', '0.7'],
      ['B', '3-1-4', '2026-08-03', '', '', ''],
      ['B', '3-1-5', '2026-08-03', '', '', 'n/a'],
    ];
    const out = parsePilotRows(rows);
    expect(out.map((e) => e.baselineOverride)).toEqual([62, 68.5, 70, null, null]);
  });

  it('baselineOverride is null when there is no Baseline column', () => {
    const out = parsePilotRows([
      ['Batch', 'CS ID', 'Tanggal Mulai', 'Tanggal Selesai', 'Catatan'],
      ['B', '3-1-1', '2026-08-03', '', ''],
    ]);
    expect(out[0].baselineOverride).toBeNull();
  });
});

describe('getPilotBatches', () => {
  const entries: PilotEntry[] = [
    { batch: 'Agu W1', csId: 'a', startDate: '2026-08-03', endDate: '2026-08-30', note: '', baselineOverride: null },
    { batch: 'Agu W1', csId: 'b', startDate: '2026-08-03', endDate: '2026-08-30', note: '', baselineOverride: null },
    { batch: 'Sep W1', csId: 'c', startDate: '2026-09-01', endDate: null, note: '', baselineOverride: null },
  ];
  it('groups by batch, newest first, ongoing when an end date is missing', () => {
    const b = getPilotBatches(entries);
    expect(b.map((x) => x.name)).toEqual(['Sep W1', 'Agu W1']);
    expect(b[0]).toMatchObject({ startDate: '2026-09-01', endDate: null });
    expect(b[1]).toMatchObject({ startDate: '2026-08-03', endDate: '2026-08-30' });
    expect(b[1].entries).toHaveLength(2);
  });
});

describe('csatScFullPct', () => {
  const d = daily([
    ['2026-07-20', 4, 5],   // out of range
    ['2026-08-04', 3, 4],
    ['2026-08-06', 6, 6],
  ]);
  it('sums good/total within the inclusive range', () => {
    expect(csatScFullPct(d, '2026-08-01', '2026-08-31')).toEqual({ pct: 90, good: 9, total: 10 });
  });
  it('null when no ratings in range', () => {
    expect(csatScFullPct(d, '2026-09-01', '2026-09-30')).toEqual({ pct: null, good: 0, total: 0 });
  });
});

describe('weekBuckets', () => {
  it('splits into 7-day chunks clamped to the end', () => {
    const d = daily([
      ['2026-08-03', 5, 10],
      ['2026-08-11', 4, 10],
    ]);
    const w = weekBuckets(d, '2026-08-03', '2026-08-16');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ start: '2026-08-03', end: '2026-08-09', pct: 50 });
    expect(w[1]).toMatchObject({ start: '2026-08-10', end: '2026-08-16', pct: 40 });
  });
});

describe('buildPilotAgentRow', () => {
  const entry: PilotEntry = {
    batch: 'Agu W1',
    csId: '3-1-1',
    startDate: '2026-08-03',
    endDate: '2026-08-16',
    note: 'Fokus empati',
    baselineOverride: null,
  };

  it('computes baseline (2 wks before), weekly trend, delta, and LULUS on an upward trend past 70', () => {
    const agent = makeAgent({
      dailyHistory: {
        csatScFull: daily([
          ['2026-07-25', 6, 10], // baseline window (2026-07-20..2026-08-02) → 60%
          ['2026-08-05', 6, 10], // week 1 → 60%
          ['2026-08-12', 8, 10], // week 2 → 80%
        ]),
        csatScFair: [], productivity: [], csat: [], sla1m: [], sla3m: [], whu: [], schedule: [],
      },
    } as Partial<AgentKPI>);

    const row = buildPilotAgentRow(entry, agent, '2026-08-31');
    expect(row.baseline).toBe(60);
    expect(row.weeks.map((w) => w.pct)).toEqual([60, 80]);
    expect(row.current).toBe(80);
    expect(row.delta).toBe(20);
    expect(row.trendUp).toBe(true);
    expect(row.status).toBe('lulus');
  });

  it('flat / below-target trend → next-batch', () => {
    const agent = makeAgent({
      dailyHistory: {
        csatScFull: daily([
          ['2026-07-25', 6, 10], // baseline 60
          ['2026-08-05', 5, 10], // wk1 50
          ['2026-08-12', 5, 10], // wk2 50
        ]),
        csatScFair: [], productivity: [], csat: [], sla1m: [], sla3m: [], whu: [], schedule: [],
      },
    } as Partial<AgentKPI>);
    const row = buildPilotAgentRow(entry, agent, '2026-08-31');
    expect(row.status).toBe('next-batch');
  });

  it('derives DSAT count, category breakdown, repeat indicators and sample cases', () => {
    const agent = makeAgent({
      csatHistory: csat([
        ['2026-08-04', 1, 'Slow respon', 'lama banget'],
        ['2026-08-05', 2, 'Slow respon', 'nunggu lama'],
        ['2026-08-12', 2, 'Slow respon', 'masih lambat'],   // repeat: Slow respon in wk1 + wk2
        ['2026-08-06', 1, 'Kurang empati', 'jutek'],
        ['2026-08-07', 5, 'Ramah', 'mantap cepat'],
        ['2026-08-08', 4, 'Ramah', 'ok membantu'],
        ['2026-08-09', 3, 'Netral', 'biasa'],               // score 3 → excluded from valid
      ]),
      dailyHistory: {
        csatScFull: daily([['2026-08-05', 3, 6]]),
        csatScFair: [], productivity: [], csat: [], sla1m: [], sla3m: [], whu: [], schedule: [],
      },
    } as Partial<AgentKPI>);

    const row = buildPilotAgentRow(entry, agent, '2026-08-31');
    expect(row.dsatCount).toBe(4);                 // scores 1,2,2,1
    expect(row.dsatPct).toBeCloseTo((4 / 6) * 100); // 6 valid (score-3 excluded)
    expect(row.dsatByCategory[0]).toEqual({ category: 'Slow respon', count: 3 });
    expect(row.repeatIndicators).toEqual(['Slow respon']);
    // bad cases: worst score first, then most-recent → the 2026-08-06 score-1 leads
    expect(row.badCases[0]).toMatchObject({ score: 1, date: '2026-08-06' });
    expect(row.badCases.every((c) => c.score <= 2)).toBe(true);
    expect(row.goodCases[0]).toMatchObject({ score: 5, category: 'Ramah' });
    // nothing in the 2 weeks before 2026-08-03 → the "sebelum" side is empty
    expect(row.baselineDsat).toMatchObject({ validTotal: 0, count: 0, pct: null, byCategory: [] });
    expect(row.baselineCases).toEqual([]);
  });

  it('splits DSAT + bad cases into before-batch vs during-batch windows', () => {
    const agent = makeAgent({
      csatHistory: csat([
        // before window [2026-07-20 .. 2026-08-02]
        ['2026-07-22', 1, 'Slow respon', 'lelet sebelum'],
        ['2026-07-28', 2, 'Slow respon', 'masih lelet'],
        ['2026-07-30', 5, 'Ramah', 'oke sih'],
        // during window [2026-08-03 .. 2026-08-16]
        ['2026-08-05', 2, 'Kurang empati', 'jutek pas project'],
        ['2026-08-10', 5, 'Ramah', 'membaik'],
      ]),
      dailyHistory: {
        csatScFull: [], csatScFair: [], productivity: [], csat: [], sla1m: [], sla3m: [], whu: [], schedule: [],
      },
    } as Partial<AgentKPI>);

    const row = buildPilotAgentRow(entry, agent, '2026-08-31');
    // before: 2 bad of 3 valid → 66.7%, top category "Slow respon"
    expect(row.baselineDsat.count).toBe(2);
    expect(row.baselineDsat.validTotal).toBe(3);
    expect(row.baselineDsat.pct).toBeCloseTo((2 / 3) * 100);
    expect(row.baselineDsat.byCategory[0]).toEqual({ category: 'Slow respon', count: 2 });
    expect(row.baselineCases.map((c) => c.response)).toContain('lelet sebelum');
    // during: 1 bad of 2 valid → 50%, "Kurang empati"; before-cases not mixed in
    expect(row.dsatCount).toBe(1);
    expect(row.dsatByCategory[0]).toEqual({ category: 'Kurang empati', count: 1 });
    expect(row.badCases.map((c) => c.response)).toEqual(['jutek pas project']);
  });

  it('no CSAT SC data at all → no-data status', () => {
    const row = buildPilotAgentRow(entry, makeAgent({}), '2026-08-31');
    expect(row.status).toBe('no-data');
    expect(row.baseline).toBeNull();
    expect(row.current).toBeNull();
  });

  it('manual baselineOverride from the sheet wins over the auto 2-week value', () => {
    const agent = makeAgent({
      dailyHistory: {
        csatScFull: daily([
          ['2026-07-25', 6, 10], // auto baseline would be 60
          ['2026-08-05', 7, 10], // wk1 70
        ]),
        csatScFair: [], productivity: [], csat: [], sla1m: [], sla3m: [], whu: [], schedule: [],
      },
    } as Partial<AgentKPI>);
    const row = buildPilotAgentRow({ ...entry, baselineOverride: 62 }, agent, '2026-08-31');
    expect(row.baseline).toBe(62);
    expect(row.baselineIsManual).toBe(true);
    expect(row.delta).toBe(70 - 62);
    // the auto windows are still exposed as a reference
    expect(row.baselineByWindow.find((b) => b.days === 14)!.pct).toBe(60);
  });

  it('baseline exists but no progress week yet → no-data, not next-batch', () => {
    const agent = makeAgent({
      dailyHistory: {
        csatScFull: daily([['2026-07-25', 6, 10]]), // only the baseline window
        csatScFair: [], productivity: [], csat: [], sla1m: [], sla3m: [], whu: [], schedule: [],
      },
    } as Partial<AgentKPI>);
    const row = buildPilotAgentRow(entry, agent, '2026-08-31');
    expect(row.baseline).toBe(60);
    expect(row.current).toBeNull();
    expect(row.status).toBe('no-data');
  });
});

describe('summarizeBatch', () => {
  const entry = (over: Partial<PilotEntry>): PilotEntry => ({
    batch: 'B', csId: '3-1-1', startDate: '2026-08-03', endDate: '2026-08-16', note: '', baselineOverride: null, ...over,
  });
  const agentWith = (csId: string, full: Array<[string, number, number]>) =>
    makeAgent({
      csId,
      dailyHistory: {
        csatScFull: daily(full),
        csatScFair: [], productivity: [], csat: [], sla1m: [], sla3m: [], whu: [], schedule: [],
      },
    } as Partial<AgentKPI>);

  it('rolls rows up to cohort counts, averages, week-aligned averages and DSAT', () => {
    const a = buildPilotAgentRow(entry({ csId: 'a' }), makeAgent({
      csId: 'a',
      csatHistory: csat([
        ['2026-08-04', 1, 'Slow respon', 'lama'],
        ['2026-08-11', 2, 'Slow respon', 'masih lama'],   // repeat across wk1+wk2
        ['2026-08-05', 5, 'Ramah', 'mantap'],
      ]),
      dailyHistory: {
        csatScFull: daily([
          ['2026-07-25', 6, 10],  // baseline 60
          ['2026-08-05', 6, 10],  // wk1 60
          ['2026-08-12', 8, 10],  // wk2 80 → improved
        ]),
        csatScFair: [], productivity: [], csat: [], sla1m: [], sla3m: [], whu: [], schedule: [],
      },
    } as Partial<AgentKPI>), '2026-08-31');
    const b = buildPilotAgentRow(entry({ csId: 'b' }), agentWith('b', [
      ['2026-07-25', 5, 10],  // baseline 50
      ['2026-08-05', 5, 10],  // wk1 50
      ['2026-08-12', 5, 10],  // wk2 50 → flat
    ]), '2026-08-31');
    const c = buildPilotAgentRow(entry({ csId: 'c' }), makeAgent({ csId: 'c' }), '2026-08-31'); // no-data

    const s = summarizeBatch([a, b, c]);
    expect(s.participants).toBe(3);
    expect(s.withData).toBe(2);              // a, b have weeks; c doesn't
    expect(s.improved).toBe(1);              // a (+20); b flat; c null
    expect(s.declined).toBe(0);
    expect(s.avgBaseline).toBe(55);          // (60 + 50) / 2, c has no baseline
    expect(s.avgCurrent).toBe(65);           // (80 + 50) / 2
    expect(s.avgDelta).toBe(10);             // (+20 + 0) / 2
    expect(s.weekAvgs).toEqual([55, 65]);    // wk1 (60,50)→55 ; wk2 (80,50)→65
    expect(s.dsatCount).toBe(2);             // a's two 1–2 ratings
    expect(s.dsatValidTotal).toBe(3);        // a's 3 valid ratings
    expect(s.baselineDsatPct).toBeNull();    // no ratings before 2026-08-03 in the fixtures
    expect(s.topDsatCategories[0]).toEqual({ category: 'Slow respon', count: 2 });
    expect(s.repeatCategories).toEqual(['Slow respon']);
  });

  it('empty cohort → zeros and nulls', () => {
    const s = summarizeBatch([]);
    expect(s).toMatchObject({
      participants: 0, withData: 0, improved: 0, avgDelta: null,
      dsatCount: 0, dsatPct: null, baselineDsatPct: null,
      topDsatCategories: [], repeatCategories: [], weekAvgs: [],
    });
  });
});

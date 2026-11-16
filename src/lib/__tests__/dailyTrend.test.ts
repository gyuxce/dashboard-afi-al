import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { buildDailyTrend, withPreviousProductivity } from '../dailyTrend';

const agent = (history: Partial<AgentKPI['dailyHistory']>, qaHistory: unknown[] = []): AgentKPI =>
  ({
    qaHistory,
    dailyHistory: { productivity: [], csat: [], csatScFull: [], csatScFair: [], sla1m: [], sla3m: [], whu: [], schedule: [], ...history },
  }) as unknown as AgentKPI;

const prod = (normDate: string, value: number) => ({ date: normDate, normDate, value });
const sched = (normDate: string, status: string, isManDay: boolean) => ({ date: normDate, normDate, status, isManDay });

describe('buildDailyTrend', () => {
  it('sums productivity across agents per day and only keeps days that have productivity', () => {
    const rows = buildDailyTrend([
      agent({ productivity: [prod('2026-10-01', 100), prod('2026-10-02', 80)] }),
      agent({ productivity: [prod('2026-10-01', 50)], schedule: [sched('2026-10-05', '1', true)] }),
    ]);
    expect(rows.map((r) => [r.date, r.productivity])).toEqual([['2026-10-01', 150], ['2026-10-02', 80]]);
  });

  it('averages productivity per man-day and attendance from the schedule of the same day', () => {
    const rows = buildDailyTrend([
      agent({
        productivity: [prod('2026-10-01', 120)],
        schedule: [sched('2026-10-01', '1', true)],
      }),
      agent({
        productivity: [prod('2026-10-01', 80)],
        schedule: [sched('2026-10-01', 'S', true)], // sick: man-day, not present
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].productivity).toBe(200);
    expect(rows[0].avgProductivity).toBe(100); // 200 chats / 2 man-days
    expect(rows[0].attendance).toBe(50); // 1 present of 2 on duty
  });

  it('counts PULLOUT as duty and present, OFF as neither', () => {
    const rows = buildDailyTrend([
      agent({ productivity: [prod('2026-10-01', 10)], schedule: [sched('2026-10-01', 'PULLOUT', false)] }),
      agent({ productivity: [prod('2026-10-01', 10)], schedule: [sched('2026-10-01', 'OFF', false)] }),
    ]);
    expect(rows[0].attendance).toBe(100);
  });

  it('merges QA scores by day and leaves days without a measure as null', () => {
    const rows = buildDailyTrend([
      agent({ productivity: [prod('2026-10-01', 10), prod('2026-10-02', 10)] }, [
        { date: '2026-10-01', normDate: '2026-10-01', score: 90 },
        { date: '2026-10-01', normDate: '2026-10-01', score: 100 },
      ]),
    ]);
    expect(rows[0].qa).toBe(95);
    expect(rows[1].qa).toBeNull();
    expect(rows[0].csat).toBeNull();
  });

  it('returns rows oldest first', () => {
    const rows = buildDailyTrend([agent({ productivity: [prod('2026-10-03', 1), prod('2026-10-01', 1), prod('2026-10-02', 1)] })]);
    expect(rows.map((r) => r.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });
});

describe('withPreviousProductivity', () => {
  it('lines the previous period up by day offset', () => {
    const cur = buildDailyTrend([agent({ productivity: [prod('2026-11-01', 10), prod('2026-11-02', 20)] })]);
    const prev = buildDailyTrend([agent({ productivity: [prod('2026-10-01', 5), prod('2026-10-02', 7)] })]);
    const merged = withPreviousProductivity(cur, prev);
    expect(merged.map((r) => r.prevProductivity)).toEqual([5, 7]);
  });

  it('gives null when there is no previous period', () => {
    const cur = buildDailyTrend([agent({ productivity: [prod('2026-11-01', 10)] })]);
    expect(withPreviousProductivity(cur, [])[0].prevProductivity).toBeNull();
  });
});

import { isCsatTakeoutCategory, isValidCsatScScore, type AgentKPI } from './dataProcessor';

/**
 * Per-week CSAT SC numbers behind the weekly deck slides. Same rules as the CSAT Room panels
 * (Full keeps every valid rating, After Takeout drops the takeout categories), kept free of
 * React so the export can reuse them and tests can run them directly.
 */

export type CsatMode = 'full' | 'fair';

type Csat = Pick<
  AgentKPI,
  | 'csId' | 'name' | 'teamLeader' | 'csatHistory'
  | 'csatScGoodCount' | 'csatScTotalValid' | 'csatScFairGoodCount' | 'csatScFairTotalValid'
  | 'csatScFullCount' | 'csatScFairCount'
  | 'csatScBadScoreFullCount' | 'csatScBadScoreFairCount'
  | 'csatScCategoriesFull' | 'csatScCategoriesFair'
>;

/** Positive rate (good ÷ valid, rating 3 ignored), both views, as shown on the dashboard. */
export function positiveRates(rows: Csat[]): { full: number | null; fair: number | null } {
  let good = 0, valid = 0, fairGood = 0, fairValid = 0;
  rows.forEach((a) => {
    good += a.csatScGoodCount || 0;
    valid += a.csatScTotalValid || 0;
    fairGood += a.csatScFairGoodCount || 0;
    fairValid += a.csatScFairTotalValid || 0;
  });
  return {
    full: valid > 0 ? (good / valid) * 100 : null,
    fair: fairValid > 0 ? (fairGood / fairValid) * 100 : null,
  };
}

export type RespondentStats = {
  processed: number;
  respondents: number;
  /** respondents ÷ processed tickets, in percent. */
  rate: number;
  /** Count per star: index 0 = 1★ … index 4 = 5★. */
  stars: [number, number, number, number, number];
};

export function respondentStats(rows: Csat[], mode: CsatMode): RespondentStats {
  const stars: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let processed = 0;
  let respondents = 0;
  rows.forEach((a) => {
    const histories = (a.csatHistory || []).filter((h) => mode === 'full' || !h.isTakeout);
    processed += histories.length;
    histories.forEach((h) => {
      if (h.score >= 1 && h.score <= 5) {
        respondents += 1;
        stars[h.score - 1] += 1;
      }
    });
  });
  return { processed, respondents, rate: processed > 0 ? (respondents / processed) * 100 : 0, stars };
}

export type DailyRespondents = { date: string; respondents: number };

/** Respondents per calendar day (ascending), for the daily trend of the latest week. */
export function dailyRespondents(rows: Csat[], mode: CsatMode): DailyRespondents[] {
  const byDay = new Map<string, number>();
  rows.forEach((a) => {
    (a.csatHistory || [])
      .filter((h) => mode === 'full' || !h.isTakeout)
      .forEach((h) => {
        if (!(h.score >= 1 && h.score <= 5)) return;
        const day = h.normDate || h.date;
        if (!day) return;
        byDay.set(day, (byDay.get(day) || 0) + 1);
      });
  });
  return Array.from(byDay.entries())
    .map(([date, respondents]) => ({ date, respondents }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type TopCategory = { rank: number; name: string; count: number; goodPct: number | null; isTakeout: boolean };

/** Categories with the most bad (1–2) ratings, with each category's good-rating share. */
export function topBadCategories(rows: Csat[], mode: CsatMode, limit: number): TopCategory[] {
  const agg: Record<string, { label: string; bad: number; good: number; total: number }> = {};
  rows
    .filter((a) => (mode === 'full' ? a.csatScFullCount : a.csatScFairCount) > 0)
    .forEach((a) => {
      (a.csatHistory || [])
        .filter((h) => (mode === 'full' || !h.isTakeout) && isValidCsatScScore(h.score))
        .forEach((h) => {
          const label = String(h.category || '').trim().replace(/\s+/g, ' ');
          const key = label.toLowerCase();
          if (!key) return;
          if (!agg[key]) agg[key] = { label, bad: 0, good: 0, total: 0 };
          agg[key].total += 1;
          if (h.score === 1 || h.score === 2) agg[key].bad += 1;
          if (h.score === 4 || h.score === 5) agg[key].good += 1;
        });
    });
  return Object.values(agg)
    .sort((a, b) => b.bad - a.bad)
    .slice(0, limit)
    .map((entry, i) => ({
      rank: i + 1,
      name: entry.label,
      count: entry.bad,
      goodPct: entry.total > 0 ? (entry.good / entry.total) * 100 : null,
      isTakeout: isCsatTakeoutCategory(entry.label),
    }));
}

export type TopAgent = {
  name: string;
  csId: string;
  badCount: number;
  topCategories: { name: string; count: number }[];
};

/** Agents with the most bad (1–2) ratings and the three categories behind them. */
export function topBadAgents(rows: Csat[], mode: CsatMode, limit: number): TopAgent[] {
  return rows
    .filter((a) => (mode === 'full' ? a.csatScFullCount : a.csatScFairCount) > 0)
    .map((a) => {
      const badCount = mode === 'full' ? a.csatScBadScoreFullCount || 0 : a.csatScBadScoreFairCount || 0;
      const categoryCounts = mode === 'full' ? a.csatScCategoriesFull || {} : a.csatScCategoriesFair || {};
      return {
        name: a.name || a.csId,
        csId: a.csId,
        badCount,
        topCategories: Object.entries(categoryCounts)
          .sort(([, x], [, y]) => y - x)
          .slice(0, 3)
          .map(([name, count]) => ({ name, count })),
      };
    })
    .filter((a) => a.badCount > 0)
    .sort((a, b) => b.badCount - a.badCount)
    .slice(0, limit);
}

/** All bad (1–2) ratings in the view and how many belong to takeout categories. */
export function badCategoryTotals(rows: Csat[], mode: CsatMode): { total: number; takeout: number } {
  let total = 0;
  let takeout = 0;
  rows.forEach((a) => {
    (a.csatHistory || [])
      .filter((h) => (mode === 'full' || !h.isTakeout) && (h.score === 1 || h.score === 2))
      .forEach((h) => {
        total += 1;
        if (isCsatTakeoutCategory(h.category)) takeout += 1;
      });
  });
  return { total, takeout };
}

export type HeadcountStats = { agents: number; teamLeaders: number };

/** Agents with at least one man-day in the week, and the distinct team leaders among them. */
export function headcountStats(rows: Pick<AgentKPI, 'manDays' | 'teamLeader'>[]): HeadcountStats {
  const active = rows.filter((a) => a.manDays > 0);
  const leaders = new Set(active.map((a) => (a.teamLeader || '').trim()).filter(Boolean));
  return { agents: active.length, teamLeaders: leaders.size };
}

/** Categories the business is considering adding to takeout (what-if), in display order. */
export const EXTRA_TAKEOUT_CATEGORIES = ['chat/call terputus', 'kendala qris'] as const;

/** "kendala qris" → "kendala QRIS" for display. */
export const prettyCategory = (name: string) => name.replace(/qris/i, 'QRIS');

const normCategory = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export type TakeoutScenario = {
  label: string;
  /** Respondents left (ratings 1–5) once the scenario's takeout is applied. */
  respondents: number;
  /** good ÷ (good + bad), rating 3 ignored. */
  a: number | null;
  /** good ÷ all respondents, rating 3 counted. */
  b: number | null;
};

/**
 * Positive rate under both formulas for: Full, After Takeout (today's 3 categories) and the same
 * with each extra category, and with all extras together.
 */
export function takeoutScenarios(rows: Csat[], extra: readonly string[] = EXTRA_TAKEOUT_CATEGORIES): TakeoutScenario[] {
  const scenario = (label: string, excluded: (category: string) => boolean): TakeoutScenario => {
    let good = 0, bad = 0, neutral = 0;
    rows.forEach((a) => {
      (a.csatHistory || []).forEach((h) => {
        if (!(h.score >= 1 && h.score <= 5)) return;
        if (excluded(h.category)) return;
        if (h.score >= 4) good += 1;
        else if (h.score === 3) neutral += 1;
        else bad += 1;
      });
    });
    const respondents = good + bad + neutral;
    return {
      label,
      respondents,
      a: good + bad > 0 ? (good / (good + bad)) * 100 : null,
      b: respondents > 0 ? (good / respondents) * 100 : null,
    };
  };
  const extras = extra.map(normCategory);
  const base = (c: string) => isCsatTakeoutCategory(c);
  return [
    scenario('Full', () => false),
    scenario('After Takeout sekarang', base),
    ...extras.map((name) => scenario(`+ ${prettyCategory(name)}`, (c) => base(c) || normCategory(c) === name)),
    scenario('+ keduanya', (c) => base(c) || extras.includes(normCategory(c))),
  ];
}

/** Bad (1–2) ratings per team leader, most first. */
export function dsatByTeamLeader(rows: Csat[], mode: CsatMode): { name: string; dsat: number }[] {
  const totals = new Map<string, number>();
  rows.forEach((a) => {
    const bad = (a.csatHistory || []).filter(
      (h) => (mode === 'full' || !h.isTakeout) && (h.score === 1 || h.score === 2),
    ).length;
    const tl = (a.teamLeader || '').trim() || '(Tanpa TL)';
    totals.set(tl, (totals.get(tl) || 0) + bad);
  });
  return Array.from(totals.entries())
    .map(([name, dsat]) => ({ name, dsat }))
    .filter((t) => t.dsat > 0)
    .sort((a, b) => b.dsat - a.dsat);
}

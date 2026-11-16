import { formatNum } from './utils';
import { REPORT_METRICS, formatMetricValue, type PeriodStats, type ReportMetric } from './weeklyReport';
import type { TopAgent, TopCategory } from './csatWeekly';

/**
 * The "Kesimpulan" slide of the weekly / monthly deck: one place that sums up the whole review, built only
 * from numbers the other slides already show (no manual input). Pure data → text/numbers, so it is testable
 * without a canvas; summarySlide.ts draws it.
 */

export type SummaryHeadline = { text: string; tone: 'good' | 'bad' | 'warn' | 'neutral' };

export type SummaryKpiMiss = { label: string; valueText: string; targetText: string; gapText: string };
export type SummaryMove = { label: string; deltaText: string };

export type SummaryAgent = { name: string; bad: number; repeated: boolean };

export type WeeklySummary = {
  label: string;
  prevLabel: string | null;
  kpi: {
    achieved: number;
    total: number;
    prevAchieved: number | null;
    below: SummaryKpiMiss[];
  };
  moves: {
    up: SummaryMove[];
    down: SummaryMove[];
    /** Total / average productivity, which have no "poin": shown on their own line. */
    productivity: { label: string; valueText: string; delta: number | null }[];
  };
  csat: {
    respondents: number;
    respondentsDelta: number | null;
    bad: number;
    badDelta: number | null;
    /** Bad (1–2) ratings as a share of respondents, in percent. */
    badShare: number | null;
    topCategory: { name: string; count: number } | null;
  };
  agents: {
    top: SummaryAgent[];
    /** Category that is the first cause of the most agents in the list (needs ≥ 2 agents). */
    commonCause: { name: string; agents: number; of: number } | null;
  };
  headline: SummaryHeadline;
  /** Same story as short sentences, for the Highlight box and "Salin teks". */
  lines: string[];
};

export type SummaryInput = {
  label: string;
  prevLabel: string | null;
  lastStats: PeriodStats;
  prevStats: PeriodStats | null;
  csat: {
    last: { respondents: number; bad: number; topCategory: TopCategory | null; agents: TopAgent[] };
    prev: { respondents: number; bad: number; agents: TopAgent[] } | null;
  };
};

const fmtTarget = (m: ReportMetric) => (m.target === null ? '-' : m.kind === 'score' ? formatNum(m.target) : `${formatNum(m.target, 0)}%`);
const signed = (x: number, digits: number) => `${x > 0 ? '+' : '−'}${formatNum(Math.abs(x), digits)}`;

/** A KPI with a target counts as achieved only when it reaches it ("watch" values below target are not). */
const reached = (m: ReportMetric, v: number) => m.target !== null && v >= m.target;

export function buildWeeklySummary(input: SummaryInput): WeeklySummary {
  const { label, prevLabel, lastStats, prevStats, csat } = input;
  const withTarget = REPORT_METRICS.filter((m) => m.target !== null);

  const below: SummaryKpiMiss[] = withTarget
    .map((m) => ({ m, v: lastStats[m.key] ?? 0 }))
    .filter(({ m, v }) => !reached(m, v))
    // Biggest relative shortfall first, so units (poin vs bintang) are comparable.
    .sort((a, b) => (a.v - (a.m.target as number)) / (a.m.target as number) - (b.v - (b.m.target as number)) / (b.m.target as number))
    .map(({ m, v }) => ({
      label: m.label,
      valueText: formatMetricValue(m, v),
      targetText: fmtTarget(m),
      gapText: signed(v - (m.target as number), 2),
    }));
  const achieved = withTarget.length - below.length;
  const prevAchieved = prevStats
    ? withTarget.filter((m) => reached(m, prevStats[m.key] ?? 0)).length
    : null;

  // Same rule as the Overview slide's Highlight (percent / score KPIs, absolute change), so both slides agree.
  const moves = prevStats
    ? REPORT_METRICS.filter((m) => m.kind !== 'count')
        .map((m) => ({ m, d: (lastStats[m.key] ?? 0) - (prevStats[m.key] ?? 0) }))
        .filter(({ d }) => Math.abs(d) >= 0.005)
    : [];
  const toMove = ({ m, d }: { m: ReportMetric; d: number }): SummaryMove => ({
    label: m.label,
    deltaText: `${signed(d, 2)} poin`,
  });
  const up = moves.filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 3).map(toMove);
  const down = moves.filter((x) => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 3).map(toMove);
  const productivity = REPORT_METRICS.filter((m) => m.kind === 'count').map((m) => ({
    label: m.label,
    valueText: formatMetricValue(m, lastStats[m.key] ?? 0),
    delta: prevStats ? (lastStats[m.key] ?? 0) - (prevStats[m.key] ?? 0) : null,
  }));

  const respondentsDelta = csat.prev ? csat.last.respondents - csat.prev.respondents : null;
  const badDelta = csat.prev ? csat.last.bad - csat.prev.bad : null;
  const badShare = csat.last.respondents > 0 ? (csat.last.bad / csat.last.respondents) * 100 : null;
  const topCategory = csat.last.topCategory ? { name: csat.last.topCategory.name, count: csat.last.topCategory.count } : null;

  const prevIds = new Set((csat.prev?.agents ?? []).map((a) => a.csId));
  const top: SummaryAgent[] = csat.last.agents.slice(0, 3).map((a) => ({ name: a.name, bad: a.badCount, repeated: prevIds.has(a.csId) }));
  const tally = new Map<string, number>();
  csat.last.agents.forEach((a) => {
    const first = a.topCategories[0]?.name;
    if (first) tally.set(first, (tally.get(first) ?? 0) + 1);
  });
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const commonCause = best && csat.last.agents.length >= 2 && best[1] >= 2 ? { name: best[0], agents: best[1], of: csat.last.agents.length } : null;

  // Headline: the one sentence to remember.
  const worst = below[0];
  let headline: SummaryHeadline;
  if (withTarget.length === 0) headline = { text: `Ringkasan ${label}`, tone: 'neutral' };
  else if (below.length === 0) headline = { text: `Semua ${withTarget.length} KPI bertarget tercapai di ${label}`, tone: 'good' };
  else
    headline = {
      text: `${achieved} dari ${withTarget.length} KPI tercapai di ${label}; ${worst.label} paling jauh dari target: ${worst.valueText} vs ${worst.targetText}`,
      tone: below.length <= 3 ? 'warn' : 'bad',
    };

  const lines: string[] = [];
  lines.push(
    `${achieved} dari ${withTarget.length} KPI bertarget tercapai di ${label}${prevLabel && prevAchieved !== null ? ` (${prevLabel}: ${prevAchieved})` : ''}.` +
      (below.length > 0 ? ` Di bawah target: ${below.slice(0, 3).map((b) => `${b.label} ${b.valueText} (target ${b.targetText})`).join(', ')}${below.length > 3 ? `, +${below.length - 3} lainnya` : ''}.` : ''),
  );
  if (prevLabel && (up[0] || down[0])) {
    const parts = [
      up[0] ? `naik terbesar ${up[0].label} (${up[0].deltaText})` : '',
      down[0] ? `turun terbesar ${down[0].label} (${down[0].deltaText})` : '',
    ].filter(Boolean);
    lines.push(`Dibanding ${prevLabel}: ${parts.join('; ')}.`);
  }
  if (csat.last.respondents > 0) {
    lines.push(
      `After Takeout: ${formatNum(csat.last.bad, 0)} rating 1–2 dari ${formatNum(csat.last.respondents, 0)} responden` +
        `${badShare !== null ? ` (${formatNum(badShare, 1)}%)` : ''}` +
        `${topCategory ? `; penyebab utama ${topCategory.name} (${topCategory.count})` : ''}.`,
    );
  }
  if (top[0]) {
    const repeats = top.filter((a) => a.repeated).length;
    lines.push(
      `Agent perlu perhatian: ${top[0].name} (${top[0].bad} rating 1–2)` +
        `${repeats > 0 && prevLabel ? `; ${repeats} dari ${top.length} agent teratas berulang dari ${prevLabel}` : ''}` +
        `${commonCause ? `; ${commonCause.name} jadi penyebab utama ${commonCause.agents} dari ${commonCause.of} agent` : ''}.`,
    );
  }

  return {
    label,
    prevLabel,
    kpi: { achieved, total: withTarget.length, prevAchieved, below },
    moves: { up, down, productivity },
    csat: { respondents: csat.last.respondents, respondentsDelta, bad: csat.last.bad, badDelta, badShare, topCategory },
    agents: { top, commonCause },
    headline,
    lines,
  };
}

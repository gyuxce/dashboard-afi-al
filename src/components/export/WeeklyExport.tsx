import React, { useEffect, useMemo, useState } from 'react';
import { Download, ClipboardCopy, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { SegmentedControl } from '../ui/SegmentedControl';
import { EmptyState } from '../ui/EmptyState';
import { weekHasData, type WeekCompare } from '../../lib/weekCompare';
import type { AgentKPI } from '../../lib/dataProcessor';
import type { CalendarWeek, MonthRange } from '../../lib/weeks';
import { getKpiStatus } from '../../lib/utils';
import {
  EXTRA_TAKEOUT_CATEGORIES,
  prettyCategory,
  badCategoryTotals,
  dailyRespondents,
  dsatByTeamLeader,
  headcountStats,
  positiveRates,
  respondentStats,
  takeoutScenarios,
  topBadAgents,
  topBadCategories,
  type CsatMode,
} from '../../lib/csatWeekly';
import {
  renderAgentsSlide,
  renderCategoriesSlide,
  renderHeadcountSlide,
  renderPositiveRateSlide,
  renderRespondentsSlide,
  renderTakeoutSimSlide,
  renderTlSamplingSlide,
  type SlideWeek,
} from '../../lib/csatSlides';
import {
  agentHeadline,
  agentHighlights,
  categoryHeadline,
  categoryHighlights,
  headcountHeadline,
  headcountHighlights,
  overviewHeadline,
  overviewHighlights,
  positiveRateHeadline,
  positiveRateHighlights,
  respondentHeadline,
  respondentHighlights,
  takeoutSimHeadline,
  takeoutSimHighlights,
  tlHeadline,
  tlSamplingHighlights,
} from '../../lib/weeklyHighlights';
import { downloadBlob, renderTableSlide } from '../../lib/slideExport';
import { composeFullSlide } from '../../lib/slideFrame';
import { renderAgendaSlide, renderCoverSlide } from '../../lib/openingSlides';
import { canonicalBpoName, isSmallBpoName } from '../../lib/bpoNames';
import {
  REPORT_METRICS,
  buildReportSlideModel,
  calculatePeriodStats,
  formatMetricValue,
  formatWeekSpan,
  type ReportColumn,
} from '../../lib/weeklyReport';

type Rendered = { blob: Blob; lines: string[] };
type Slide = {
  id: string;
  no: number;
  title: string;
  file: string;
  /** The template already has an editable Highlight box under the picture, so the text is not baked in by default. */
  templateHasHighlight: boolean;
  /** Text of the white tab / red bar in the full-slide layout (editable on the page). */
  section: string;
  titleText: string;
  /** Footer caption in the full-slide layout. */
  caption: string;
  /** Cover and agenda: drawn as complete slides, no frame and no Highlight. */
  standalone?: boolean;
  render: (highlightInImage: boolean, bare: boolean) => Promise<Rendered>;
};

const done = async (image: Promise<Blob>, lines: string[]): Promise<Rendered> => ({ blob: await image, lines });

const formatDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(y, m - 1, d))}`;
};

/** "26 Oct - 1 Nov 2026", the way the deck titles write it. */
const deckRange = (start: string, end: string, spaced: boolean) => {
  const local = (v: string) => {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const s = local(start);
  const e = local(end);
  const mon = (d: Date) => d.toLocaleString('en-US', { month: 'short' });
  const sep = spaced ? ' - ' : '-';
  const left = s.getMonth() === e.getMonth() ? `${s.getDate()}` : `${s.getDate()} ${mon(s)}`;
  return `${left}${sep}${e.getDate()} ${mon(e)} ${e.getFullYear()}`;
};

/** Not in the data: QC / Trainer headcount and turnover per week (typed in, remembered per BPO). */
/** `turnover` stays empty until typed: an empty week is shown as "belum diisi", never as 0%. */
type Manual = { qc: number; trainer: number; turnover: Record<string, number> };
const TURNOVER_THRESHOLD = 5;
const bpoKey = (bpo: string) => canonicalBpoName(bpo || 'All BPO').toUpperCase();
const manualKey = (bpo: string) => `weekly-export-headcount:${bpoKey(bpo)}`;
const tlKey = (bpo: string, weekStart: string) => `weekly-export-tl:${bpoKey(bpo)}:${weekStart}`;

const defaultManual = (bpo: string): Manual => {
  const upper = canonicalBpoName(bpo || '').toUpperCase();
  if (upper === 'NSI') return { qc: 1, trainer: 0, turnover: {} };
  if (upper === 'TCID') return { qc: 2, trainer: 1, turnover: {} };
  return { qc: 0, trainer: 0, turnover: {} };
};

const loadManual = (bpo: string): Manual => {
  const fallback = defaultManual(bpo);
  try {
    // Values typed before the TIN → NSI rename were saved under the old name.
    const raw = localStorage.getItem(manualKey(bpo)) ?? (bpoKey(bpo) === 'NSI' ? localStorage.getItem('weekly-export-headcount:TIN') : null);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      qc: Number.isFinite(parsed.qc) ? parsed.qc : fallback.qc,
      trainer: Number.isFinite(parsed.trainer) ? parsed.trainer : fallback.trainer,
      turnover: parsed.turnover && typeof parsed.turnover === 'object' ? parsed.turnover : {},
    };
  } catch {
    return fallback;
  }
};

const loadTl = (bpo: string, weekStart: string): Record<string, number> => {
  try {
    const raw = localStorage.getItem(tlKey(bpo, weekStart));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/** One column of the deck: a calendar week or a calendar month, newest last. */
type ExportCol = { rows: AgentKPI[]; label: string; start: string; end: string };
type PeriodMode = 'weekly' | 'monthly';

const localDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** The Thursday decides which month (and year) a week belongs to. */
const thursdayOf = (iso: string) => {
  const d = localDate(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3);
};
const enMonth = (d: Date, style: 'short' | 'long') => d.toLocaleString('en-US', { month: style });

type Props = {
  weekCompare: WeekCompare | null;
  weekRanges: CalendarWeek[];
  weekData: AgentKPI[][];
  monthRanges: MonthRange[];
  monthData: AgentKPI[][];
};

const inputClass = 'h-8 w-16 rounded-md border border-border bg-surface px-2 text-xs text-text-primary tabular-nums';
const buttonClass =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[11px] font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:opacity-50';

export const WeeklyExport: React.FC<Props> = ({ weekCompare, weekRanges, weekData, monthRanges, monthData }) => {
  const selectedBpo = useStore((s) => s.selectedBpo);
  const [mode, setMode] = useState<CsatMode>('full');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('weekly');
  const [previews, setPreviews] = useState<Record<string, { url: string; blob: Blob; lines: string[] } | 'error'>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // Slides whose template has no Highlight box get the text drawn into the picture; the rest can opt in.
  const [hlInImage, setHlInImage] = useState<Record<string, boolean>>({});
  const [withHeadline, setWithHeadline] = useState(true);
  const [layout, setLayout] = useState<'slide' | 'content'>('slide');
  // Empty title = the default for the chosen period ("Weekly Review" / "Monthly Review").
  const [opening, setOpening] = useState({
    title: '',
    subtitle: 'KPI Performance',
    slides: ['Slide 3', 'Slide 4', 'Slide 5–10', 'Slide 11+', '–'],
  });
  const [frameText, setFrameText] = useState<Record<string, { section?: string; title?: string }>>({});
  const [manual, setManual] = useState<Manual>(() => loadManual(selectedBpo));
  const [tlAnalyzed, setTlAnalyzed] = useState<Record<string, number>>({});

  useEffect(() => {
    setManual(loadManual(selectedBpo));
  }, [selectedBpo]);

  const updateManual = (next: Manual) => {
    setManual(next);
    try {
      localStorage.setItem(manualKey(selectedBpo), JSON.stringify(next));
    } catch {
      /* private mode: keep it in memory only */
    }
  };

  // Same rule as the CSAT Room: the smallest BPO views show fewer categories and agents.
  const isSmallBpo = isSmallBpoName(selectedBpo || '');
  const topCatsLimit = isSmallBpo ? 5 : 10;
  const topAgentsLimit = isSmallBpo ? 2 : 5;
  const bpoLabel = selectedBpo && selectedBpo !== 'All BPO' ? `AFI ${canonicalBpoName(selectedBpo)}` : 'AFI';

  // Chronological columns (oldest → newest): the last four weeks, or the last four months, that have data.
  const cols = useMemo<ExportCol[] | null>(() => {
    if (periodMode === 'monthly') {
      const list = monthRanges
        .map((m, i) => ({ rows: monthData[i] ?? [], label: m.label, start: m.start, end: m.end }))
        .filter((c) => c.rows.length > 0 && weekHasData(c.rows))
        .slice(-4);
      return list.length >= 2 ? list : null;
    }
    if (!weekCompare) return null;
    const list = weekCompare.sets
      .map((rows, i) => ({ rows, label: weekCompare.labels[i], week: weekCompare.weeks[i] }))
      .filter((c): c is { rows: AgentKPI[]; label: string; week: CalendarWeek } => c.week !== null)
      .map((c) => ({ rows: c.rows, label: c.label, start: c.week.start, end: c.week.end }))
      .reverse();
    return list.length >= 2 ? list : null;
  }, [periodMode, weekCompare, monthRanges, monthData]);

  const latestWeekStart = cols ? cols[cols.length - 1].start : '';
  useEffect(() => {
    setTlAnalyzed(latestWeekStart ? loadTl(selectedBpo, latestWeekStart) : {});
  }, [selectedBpo, latestWeekStart]);

  const updateTl = (name: string, value: number | null) => {
    const next = { ...tlAnalyzed };
    if (value === null) delete next[name];
    else next[name] = value;
    setTlAnalyzed(next);
    try {
      localStorage.setItem(tlKey(selectedBpo, latestWeekStart), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const tlRows = useMemo(
    () => (cols ? dsatByTeamLeader(cols[cols.length - 1].rows, mode) : []),
    [cols, mode],
  );

  const slides = useMemo<Slide[] | null>(() => {
    if (!cols) return null;
    const weeks: SlideWeek[] = cols.map((c) => ({ label: c.label, span: formatWeekSpan(c.start, c.end) }));
    const modeLabel = mode === 'full' ? 'Data penuh' : 'After Takeout';
    const year = String(thursdayOf(cols[cols.length - 1].start).getFullYear());
    const range = `${cols[0].label} – ${cols[cols.length - 1].label} ${year}`;
    const subtitle = `${modeLabel} · ${range}`;
    const hdOn = withHeadline;
    const last = cols[cols.length - 1];
    const prevCol = cols[cols.length - 2];

    // KPI numbers of the latest week (and the one before it), shared by slides 1, 2 and 4.
    const lastStats = calculatePeriodStats(last.rows);
    const prevStats = calculatePeriodStats(prevCol.rows);
    const kpiItems = REPORT_METRICS.map((metric) => {
      const v = lastStats[metric.key] ?? 0;
      return {
        label: metric.label,
        text: formatMetricValue(metric, v),
        miss: metric.kpiType !== null && getKpiStatus(v, metric.kpiType) === 'miss',
        hasTarget: metric.target !== null,
        delta: metric.kind === 'count' ? null : v - (prevStats[metric.key] ?? 0),
      };
    });

    // Overview: every week of the selected period that has data (as in the dashboard report), or the months.
    const overviewCols: ReportColumn[] =
      periodMode === 'monthly'
        ? cols.map((c) => ({
            key: c.start,
            label: c.label,
            sublabel: formatWeekSpan(c.start, c.end),
            title: `${c.start} - ${c.end}`,
            start: c.start,
            end: c.end,
            stats: calculatePeriodStats(c.rows),
          }))
        : weekRanges
            .map((week, i) => ({ week, rows: weekData[i] }))
            .filter((w) => w.rows && weekHasData(w.rows))
            .map(({ week, rows }) => ({
              key: `w${week.index}`,
              label: `W${week.index}`,
              sublabel: formatWeekSpan(week.start, week.end),
              title: `${week.start} - ${week.end}`,
              start: week.start,
              end: week.end,
              stats: calculatePeriodStats(rows),
            }));

    // Period wording used by titles, the cover and the agenda.
    const lastThu = thursdayOf(last.start);
    const monthEn = enMonth(lastThu, 'long');
    const periodText = deckRange(last.start, last.end, true);
    const periodTitle = periodMode === 'monthly' ? `${monthEn} ${lastThu.getFullYear()}` : periodText;
    const badgeText =
      periodMode === 'monthly'
        ? `${monthEn} ${lastThu.getFullYear()}`
        : `Week ${Math.ceil(lastThu.getDate() / 7)} · ${enMonth(lastThu, 'short')}`;
    const eyebrow = periodMode === 'monthly' ? 'REVIEW BULANAN' : 'REVIEW MINGGUAN';
    const defaultTitle = periodMode === 'monthly' ? 'Monthly Review' : 'Weekly Review';

    const lastTurnoverValue = manual.turnover[last.start];
    const turnoverTitle =
      lastTurnoverValue === undefined
        ? `Headcount CS ${bpoLabel}`
        : `“${String(lastTurnoverValue)}% turn over for ${periodTitle}”`;
    const capRange = `${bpoLabel} · ${range}`;
    const capMode = `${bpoLabel} · ${subtitle}`;
    const capLast = `${bpoLabel} · ${modeLabel} · ${last.label} (${formatWeekSpan(last.start, last.end)})`;
    // The takeout simulation always looks at the last three months with data.
    const simMonths = monthRanges
      .map((m, i) => ({ m, rows: monthData[i] ?? [] }))
      .filter((x) => x.rows.length > 0)
      .slice(-3);
    const capMonths = simMonths.length
      ? `${bpoLabel} · ${simMonths[0].m.label} – ${simMonths[simMonths.length - 1].m.label} ${simMonths[simMonths.length - 1].m.end.slice(0, 4)}`
      : bpoLabel;

    const list: Slide[] = [];
    const scopeText = bpoLabel.replace(/^AFI\s*/, 'AFI - ') || 'AFI';

    const noFrame = { section: '', titleText: '', caption: '', templateHasHighlight: false, standalone: true as const };
    list.push({
      id: 'cover',
      no: 1,
      title: 'Cover',
      file: 'slide-01-cover',
      ...noFrame,
      render: async () =>
        done(renderCoverSlide({ title: opening.title.trim() || defaultTitle, subtitle: opening.subtitle, scope: scopeText, period: periodText, week: badgeText, eyebrow }), []),
    });
    list.push({
      id: 'agenda',
      no: 2,
      title: 'Daftar isi',
      file: 'slide-02-daftar-isi',
      ...noFrame,
      render: async () =>
        done(
          renderAgendaSlide({
            title: 'Daftar Isi',
            scope: scopeText,
            period: periodText,
            week: badgeText,
            eyebrow: periodMode === 'monthly' ? 'MONTHLY REVIEW' : 'WEEKLY REVIEW',
            rows: [
              { name: 'Headcount', description: 'Agent, TL, QC, dan turn over', slides: opening.slides[0] },
              { name: 'Overview', description: 'Ringkasan KPI mingguan terhadap target', slides: opening.slides[1] },
              { name: 'KPI Performance', description: 'CSAT, DSAT, TL, top agent, dan takeout', slides: opening.slides[2] },
              { name: 'QA Performance', description: 'Skor QA dan temuan', slides: opening.slides[3] },
              { name: 'L&D', description: 'Training, coaching, dan pengembangan', slides: opening.slides[4] },
            ],
          }),
          [],
        ),
    });

    list.push({
      id: 'headcount',
      no: 3,
      title: 'Headcount & Turn Over',
      file: 'slide-03-headcount',
      templateHasHighlight: true,
      section: 'Headcount',
      titleText: turnoverTitle,
      caption: capRange,
      render: (inImage, bare) => {
        const counts = cols.map((c) => headcountStats(c.rows));
        const turnover: (number | null)[] = cols.map((c) => manual.turnover[c.start] ?? null);
        const lines = headcountHighlights(
          bpoLabel,
          cols.map((c, i) => ({ label: c.label, agents: counts[i].agents, teamLeaders: counts[i].teamLeaders, turnover: turnover[i] })),
          manual.qc,
          manual.trainer,
          TURNOVER_THRESHOLD,
        );
        return done(renderHeadcountSlide({
          bare,
          title: `Headcount CS ${bpoLabel}`,
          subtitle: range,
          headline: hdOn ? headcountHeadline(last.label, counts[counts.length - 1].agents, turnover[turnover.length - 1], TURNOVER_THRESHOLD) : undefined,
          threshold: TURNOVER_THRESHOLD,
          columns: cols.map((_, i) => ({
            ...weeks[i],
            teamLeaders: counts[i].teamLeaders,
            agents: counts[i].agents,
            trainer: manual.trainer,
            qc: manual.qc,
            turnover: turnover[i],
          })),
          highlights: inImage ? lines : undefined,
        }), lines);
      },
    });

    if (overviewCols.length >= 2) {
      list.push({
        id: 'overview',
        no: 4,
        title: 'Overview: Weekly Performance Report',
        file: 'slide-04-overview',
        templateHasHighlight: false,
        section: 'Overview',
        titleText: `KPI Achievements for ${periodMode === 'monthly' ? periodTitle : deckRange(last.start, last.end, false)}`,
        caption: capRange,
        render: (inImage, bare) => {
          const lastCol = overviewCols[overviewCols.length - 1];
          const prevOverview = overviewCols[overviewCols.length - 2];
          const lines = overviewHighlights(lastCol.label, prevOverview.label, kpiItems);
          return done(
            renderTableSlide({
            ...buildReportSlideModel({
              title: periodMode === 'monthly' ? 'Monthly Performance Report' : 'Weekly Performance Report',
              columns: overviewCols,
              deltaTo: overviewCols.length - 1,
              deltaFrom: overviewCols.length - 2,
              note: periodMode === 'monthly'
                ? 'Bulan kalender: tanggal 1 sampai akhir bulan.'
                : 'Minggu kalender Senin–Minggu; minggu pertama dan terakhir bisa mencakup tanggal bulan sebelum/sesudahnya, jadi jumlah semua minggu tidak selalu sama dengan total bulan.',
              headline: hdOn ? overviewHeadline(lastCol.label, kpiItems) ?? undefined : undefined,
              highlights: inImage ? lines : undefined,
            }),
            bare,
            }),
            lines,
          );
        },
      });
    }

    list.push({
      id: 'positive-rate',
      no: 5,
      title: 'Positive Rate Before & After Takeout',
      file: 'slide-05-positive-rate',
      templateHasHighlight: true,
      section: 'KPI - CSAT',
      titleText: 'Positive Rate Before & After Takeout',
      caption: capRange,
      render: (inImage, bare) => {
        const rates = cols.map((c) => positiveRates(c.rows));
        const lines = positiveRateHighlights(cols.map((c, i) => ({ label: c.label, ...rates[i] })), { full: 75, fair: 92 });
        return done(renderPositiveRateSlide({
          bare,
          title: 'Positive Rate Before & After Takeout',
          subtitle: `CSAT SC · ${range}`,
          headline: hdOn ? positiveRateHeadline(cols.map((c, i) => ({ label: c.label, ...rates[i] })), { full: 75, fair: 92 }) ?? undefined : undefined,
          targets: { full: 75, fair: 92 },
          columns: cols.map((_, i) => ({ ...weeks[i], ...rates[i] })),
          highlights: inImage ? lines : undefined,
        }), lines);
      },
    });

    list.push({
      id: 'respondents',
      no: 6,
      title: 'Respondents',
      file: 'slide-06-respondents',
      templateHasHighlight: true,
      section: 'KPI - CSAT',
      titleText: 'Respondents',
      caption: capMode,
      render: (inImage, bare) => {
        const stats = cols.map((c) => respondentStats(c.rows, mode));
        const daily = dailyRespondents(last.rows, mode).map((p) => ({ ...p, label: formatDay(p.date) }));
        const lines = respondentHighlights(cols.map((c, i) => ({ label: c.label, respondents: stats[i].respondents, rate: stats[i].rate })), daily);
        return done(renderRespondentsSlide({
          bare,
          title: 'Respondents',
          subtitle,
          headline: hdOn ? respondentHeadline(cols.map((c, i) => ({ label: c.label, respondents: stats[i].respondents, rate: stats[i].rate }))) ?? undefined : undefined,
          columns: cols.map((_, i) => ({
            ...weeks[i],
            stats: stats[i],
            deltaFromPrevious: i > 0 ? stats[i].respondents - stats[i - 1].respondents : null,
          })),
          daily: { title: `Daily Respondents (${last.label})`, points: daily },
          highlights: inImage ? lines : undefined,
        }), lines);
      },
    });

    list.push({
      id: 'categories',
      no: 7,
      title: 'Breakdown Category DSAT',
      file: 'slide-07-breakdown-category',
      templateHasHighlight: false,
      section: 'DSAT',
      titleText: 'Breakdown Category DSAT WTW',
      caption: capMode,
      render: (inImage, bare) => {
        const tops = cols.map((c) => topBadCategories(c.rows, mode, topCatsLimit));
        const totals = cols.map((c) => badCategoryTotals(c.rows, mode));
        const lines = categoryHighlights(cols.map((c, i) => ({ label: c.label, top: tops[i], totalBad: totals[i].total, takeoutBad: totals[i].takeout })));
        return done(renderCategoriesSlide({
          bare,
          title: 'Top Categories (Score 1 & 2)',
          subtitle,
          headline: hdOn ? categoryHeadline(cols.map((c, i) => ({ label: c.label, top: tops[i], totalBad: totals[i].total, takeoutBad: totals[i].takeout }))) ?? undefined : undefined,
          columns: cols.map((_, i) => ({ ...weeks[i], rows: tops[i] })),
          highlights: inImage ? lines : undefined,
        }), lines);
      },
    });

    list.push({
      id: 'tl-sampling',
      no: 8,
      title: 'Analyzed DSAT by TL %',
      file: 'slide-08-analyzed-dsat-by-tl',
      templateHasHighlight: true,
      section: 'DSAT',
      titleText: 'Analyzed DSAT by TL %',
      caption: capLast,
      render: (inImage, bare) => {
        const rows = tlRows.map((t) => ({ name: t.name, dsat: t.dsat, topCategories: t.topCategories, analyzed: tlAnalyzed[t.name] ?? null }));
        const lines = tlSamplingHighlights(last.label, rows);
        return done(renderTlSamplingSlide({
          bare,
          title: 'Analyzed DSAT by TL %',
          subtitle: `${modeLabel} · ${last.label} (${formatWeekSpan(last.start, last.end)})`,
          headline: hdOn ? tlHeadline(last.label, rows) ?? undefined : undefined,
          rows,
          highlights: inImage ? lines : undefined,
        }), lines);
      },
    });

    list.push({
      id: 'agents',
      no: 9,
      title: 'Top 5 Agent Bottom CSAT',
      file: 'slide-09-top-agent-bottom-csat',
      templateHasHighlight: false,
      section: 'DSAT',
      titleText: 'TOP 5 Agent Bottom CSAT',
      caption: capMode,
      render: (inImage, bare) => {
        const agentCols = cols.map((c) => topBadAgents(c.rows, mode, topAgentsLimit));
        const lines = agentHighlights(cols.map((c, i) => ({ label: c.label, agents: agentCols[i] })));
        return done(renderAgentsSlide({
          bare,
          title: 'Agent Bottom Score 1–2',
          subtitle,
          headline: hdOn ? agentHeadline(cols.map((c, i) => ({ label: c.label, agents: agentCols[i] }))) ?? undefined : undefined,
          columns: cols.map((_, i) => ({
            ...weeks[i],
            agents: agentCols[i],
            repeatIds: i === cols.length - 1 && i > 0 ? new Set(agentCols[i - 1].map((a) => a.csId)) : undefined,
          })),
          highlights: inImage ? lines : undefined,
        }), lines);
      },
    });

    if (simMonths.length > 0) {
      list.push({
        id: 'takeout-sim',
        no: 10,
        title: 'Simulasi CSAT: tambahan kategori takeout',
        file: 'slide-10-simulasi-takeout',
        templateHasHighlight: false,
        section: 'Insight',
        titleText: 'Simulasi CSAT: tambahan kategori takeout',
        caption: capMonths,
        render: (inImage, bare) => {
          const months = simMonths.map((x) => ({ label: x.m.label, rows: takeoutScenarios(x.rows) }));
          const extraNames = EXTRA_TAKEOUT_CATEGORIES.map(prettyCategory).join(' dan ');
          const lines = takeoutSimHighlights(extraNames, months.map((m) => ({ label: m.label, rows: m.rows.map((r) => ({ label: r.label, a: r.a, b: r.b })) })), 92);
          return done(renderTakeoutSimSlide({
          bare,
            title: 'Simulasi CSAT SC: tambahan kategori takeout',
            subtitle: capMonths.replace(`${bpoLabel} · `, ''),
            months,
            headline: hdOn ? takeoutSimHeadline(months.map((m) => ({ rows: m.rows.map((r) => ({ label: r.label, a: r.a, b: r.b })) })), 92) ?? undefined : undefined,
            highlights: inImage ? lines : undefined,
          }), lines);
        },
      });
    }
    return list;
  }, [cols, mode, topCatsLimit, topAgentsLimit, withHeadline, opening, periodMode, manual, bpoLabel, weekRanges, weekData, monthRanges, monthData, tlRows, tlAnalyzed]);

  // Full-slide layout draws everything (including Highlight); the content-only layout leaves out Highlight
  // where the template already has its own editable box.
  const inImageFor = (slide: Slide) => hlInImage[slide.id] ?? (layout === 'slide' ? true : !slide.templateHasHighlight);
  const frameFor = (slide: Slide) => ({
    section: frameText[slide.id]?.section ?? slide.section,
    title: frameText[slide.id]?.title ?? slide.titleText,
  });

  // Render previews whenever the data or the view changes.
  useEffect(() => {
    if (!slides) {
      setPreviews({});
      return;
    }
    let cancelled = false;
    const urls: string[] = [];
    setPreviews({});
    (async () => {
      for (const slide of slides) {
        try {
          const rendered = await slide.render(inImageFor(slide), layout === 'slide');
          const blob = layout === 'slide' && !slide.standalone
            ? await composeFullSlide({ ...frameFor(slide), caption: slide.caption, content: rendered.blob, no: slide.no })
            : rendered.blob;
          const { lines } = rendered;
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setPreviews((prev) => ({ ...prev, [slide.id]: { url, blob, lines } }));
        } catch {
          if (!cancelled) setPreviews((prev) => ({ ...prev, [slide.id]: 'error' }));
        }
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [slides, hlInImage, layout, frameText]);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage((m) => (m === text ? '' : m)), 2500);
  };

  const download = (slide: Slide) => {
    const p = previews[slide.id];
    if (p && p !== 'error') downloadBlob(`${slide.file}.png`, p.blob);
  };

  const copyBlob = async (slide: Slide) => {
    const p = previews[slide.id];
    if (!p || p === 'error') return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': p.blob })]);
      flash('Gambar tersalin');
    } catch {
      flash('Browser menolak menyalin, pakai Unduh');
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash('Teks tersalin');
    } catch {
      flash('Browser menolak menyalin teks');
    }
  };

  const copyHighlight = async (slide: Slide) => {
    const p = previews[slide.id];
    if (!p || p === 'error' || p.lines.length === 0) return;
    await copyText(p.lines.map((l) => `• ${l}`).join('\n'));
  };

  const downloadAll = async () => {
    if (!slides) return;
    setBusy(true);
    for (const slide of slides) {
      download(slide);
      await new Promise((r) => setTimeout(r, 400));
    }
    setBusy(false);
  };

  if (!cols || !slides) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-text-primary">Ekspor Slide</h1>
        <EmptyState
          variant="filter"
          title={periodMode === 'monthly' ? 'Belum ada bulan yang bisa dibandingkan' : 'Belum ada minggu yang bisa dibandingkan'}
          description={periodMode === 'monthly' ? 'Pilih bulan di filter Periode dan pastikan data minimal dua bulan sudah ada.' : 'Pilih rentang lebih dari satu minggu (misalnya Bulan Ini) dan pastikan data CSAT untuk minimal dua minggu sudah ada.'}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Ekspor Slide</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-text-muted">
            Gambar slide dari data yang sama dengan dashboard. Weekly memakai empat minggu kalender terakhir (Week 1 = minggu pertama yang kamisnya jatuh di bulan itu), Monthly memakai empat bulan terakhir. Nomor slide mengikuti deck.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<PeriodMode>
            aria-label="Periode laporan"
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
            value={periodMode}
            onChange={setPeriodMode}
          />
          <SegmentedControl<'slide' | 'content'>
            aria-label="Bentuk gambar"
            options={[
              { value: 'slide', label: 'Slide penuh' },
              { value: 'content', label: 'Isi saja' },
            ]}
            value={layout}
            onChange={setLayout}
          />
          <SegmentedControl<CsatMode>
            aria-label="Jenis data CSAT"
            options={[
              { value: 'full', label: 'Data penuh' },
              { value: 'fair', label: 'After Takeout' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <button type="button" onClick={downloadAll} disabled={busy} className={buttonClass}>
            <Download className="h-3.5 w-3.5" />
            Unduh semua
          </button>
          {message && <span className="text-xs font-medium text-text-muted" role="status">{message}</span>}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-3">
        <label className="mr-5 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-text-primary">
          <input
            id="weekly-export-headline"
            type="checkbox"
            checked={withHeadline}
            onChange={(e) => setWithHeadline(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Sertakan kalimat kesimpulan di atas slide
        </label>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Slide 3 · Headcount (isi manual)</span>
          <label htmlFor="weekly-export-qc" className="inline-flex items-center gap-1.5">
            QC
            <input id="weekly-export-qc" type="number" min={0} value={manual.qc} className={inputClass}
              onChange={(e) => updateManual({ ...manual, qc: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label htmlFor="weekly-export-trainer" className="inline-flex items-center gap-1.5">
            Trainer
            <input id="weekly-export-trainer" type="number" min={0} value={manual.trainer} className={inputClass}
              onChange={(e) => updateManual({ ...manual, trainer: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          {cols.map((c) => (
            <label key={c.start} htmlFor={`weekly-export-turnover-${c.start}`} className="inline-flex items-center gap-1.5">
              Turn over {c.label} (%)
              <input id={`weekly-export-turnover-${c.start}`} type="number" min={0} step={0.1}
                value={manual.turnover[c.start] ?? ''} className={inputClass} placeholder="–"
                onChange={(e) => {
                  const next = { ...manual.turnover };
                  if (e.target.value === '') delete next[c.start];
                  else next[c.start] = Math.max(0, Number(e.target.value) || 0);
                  updateManual({ ...manual, turnover: next });
                }} />
            </label>
          ))}
        </div>

        <div className="space-y-1.5 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">
            Slide 8 · jumlah DSAT yang dianalisis TL di {cols[cols.length - 1].label} (isi manual, kosongkan kalau belum ada sampling)
          </span>
          {tlRows.length === 0 ? (
            <p className="text-text-muted">Tidak ada DSAT di minggu ini.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {tlRows.map((t, i) => (
                <label key={t.name} htmlFor={`weekly-export-tl-${i}`} className="inline-flex items-center gap-1.5">
                  {t.name} <span className="text-text-muted">(DSAT {t.dsat})</span>
                  <input id={`weekly-export-tl-${i}`} type="number" min={0} max={t.dsat}
                    value={tlAnalyzed[t.name] ?? ''} className={inputClass} placeholder="–"
                    onChange={(e) => updateTl(t.name, e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))} />
                </label>
              ))}
            </div>
          )}
        </div>

      </div>

      <div className="grid grid-cols-1 gap-5">
        {slides.map((slide) => {
          const p = previews[slide.id];
          const ready = p && p !== 'error';
          return (
            <section key={slide.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold text-text-primary">Slide {slide.no} · {slide.title}</h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  {!slide.standalone && (
                  <label htmlFor={`weekly-export-hl-${slide.id}`} className="mr-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-text-secondary"
                    title={slide.templateHasHighlight ? 'Template-mu sudah punya kotak Highlight yang bisa diedit' : 'Template-mu tidak punya kotak Highlight di slide ini'}>
                    <input id={`weekly-export-hl-${slide.id}`} type="checkbox" checked={inImageFor(slide)}
                      onChange={(e) => setHlInImage((prev) => ({ ...prev, [slide.id]: e.target.checked }))}
                      className="h-3.5 w-3.5 accent-primary" />
                    Highlight di gambar
                  </label>
                  )}
                  {!slide.standalone && (
                  <button type="button" onClick={() => copyHighlight(slide)} disabled={!ready} className={buttonClass}>
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    Salin teks Highlight
                  </button>
                  )}
                  <button type="button" onClick={() => download(slide)} disabled={!ready} className={buttonClass}>
                    <Download className="h-3.5 w-3.5" />
                    Unduh PNG
                  </button>
                  <button type="button" onClick={() => copyBlob(slide)} disabled={!ready} className={buttonClass}>
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    Salin
                  </button>
                </div>
              </header>
              {layout === 'slide' && !slide.standalone && (
                <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-[11px] text-text-secondary">
                  <label htmlFor={`weekly-export-tab-${slide.id}`} className="inline-flex items-center gap-1.5">
                    Tab
                    <input id={`weekly-export-tab-${slide.id}`} type="text" value={frameFor(slide).section}
                      onChange={(e) => setFrameText((prev) => ({ ...prev, [slide.id]: { ...prev[slide.id], section: e.target.value } }))}
                      className="h-7 w-36 rounded-md border border-border bg-surface px-2 text-xs text-text-primary" />
                  </label>
                  <label htmlFor={`weekly-export-title-${slide.id}`} className="inline-flex min-w-0 flex-1 items-center gap-1.5">
                    Judul di bar merah
                    <input id={`weekly-export-title-${slide.id}`} type="text" value={frameFor(slide).title}
                      onChange={(e) => setFrameText((prev) => ({ ...prev, [slide.id]: { ...prev[slide.id], title: e.target.value } }))}
                      className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-text-primary" />
                  </label>
                </div>
              )}
              {slide.id === 'cover' && (
                <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-[11px] text-text-secondary">
                  <label htmlFor="weekly-export-cover-title" className="inline-flex items-center gap-1.5">
                    Judul
                    <input id="weekly-export-cover-title" type="text" value={opening.title} placeholder={periodMode === 'monthly' ? 'Monthly Review' : 'Weekly Review'}
                      onChange={(e) => setOpening((o) => ({ ...o, title: e.target.value }))}
                      className="h-7 w-44 rounded-md border border-border bg-surface px-2 text-xs text-text-primary" />
                  </label>
                  <label htmlFor="weekly-export-cover-subtitle" className="inline-flex items-center gap-1.5">
                    Subjudul
                    <input id="weekly-export-cover-subtitle" type="text" value={opening.subtitle}
                      onChange={(e) => setOpening((o) => ({ ...o, subtitle: e.target.value }))}
                      className="h-7 w-44 rounded-md border border-border bg-surface px-2 text-xs text-text-primary" />
                  </label>
                </div>
              )}
              {slide.id === 'agenda' && (
                <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-[11px] text-text-secondary">
                  {['Headcount', 'Overview', 'KPI Performance', 'QA Performance', 'L&D'].map((name, i) => (
                    <label key={name} htmlFor={`weekly-export-agenda-${i}`} className="inline-flex items-center gap-1.5">
                      {name}
                      <input id={`weekly-export-agenda-${i}`} type="text" value={opening.slides[i]}
                        onChange={(e) => setOpening((o) => ({ ...o, slides: o.slides.map((v, k) => (k === i ? e.target.value : v)) }))}
                        className="h-7 w-24 rounded-md border border-border bg-surface px-2 text-xs text-text-primary" />
                    </label>
                  ))}
                </div>
              )}
              <div className="bg-white p-3">
                {ready ? (
                  <img src={p.url} alt={`Pratinjau ${slide.title}`} className="mx-auto block h-auto max-w-full" />
                ) : p === 'error' ? (
                  <p className="py-10 text-center text-xs text-text-muted">Gagal membuat gambar untuk slide ini.</p>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-16 text-xs text-text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Membuat gambar…
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

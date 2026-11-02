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
  renderSectionSummary,
  renderSnapshotChips,
  renderTakeoutSimSlide,
  renderTlSamplingSlide,
  type ChipTone,
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
import { canonicalBpoName, isSmallBpoName } from '../../lib/bpoNames';
import {
  REPORT_METRICS,
  buildReportSlideModel,
  calculatePeriodStats,
  formatMetricValue,
  formatWeekSpan,
  type ReportColumn,
} from '../../lib/weeklyReport';

type Slide = { id: string; no: number; title: string; file: string; render: () => Promise<Blob> };

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
type Manual = { qc: number; trainer: number; turnover: Record<string, number>; ldNote: string };
const TURNOVER_THRESHOLD = 5;
const bpoKey = (bpo: string) => canonicalBpoName(bpo || 'All BPO').toUpperCase();
const manualKey = (bpo: string) => `weekly-export-headcount:${bpoKey(bpo)}`;
const tlKey = (bpo: string, weekStart: string) => `weekly-export-tl:${bpoKey(bpo)}:${weekStart}`;

const defaultManual = (bpo: string): Manual => {
  const upper = canonicalBpoName(bpo || '').toUpperCase();
  if (upper === 'NSI') return { qc: 1, trainer: 0, turnover: {}, ldNote: '' };
  if (upper === 'TCID') return { qc: 2, trainer: 1, turnover: {}, ldNote: '' };
  return { qc: 0, trainer: 0, turnover: {}, ldNote: '' };
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
      ldNote: typeof parsed.ldNote === 'string' ? parsed.ldNote : '',
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
  const [previews, setPreviews] = useState<Record<string, { url: string; blob: Blob } | 'error'>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [withHighlights, setWithHighlights] = useState(true);
  const [withHeadline, setWithHeadline] = useState(true);
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

  // Chronological columns (oldest → newest) of the last four weeks with data.
  const cols = useMemo(() => {
    if (!weekCompare) return null;
    const list = weekCompare.sets
      .map((rows, i) => ({ rows, label: weekCompare.labels[i], week: weekCompare.weeks[i] }))
      .filter((c): c is { rows: AgentKPI[]; label: string; week: CalendarWeek } => c.week !== null)
      .reverse();
    return list.length >= 2 ? list : null;
  }, [weekCompare]);

  const latestWeekStart = cols ? cols[cols.length - 1].week.start : '';
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
    const weeks: SlideWeek[] = cols.map((c) => ({ label: c.label, span: formatWeekSpan(c.week.start, c.week.end) }));
    const modeLabel = mode === 'full' ? 'Data penuh' : 'After Takeout';
    const year = cols[cols.length - 1].week.end.slice(0, 4);
    const range = `${cols[0].label} – ${cols[cols.length - 1].label} ${year}`;
    const subtitle = `${modeLabel} · ${range}`;
    const hlOn = withHighlights;
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
    const toneOf = (value: number, type: 'csatFair' | 'qa'): ChipTone => {
      const st = getKpiStatus(value, type);
      return st === 'miss' ? 'bad' : st === 'watch' ? 'warn' : 'good';
    };
    const lastCounts = headcountStats(last.rows);
    const lastTurnover = manual.turnover[last.week.start] ?? 0;
    const signed = (d: number) => (d >= 0 ? `▲ +${d.toFixed(2)} poin` : `▼ ${Math.abs(d).toFixed(2)} poin`);

    // Overview: every week of the selected period that has data (as in the dashboard report).
    const overviewCols: ReportColumn[] = weekRanges
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

    const list: Slide[] = [];

    list.push({
      id: 'headcount',
      no: 3,
      title: 'Headcount & Turn Over',
      file: 'slide-03-headcount',
      render: () => {
        const counts = cols.map((c) => headcountStats(c.rows));
        const turnover = cols.map((c) => manual.turnover[c.week.start] ?? 0);
        return renderHeadcountSlide({
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
          highlights: hlOn
            ? headcountHighlights(
                bpoLabel,
                cols.map((c, i) => ({ label: c.label, agents: counts[i].agents, teamLeaders: counts[i].teamLeaders, turnover: turnover[i] })),
                manual.qc,
                manual.trainer,
                TURNOVER_THRESHOLD,
              )
            : undefined,
        });
      },
    });

    if (overviewCols.length >= 2) {
      list.push({
        id: 'overview',
        no: 4,
        title: 'Overview: Weekly Performance Report',
        file: 'slide-04-overview',
        render: () => {
          const lastCol = overviewCols[overviewCols.length - 1];
          const prevOverview = overviewCols[overviewCols.length - 2];
          return renderTableSlide(
            buildReportSlideModel({
              title: 'Weekly Performance Report',
              columns: overviewCols,
              deltaTo: overviewCols.length - 1,
              deltaFrom: overviewCols.length - 2,
              note: 'Minggu kalender Senin–Minggu; minggu pertama dan terakhir bisa mencakup tanggal bulan sebelum/sesudahnya, jadi jumlah semua minggu tidak selalu sama dengan total bulan.',
              headline: hdOn ? overviewHeadline(lastCol.label, kpiItems) ?? undefined : undefined,
              highlights: hlOn ? overviewHighlights(lastCol.label, prevOverview.label, kpiItems) : undefined,
            }),
          );
        },
      });
    }

    list.push({
      id: 'positive-rate',
      no: 5,
      title: 'Positive Rate Before & After Takeout',
      file: 'slide-05-positive-rate',
      render: () => {
        const rates = cols.map((c) => positiveRates(c.rows));
        return renderPositiveRateSlide({
          title: 'Positive Rate Before & After Takeout',
          subtitle: `CSAT SC · ${range}`,
          headline: hdOn ? positiveRateHeadline(cols.map((c, i) => ({ label: c.label, ...rates[i] })), { full: 75, fair: 92 }) ?? undefined : undefined,
          targets: { full: 75, fair: 92 },
          columns: cols.map((_, i) => ({ ...weeks[i], ...rates[i] })),
          highlights: hlOn
            ? positiveRateHighlights(cols.map((c, i) => ({ label: c.label, ...rates[i] })), { full: 75, fair: 92 })
            : undefined,
        });
      },
    });

    list.push({
      id: 'respondents',
      no: 6,
      title: 'Respondents',
      file: 'slide-06-respondents',
      render: () => {
        const stats = cols.map((c) => respondentStats(c.rows, mode));
        const daily = dailyRespondents(last.rows, mode).map((p) => ({ ...p, label: formatDay(p.date) }));
        return renderRespondentsSlide({
          title: 'Respondents',
          subtitle,
          headline: hdOn ? respondentHeadline(cols.map((c, i) => ({ label: c.label, respondents: stats[i].respondents, rate: stats[i].rate }))) ?? undefined : undefined,
          columns: cols.map((_, i) => ({
            ...weeks[i],
            stats: stats[i],
            deltaFromPrevious: i > 0 ? stats[i].respondents - stats[i - 1].respondents : null,
          })),
          daily: { title: `Daily Respondents (${last.label})`, points: daily },
          highlights: hlOn
            ? respondentHighlights(cols.map((c, i) => ({ label: c.label, respondents: stats[i].respondents, rate: stats[i].rate })), daily)
            : undefined,
        });
      },
    });

    list.push({
      id: 'categories',
      no: 7,
      title: 'Breakdown Category DSAT',
      file: 'slide-07-breakdown-category',
      render: () => {
        const tops = cols.map((c) => topBadCategories(c.rows, mode, topCatsLimit));
        const totals = cols.map((c) => badCategoryTotals(c.rows, mode));
        return renderCategoriesSlide({
          title: 'Top Categories (Score 1 & 2)',
          subtitle,
          headline: hdOn ? categoryHeadline(cols.map((c, i) => ({ label: c.label, top: tops[i], totalBad: totals[i].total, takeoutBad: totals[i].takeout }))) ?? undefined : undefined,
          columns: cols.map((_, i) => ({ ...weeks[i], rows: tops[i] })),
          highlights: hlOn
            ? categoryHighlights(cols.map((c, i) => ({ label: c.label, top: tops[i], totalBad: totals[i].total, takeoutBad: totals[i].takeout })))
            : undefined,
        });
      },
    });

    list.push({
      id: 'tl-sampling',
      no: 8,
      title: 'Analyzed DSAT by TL %',
      file: 'slide-08-analyzed-dsat-by-tl',
      render: () => {
        const rows = tlRows.map((t) => ({ name: t.name, dsat: t.dsat, topCategories: t.topCategories, analyzed: tlAnalyzed[t.name] ?? null }));
        return renderTlSamplingSlide({
          title: 'Analyzed DSAT by TL %',
          subtitle: `${modeLabel} · ${last.label} (${formatWeekSpan(last.week.start, last.week.end)})`,
          headline: hdOn ? tlHeadline(last.label, rows) ?? undefined : undefined,
          rows,
          highlights: hlOn ? tlSamplingHighlights(last.label, rows) : undefined,
        });
      },
    });

    list.push({
      id: 'agents',
      no: 9,
      title: 'Top 5 Agent Bottom CSAT',
      file: 'slide-09-top-agent-bottom-csat',
      render: () => {
        const agentCols = cols.map((c) => topBadAgents(c.rows, mode, topAgentsLimit));
        return renderAgentsSlide({
          title: 'Agent Bottom Score 1–2',
          subtitle,
          headline: hdOn ? agentHeadline(cols.map((c, i) => ({ label: c.label, agents: agentCols[i] }))) ?? undefined : undefined,
          columns: cols.map((_, i) => ({
            ...weeks[i],
            agents: agentCols[i],
            repeatIds: i === cols.length - 1 && i > 0 ? new Set(agentCols[i - 1].map((a) => a.csId)) : undefined,
          })),
          highlights: hlOn ? agentHighlights(cols.map((c, i) => ({ label: c.label, agents: agentCols[i] }))) : undefined,
        });
      },
    });

    if (monthRanges.length > 0 && monthData.length === monthRanges.length && monthData.some((m) => m.length > 0)) {
      list.push({
        id: 'takeout-sim',
        no: 10,
        title: 'Simulasi CSAT: tambahan kategori takeout',
        file: 'slide-10-simulasi-takeout',
        render: () => {
          const months = monthRanges.map((m, i) => ({ label: m.label, rows: takeoutScenarios(monthData[i]) }));
          const extraNames = EXTRA_TAKEOUT_CATEGORIES.map(prettyCategory).join(' dan ');
          return renderTakeoutSimSlide({
            title: 'Simulasi CSAT SC: tambahan kategori takeout',
            subtitle: `${monthRanges[0].label} – ${monthRanges[monthRanges.length - 1].label} ${monthRanges[monthRanges.length - 1].end.slice(0, 4)}`,
            months,
            headline: hdOn ? takeoutSimHeadline(months.map((m) => ({ rows: m.rows.map((r) => ({ label: r.label, a: r.a, b: r.b })) })), 92) ?? undefined : undefined,
            highlights: hlOn
              ? takeoutSimHighlights(extraNames, months.map((m) => ({ label: m.label, rows: m.rows.map((r) => ({ label: r.label, a: r.a, b: r.b })) })), 92)
              : undefined,
          });
        },
      });
    }
    const missed = kpiItems.filter((i) => i.hasTarget && i.miss);
    const totalTargets = kpiItems.filter((i) => i.hasTarget).length;
    const fairValue = lastStats.csatScFair ?? 0;
    const qaValue = lastStats.qa ?? 0;
    const intro: Slide[] = [
      {
        id: 'snapshot',
        no: 1,
        title: 'Ringkasan di bawah tanggal (judul)',
        file: 'slide-01-ringkasan',
        render: () =>
          renderSnapshotChips({
            caption: `Ringkasan ${last.label} · ${formatWeekSpan(last.week.start, last.week.end)}`,
            chips: [
              { label: 'Agent aktif', value: String(lastCounts.agents), note: `${lastCounts.teamLeaders} TL`, tone: 'neutral' },
              {
                label: 'CSAT SC After Takeout',
                value: `${fairValue.toFixed(2)}%`,
                note: signed(fairValue - (prevStats.csatScFair ?? 0)),
                tone: toneOf(fairValue, 'csatFair'),
              },
              { label: 'QA Score', value: `${qaValue.toFixed(2)}%`, note: signed(qaValue - (prevStats.qa ?? 0)), tone: toneOf(qaValue, 'qa') },
            ],
          }),
      },
      {
        id: 'toc-summary',
        no: 2,
        title: 'Status per bagian (daftar isi)',
        file: 'slide-02-status-bagian',
        render: () =>
          renderSectionSummary({
            rows: [
              {
                section: 'Headcount',
                headline: `${lastCounts.agents} agent, ${lastCounts.teamLeaders} TL`,
                detail: `Turn over ${String(lastTurnover)}% (batas ${TURNOVER_THRESHOLD}%)`,
                tone: lastTurnover > TURNOVER_THRESHOLD ? 'bad' : 'good',
              },
              {
                section: 'Overview',
                headline: missed.length === 0 ? 'Semua KPI tercapai' : `${missed.length} dari ${totalTargets} KPI di bawah target`,
                detail: missed.length === 0 ? 'Tidak ada KPI di bawah target' : missed.slice(0, 2).map((m) => m.label).join(', '),
                tone: missed.length === 0 ? 'good' : missed.length <= 3 ? 'warn' : 'bad',
              },
              {
                section: 'KPI Performance',
                headline: `After Takeout ${fairValue.toFixed(2)}%`,
                detail: `Target 92% · responden ${respondentStats(last.rows, mode).respondents}`,
                tone: toneOf(fairValue, 'csatFair'),
              },
              {
                section: 'QA Performance',
                headline: `QA Score ${qaValue.toFixed(2)}%`,
                detail: 'Target 92%',
                tone: toneOf(qaValue, 'qa'),
              },
              {
                section: 'L&D',
                headline: manual.ldNote.trim() || 'Belum ada catatan',
                detail: 'Diisi manual',
                tone: 'neutral',
              },
            ],
          }),
      },
    ];
    return [...intro, ...list];
  }, [cols, mode, topCatsLimit, topAgentsLimit, withHighlights, withHeadline, manual, bpoLabel, weekRanges, weekData, monthRanges, monthData, tlRows, tlAnalyzed]);

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
          const blob = await slide.render();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setPreviews((prev) => ({ ...prev, [slide.id]: { url, blob } }));
        } catch {
          if (!cancelled) setPreviews((prev) => ({ ...prev, [slide.id]: 'error' }));
        }
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [slides]);

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
        <h1 className="text-xl font-bold text-text-primary">Ekspor Weekly</h1>
        <EmptyState
          variant="filter"
          title="Belum ada minggu yang bisa dibandingkan"
          description="Pilih rentang lebih dari satu minggu (misalnya Bulan Ini) dan pastikan data CSAT untuk minimal dua minggu sudah ada."
        />
      </div>
    );
  }

  const lastWeek = cols[cols.length - 1].week;
  const lastTurnover = manual.turnover[lastWeek.start] ?? 0;
  const titleTexts = [
    { id: 'title-1', label: 'Slide 1 · tanggal', text: deckRange(lastWeek.start, lastWeek.end, true) },
    { id: 'title-3', label: 'Slide 3 · judul', text: `“${String(lastTurnover).replace('.', ',')}% turn over for ${deckRange(lastWeek.start, lastWeek.end, true)}”` },
    { id: 'title-4', label: 'Slide 4 · judul', text: `KPI Achievements for ${deckRange(lastWeek.start, lastWeek.end, false)}` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Ekspor Weekly</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-text-muted">
            Gambar siap tempel ke PowerPoint dari data yang sama dengan dashboard, memakai empat minggu kalender terakhir yang punya data. Nomor slide mengikuti deck.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-text-primary">
          <input
            id="weekly-export-highlights"
            type="checkbox"
            checked={withHighlights}
            onChange={(e) => setWithHighlights(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Sertakan kotak Highlight di gambar
        </label>

        <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <label htmlFor="weekly-export-ld" className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-text-primary">Slide 2 · catatan L&D</span>
            <input id="weekly-export-ld" type="text" value={manual.ldNote} placeholder="mis. 2 sesi coaching"
              className="h-8 w-56 rounded-md border border-border bg-surface px-2 text-xs text-text-primary"
              onChange={(e) => updateManual({ ...manual, ldNote: e.target.value })} />
          </label>
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
            <label key={c.week.start} htmlFor={`weekly-export-turnover-${c.week.start}`} className="inline-flex items-center gap-1.5">
              Turn over {c.label} (%)
              <input id={`weekly-export-turnover-${c.week.start}`} type="number" min={0} step={0.1}
                value={manual.turnover[c.week.start] ?? 0} className={inputClass}
                onChange={(e) =>
                  updateManual({ ...manual, turnover: { ...manual.turnover, [c.week.start]: Math.max(0, Number(e.target.value) || 0) } })
                } />
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

        <div className="space-y-1.5 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Teks judul untuk ditempel di PowerPoint</span>
          <div className="flex flex-wrap gap-2">
            {titleTexts.map((t) => (
              <button key={t.id} type="button" onClick={() => copyText(t.text)} className={buttonClass} title={t.text}>
                <ClipboardCopy className="h-3.5 w-3.5" />
                {t.label}: {t.text}
              </button>
            ))}
          </div>
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
                <div className="flex items-center gap-1.5">
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

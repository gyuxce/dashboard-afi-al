import { getOfficialCsatAggregate, type AgentKPI } from './dataProcessor';
import { formatNum, getKpiStatus, type KpiType } from './utils';
import type { SlideModel } from './slideExport';

/**
 * Numbers and layout behind the Weekly Performance Report, shared by the dashboard panel and the
 * weekly slide export so both always show the same thing.
 */

export type PeriodStats = Record<string, number>;

export const calculatePeriodStats = (dataset: AgentKPI[]): PeriodStats => {
  let totalProd = 0, sumManDays = 0, sumSla1m = 0, sumSla3m = 0, sumWhu = 0;
  let sumCsatScFull = 0, countCsatScFull = 0, sumCsatScFair = 0, countCsatScFair = 0;
  let sumQa = 0, countQa = 0, sla1mCount = 0, sla3mCount = 0, whuCount = 0, attPresence = 0, attDuty = 0;
  const officialCsat = getOfficialCsatAggregate(dataset);

  dataset.forEach((d) => {
    totalProd += d.productivityTotal;
    sumManDays += d.manDays;
    if (d.sla1m !== null) { sumSla1m += d.sla1m; sla1mCount++; }
    if (d.sla3m !== null) { sumSla3m += d.sla3m; sla3mCount++; }
    if (d.whu !== null) { sumWhu += d.whu; whuCount++; }
    sumCsatScFull += d.csatScGoodCount || 0;
    countCsatScFull += d.csatScTotalValid || 0;
    sumCsatScFair += d.csatScFairGoodCount || 0;
    countCsatScFair += d.csatScFairTotalValid || 0;
    sumQa += d.qaScoreSum;
    countQa += d.qaScoreCount;
    attPresence += d.attendancePresence || 0;
    attDuty += d.attendanceDuty || 0;
  });

  return {
    productivity: totalProd,
    avgProductivity: sumManDays > 0 ? totalProd / sumManDays : 0,
    csat: officialCsat.score || 0,
    csatPercent: officialCsat.score !== null ? (officialCsat.score / 5) * 100 : 0,
    csatScFull: countCsatScFull > 0 ? (sumCsatScFull / countCsatScFull) * 100 : 0,
    csatScFullCount: countCsatScFull,
    csatScFair: countCsatScFair > 0 ? (sumCsatScFair / countCsatScFair) * 100 : 0,
    csatScFairCount: countCsatScFair,
    sla1m: sla1mCount > 0 ? sumSla1m / sla1mCount : 0,
    sla3m: sla3mCount > 0 ? sumSla3m / sla3mCount : 0,
    whu: whuCount > 0 ? sumWhu / whuCount : 0,
    qa: countQa > 0 ? sumQa / countQa : 0,
    attendance: attDuty > 0 ? (attPresence / attDuty) * 100 : 0,
    agentsCount: dataset.length,
  };
};

export type ReportColumn = {
  key: string;
  label: string;
  /** Small second line under the label (e.g. "5–11 Okt"). */
  sublabel?: string;
  /** Tooltip with the exact date range. */
  title: string;
  /** ISO dates of the period, used for the exported slide's range and file name. */
  start: string;
  end: string;
  stats: PeriodStats;
};

export const formatReportDate = (d: string) => {
  if (!d) return '-';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(dt);
};

export const toLocalIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const formatWeekSpan = (start: string, end: string) => {
  const local = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const s = local(start);
  const e = local(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
  const monthOf = (d: Date) => new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d);
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()}–${e.getDate()} ${monthOf(e)}`
    : `${s.getDate()} ${monthOf(s)}–${e.getDate()} ${monthOf(e)}`;
};

export const formatPeriodLabel = (dateStr: string, mode: 'wow' | 'mom') => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const month = new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d);
  if (mode === 'mom') return `${month} ${d.getFullYear()}`;
  return `W${Math.ceil(d.getDate() / 7)} ${month}`;
};

export type ReportMetric = {
  label: string;
  key: string;
  target: number | null;
  kpiType: KpiType | null;
  kind: 'count' | 'score' | 'percent';
};

export const REPORT_METRICS: ReportMetric[] = [
  { label: 'Total Productivity', key: 'productivity', target: null, kpiType: null, kind: 'count' },
  { label: 'Avg Productivity', key: 'avgProductivity', target: 100, kpiType: 'productivity', kind: 'count' },
  { label: 'CSAT Official', key: 'csat', target: 3.75, kpiType: 'csatOfficial', kind: 'score' },
  { label: 'CSAT SC Full', key: 'csatScFull', target: 75, kpiType: 'csatFull', kind: 'percent' },
  { label: 'CSAT SC After Takeout', key: 'csatScFair', target: 92, kpiType: 'csatFair', kind: 'percent' },
  { label: 'SLA 1 Menit', key: 'sla1m', target: 92, kpiType: 'sla1m', kind: 'percent' },
  { label: 'SLA 3 Menit', key: 'sla3m', target: 96, kpiType: 'sla3m', kind: 'percent' },
  { label: 'WHU (%)', key: 'whu', target: 96, kpiType: 'whu', kind: 'percent' },
  { label: 'QA Score', key: 'qa', target: 92, kpiType: 'qa', kind: 'percent' },
  { label: 'Attendance', key: 'attendance', target: 95, kpiType: 'attendance', kind: 'percent' },
];

export const formatMetricValue = (metric: ReportMetric, value: number) => {
  if (metric.kind === 'count') return formatNum(value, 0);
  if (metric.kind === 'score') return formatNum(value);
  return formatNum(value) + '%';
};

/** Presentation version of the report table: white, large type, ready to paste into a slide. */
export function buildReportSlideModel(args: {
  title: string;
  columns: ReportColumn[];
  deltaTo: number;
  deltaFrom: number;
  note?: string;
  highlights?: string[];
  headline?: SlideModel['headline'];
}): SlideModel {
  const { title, columns, deltaTo, deltaFrom, note, highlights, headline } = args;
  const starts = columns.map((c) => c.start).filter(Boolean).sort();
  const ends = columns.map((c) => c.end).filter(Boolean).sort();
  const range = starts.length && ends.length
    ? `${formatReportDate(starts[0])} – ${formatReportDate(ends[ends.length - 1])}`
    : '';
  const deltaTitle = `${columns[deltaTo]?.label ?? ''} vs ${columns[deltaFrom]?.label ?? ''}`;
  return {
    title,
    subtitle: range,
    columns: columns.map((col, i) => ({ label: col.label, sublabel: col.sublabel, emphasis: i === deltaTo })),
    rows: REPORT_METRICS.map((metric) => {
      const delta = (columns[deltaTo]?.stats[metric.key] ?? 0) - (columns[deltaFrom]?.stats[metric.key] ?? 0);
      const flat = Math.abs(delta) < 0.01;
      const digits = metric.kind === 'count' ? 0 : 2;
      return {
        label: metric.label,
        target: metric.target !== null ? (metric.kind === 'score' ? formatNum(metric.target) : `${metric.target}%`) : '-',
        cells: columns.map((col) => {
          const raw = col.stats[metric.key] ?? 0;
          const status = metric.kpiType ? getKpiStatus(raw, metric.kpiType) : 'ok';
          return {
            text: formatMetricValue(metric, raw),
            tone: status === 'miss' ? ('miss' as const) : status === 'watch' ? ('watch' as const) : ('plain' as const),
          };
        }),
        delta: flat
          ? { text: '–', dir: 'flat' as const }
          : {
              text: `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(digits)}${metric.kind === 'count' ? '' : ' poin'}`,
              dir: delta > 0 ? ('up' as const) : ('down' as const),
            },
      };
    }),
    deltaHeader: deltaTitle,
    deltaSub: deltaTitle,
    note,
    highlights,
    headline,
  };
}

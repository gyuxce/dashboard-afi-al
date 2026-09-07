import { isValidCsatScScore, type AgentKPI, type CSATEntry } from './dataProcessor';
import { normalizeDateStr } from './dates';

/**
 * Pilot CSAT — a coaching program for low-CSAT agents. Participants are curated
 * manually in a `PILOT` sheet tab; everything else (baseline, weekly trend,
 * DSAT, sample cases) is computed here from CSAT SC survey data only.
 *
 * Sheet columns: Batch | CS ID | Tanggal Mulai | Tanggal Selesai | Catatan Coaching
 */

export type PilotEntry = {
  batch: string;
  csId: string;
  startDate: string;       // ISO YYYY-MM-DD
  endDate: string | null;  // ISO, or null while the batch is still running
  note: string;
  /** Manual baseline % from the sheet's `Baseline` column; null → auto-compute. */
  baselineOverride: number | null;
};

export type PilotBatch = {
  name: string;
  startDate: string;
  endDate: string | null;
  entries: PilotEntry[];
};

export type WeekBucket = {
  start: string;
  end: string;
  label: string;
  pct: number | null;
  total: number;
};

export type PilotCase = {
  date: string;
  score: number;
  category: string;
  response: string;
};

export type PilotStatus = 'lulus' | 'berproses' | 'next-batch' | 'no-data';

export type PilotAgentRow = {
  csId: string;
  name: string;
  teamLeader: string;
  note: string;
  baseline: number | null;
  /** True when `baseline` came from the sheet's `Baseline` column, not auto-computed. */
  baselineIsManual: boolean;
  /** Auto 1/2/3/4-week windows with raw good/total — a hint for filling the sheet. */
  baselineByWindow: { days: number; from: string; to: string; pct: number | null; good: number; total: number }[];
  weeks: WeekBucket[];
  current: number | null;
  average: number | null;
  delta: number | null;
  trendUp: boolean;
  status: PilotStatus;
  dsatCount: number;
  /** Valid CSAT SC ratings in the window — the denominator behind `dsatPct`. */
  dsatValidTotal: number;
  dsatPct: number | null;
  dsatByCategory: { category: string; count: number }[];
  repeatIndicators: string[];
  badCases: PilotCase[];
  goodCases: PilotCase[];
};

/** LULUS threshold — "70–75% ke atas, yang penting ada tren kenaikan". */
export const PILOT_LULUS_MIN = 70;

/** Baseline = CSAT SC Full % over the 2 weeks before batch start. */
export const PILOT_BASELINE_DAYS = 14;

/** Window lengths (days) surfaced in the panel while the baseline is verified. */
export const PILOT_BASELINE_WINDOWS = [7, 14, 21, 28] as const;

/** Cohort-level roll-up of one batch, for comparing batches side by side. */
export type BatchSummary = {
  participants: number;
  /** Participants with at least one week of CSAT SC data (i.e. status !== 'no-data'). */
  withData: number;
  /** delta vs baseline > 0 / < 0. */
  improved: number;
  declined: number;
  avgBaseline: number | null;
  avgCurrent: number | null;
  avgDelta: number | null;
  /** Cohort DSAT (ratings 1–2) rolled up across all participants. */
  dsatCount: number;
  dsatValidTotal: number;
  dsatPct: number | null;
  /** Top DSAT categories across the whole cohort, most frequent first. */
  topDsatCategories: { category: string; count: number }[];
  /** Categories flagged as recurring for at least one participant. */
  repeatCategories: string[];
  /** Cohort-average CSAT SC Full % per batch-relative week (index 0 = week 1);
   *  aligned by position so batch A's "week 2" lines up with batch B's "week 2". */
  weekAvgs: (number | null)[];
};

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

/** Roll a batch's already-built participant rows up to cohort averages/counts. */
export function summarizeBatch(rows: PilotAgentRow[]): BatchSummary {
  const nums = (pick: (r: PilotAgentRow) => number | null) =>
    rows.map(pick).filter((x): x is number => x !== null);

  const maxWeeks = rows.reduce((m, r) => Math.max(m, r.weeks.length), 0);
  const weekAvgs: (number | null)[] = [];
  for (let i = 0; i < maxWeeks; i++) {
    weekAvgs.push(mean(
      rows
        .map((r) => r.weeks[i]?.pct ?? null)
        .filter((x): x is number => x !== null),
    ));
  }

  const catMap = new Map<string, number>();
  for (const r of rows) {
    for (const c of r.dsatByCategory) {
      catMap.set(c.category, (catMap.get(c.category) || 0) + c.count);
    }
  }
  const topDsatCategories = Array.from(catMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const dsatCount = rows.reduce((s, r) => s + r.dsatCount, 0);
  const dsatValidTotal = rows.reduce((s, r) => s + r.dsatValidTotal, 0);

  return {
    participants: rows.length,
    withData: rows.filter((r) => r.status !== 'no-data').length,
    improved: rows.filter((r) => r.delta !== null && r.delta > 0).length,
    declined: rows.filter((r) => r.delta !== null && r.delta < 0).length,
    avgBaseline: mean(nums((r) => r.baseline)),
    avgCurrent: mean(nums((r) => r.current)),
    avgDelta: mean(nums((r) => r.delta)),
    dsatCount,
    dsatValidTotal,
    dsatPct: dsatValidTotal > 0 ? (dsatCount / dsatValidTotal) * 100 : null,
    topDsatCategories,
    repeatCategories: Array.from(new Set(rows.flatMap((r) => r.repeatIndicators))),
    weekAvgs,
  };
}

const toIso = (v: unknown): string | null => {
  const n = normalizeDateStr(String(v ?? '').trim());
  return n && /^\d{4}-\d{2}-\d{2}$/.test(n) ? n : null;
};

const addDays = (isoDate: string, n: number): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const dayKey = (e: { normDate?: string | null; date?: string }): string | null => {
  const nd = e.normDate || normalizeDateStr(e.date || '');
  return nd && /^\d{4}-\d{2}-\d{2}$/.test(nd) ? nd : null;
};

const fmtRange = (a: string, b: string): string => {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return `${a}–${b}`;
  const mo = (d: Date) => new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d);
  return da.getMonth() === db.getMonth()
    ? `${da.getDate()}–${db.getDate()} ${mo(da)}`
    : `${da.getDate()} ${mo(da)} – ${db.getDate()} ${mo(db)}`;
};

/**
 * Parse the raw PILOT sheet rows. Columns resolved by header name:
 * `Batch | CS ID | Tanggal Mulai | Tanggal Selesai | Catatan Coaching | Baseline`.
 * `Baseline` is optional — a manual % override; blank means auto-compute.
 */
export function parsePilotRows(rows: unknown[][] | null | undefined): PilotEntry[] {
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map((h) => String(h ?? '').trim().toLowerCase());
  const col = (needles: string[], fallback: number) => {
    for (const nm of needles) {
      const i = header.findIndex((h) => h.includes(nm));
      if (i >= 0) return i;
    }
    return fallback;
  };
  const cBatch = col(['batch'], 0);
  const cCsId = col(['cs id', 'csid', 'cs_id', 'cs-id'], 1);
  const cStart = col(['mulai', 'start'], 2);
  const cEnd = col(['selesai', 'end'], 3);
  const cNote = col(['catatan', 'note', 'coaching'], 4);
  const cBaseline = col(['baseline', 'base line'], -1);

  const parsePct = (v: unknown): number | null => {
    const s = String(v ?? '').trim().replace('%', '').replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    // accept "0.62" or "62"
    return n > 0 && n <= 1 ? n * 100 : n;
  };

  const out: PilotEntry[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const batch = String(row[cBatch] ?? '').trim();
    const csId = String(row[cCsId] ?? '').trim();
    const startDate = toIso(row[cStart]);
    if (!batch || !csId || !startDate) continue;
    out.push({
      batch,
      csId,
      startDate,
      endDate: toIso(row[cEnd]),
      note: String(row[cNote] ?? '').trim(),
      baselineOverride: cBaseline >= 0 ? parsePct(row[cBaseline]) : null,
    });
  }
  return out;
}

/** Group entries into batches (newest start first). A batch is "ongoing" if any row has no end date. */
export function getPilotBatches(entries: PilotEntry[]): PilotBatch[] {
  const byBatch = new Map<string, PilotEntry[]>();
  for (const e of entries) {
    const list = byBatch.get(e.batch) || [];
    list.push(e);
    byBatch.set(e.batch, list);
  }
  const batches: PilotBatch[] = [];
  byBatch.forEach((list, name) => {
    const starts = list.map((e) => e.startDate).sort();
    const ends = list.map((e) => e.endDate).filter((d): d is string => !!d).sort();
    const allEnded = ends.length === list.length;
    batches.push({
      name,
      startDate: starts[0],
      endDate: allEnded && ends.length ? ends[ends.length - 1] : null,
      entries: list,
    });
  });
  return batches.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/**
 * The processKPIs date range the Pilot CSAT tab needs: from 2 weeks before the
 * earliest batch start (baseline window) through the latest batch end
 * (or the dashboard period end for still-running batches).
 */
export function pilotProcessingRange(
  entries: PilotEntry[],
  fallbackEnd: string,
): { start: string; end: string } | null {
  const starts = entries.map((e) => e.startDate).filter(Boolean).sort();
  if (!starts.length) return null;
  const ends = entries
    .map((e) => e.endDate || fallbackEnd)
    .filter((d): d is string => !!d)
    .sort();
  return {
    start: addDays(starts[0], -14),
    end: ends.length ? ends[ends.length - 1] : starts[starts.length - 1],
  };
}

/** CSAT SC Full % over [start, end] inclusive, from per-day good/total buckets. */
export function csatScFullPct(
  daily: { normDate?: string | null; date: string; score: number; count: number }[],
  start: string,
  end: string,
): { pct: number | null; good: number; total: number } {
  let good = 0;
  let total = 0;
  for (const e of daily || []) {
    const k = dayKey(e);
    if (!k || k < start || k > end) continue;
    good += e.score;
    total += e.count;
  }
  return { pct: total > 0 ? (good / total) * 100 : null, good, total };
}

/** Split [start, end] into consecutive 7-day buckets, each with its CSAT SC Full %. */
export function weekBuckets(
  daily: { normDate?: string | null; date: string; score: number; count: number }[],
  start: string,
  end: string,
): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  if (!start || !end || start > end) return buckets;
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 60) {
    const naive = addDays(cur, 6);
    const bEnd = naive < end ? naive : end;
    const { pct, total } = csatScFullPct(daily, cur, bEnd);
    buckets.push({ start: cur, end: bEnd, label: fmtRange(cur, bEnd), pct, total });
    cur = addDays(bEnd, 1);
  }
  return buckets;
}

/** Build one participant's full pilot row. `windowEnd` = dashboard period end, used when the batch has no end date. */
export function buildPilotAgentRow(
  entry: PilotEntry,
  agent: AgentKPI | undefined,
  windowEnd: string,
): PilotAgentRow {
  const start = entry.startDate;
  const end = entry.endDate || (windowEnd && windowEnd >= start ? windowEnd : start);
  const baseEnd = addDays(start, -1);

  const daily = agent?.dailyHistory?.csatScFull || [];
  const baselineByWindow = PILOT_BASELINE_WINDOWS.map((days) => {
    const from = addDays(start, -days);
    return { days, from, to: baseEnd, ...csatScFullPct(daily, from, baseEnd) };
  });
  const autoBaseline = csatScFullPct(daily, addDays(start, -PILOT_BASELINE_DAYS), baseEnd).pct;
  // Manual value from the sheet's `Baseline` column wins when present.
  const baselineIsManual = entry.baselineOverride !== null;
  const baseline = baselineIsManual ? entry.baselineOverride : autoBaseline;
  const weeks = weekBuckets(daily, start, end);
  const filled = weeks.filter((w) => w.pct !== null) as (WeekBucket & { pct: number })[];
  const current = filled.length ? filled[filled.length - 1].pct : null;
  const average = filled.length
    ? filled.reduce((s, w) => s + w.pct, 0) / filled.length
    : null;
  const delta = current !== null && baseline !== null ? current - baseline : null;
  const firstPct = filled.length ? filled[0].pct : null;
  const trendUp =
    current !== null &&
    ((firstPct !== null && current > firstPct) || (baseline !== null && current > baseline));

  // DSAT + sample cases from individual CSAT SC survey rows within the window.
  const hist = (agent?.csatHistory || []).filter((h) => {
    const k = dayKey(h);
    return k !== null && k >= start && k <= end && isValidCsatScScore(h.score);
  });
  const validTotal = hist.length;
  const bad = hist.filter((h) => h.score === 1 || h.score === 2);
  const goodH = hist.filter((h) => h.score === 4 || h.score === 5);
  const dsatCount = bad.length;
  const dsatPct = validTotal > 0 ? (dsatCount / validTotal) * 100 : null;

  const catMap = new Map<string, number>();
  for (const h of bad) {
    const c = String(h.category || '').trim() || 'Tanpa kategori';
    catMap.set(c, (catMap.get(c) || 0) + 1);
  }
  const dsatByCategory = Array.from(catMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const weekIndexOf = (k: string) => weeks.findIndex((w) => k >= w.start && k <= w.end);
  const catWeeks = new Map<string, Set<number>>();
  for (const h of bad) {
    const k = dayKey(h);
    if (!k) continue;
    const wi = weekIndexOf(k);
    if (wi < 0) continue;
    const c = String(h.category || '').trim() || 'Tanpa kategori';
    const s = catWeeks.get(c) || new Set<number>();
    s.add(wi);
    catWeeks.set(c, s);
  }
  const repeatIndicators = Array.from(catWeeks.entries())
    .filter(([, s]) => s.size >= 2)
    .map(([c]) => c);

  const toCase = (h: CSATEntry): PilotCase => ({
    date: dayKey(h) || h.date,
    score: h.score,
    category: String(h.category || '').trim() || '—',
    response: String(h.response || '').trim(),
  });
  const cmpRecent = (a: CSATEntry, b: CSATEntry) =>
    (dayKey(b) || '').localeCompare(dayKey(a) || '');
  const badCases = [...bad]
    .sort((a, b) => a.score - b.score || cmpRecent(a, b))
    .slice(0, 5)
    .map(toCase);
  const goodCases = [...goodH]
    .sort((a, b) => b.score - a.score || cmpRecent(a, b))
    .slice(0, 5)
    .map(toCase);

  // No progress data yet (batch not started, or nothing synced) → can't judge.
  // Only call someone "next-batch" once there's an actual result to look at.
  let status: PilotStatus;
  if (current === null) status = 'no-data';
  else if (current >= PILOT_LULUS_MIN && trendUp) status = 'lulus';
  else if (trendUp) status = 'berproses';
  else status = 'next-batch';

  return {
    csId: entry.csId,
    name: agent?.name || entry.csId,
    teamLeader: agent?.teamLeader || '-',
    note: entry.note,
    baseline,
    baselineIsManual,
    baselineByWindow,
    weeks,
    current,
    average,
    delta,
    trendUp,
    status,
    dsatCount,
    dsatValidTotal: validTotal,
    dsatPct,
    dsatByCategory,
    repeatIndicators,
    badCases,
    goodCases,
  };
}

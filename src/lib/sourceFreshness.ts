import { normalizeDateStr } from './dates';
import {
  pickColumn,
  resolveCsatScColumns,
  resolveProductivityColumns,
  resolveQaColumns,
  resolveScheduleIdentityColumns,
  resolveSlaColumns,
} from './sheetHeaders';

export type SourceDataKey =
  | 'productivityData'
  | 'csatScData'
  | 'slaData'
  | 'scheduleData'
  | 'qaData';

export type SourceLastDates = Partial<Record<SourceDataKey, string | null>>;

export const SOURCE_LABEL: Record<string, string> = {
  productivityData: 'Productivity',
  csatScData: 'CSAT SC',
  slaData: 'SLA',
  scheduleData: 'Schedule',
  qaData: 'QA',
};

const laterIso = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : a >= b ? a : b;

/**
 * Newest calendar date (YYYY-MM-DD) that actually carries a row/cell in a
 * source sheet — so a stale sheet (Schedule stopped on the 20th) is visible
 * even while its row count still looks healthy.
 */
export function lastDataDate(dataKey: string, data: unknown[][]): string | null {
  if (!data || data.length <= 1) return null;
  const header = (data[0] || []) as unknown[];

  if (dataKey === 'scheduleData') {
    const firstDate = resolveScheduleIdentityColumns(header).firstDateColumn;
    let latest: string | null = null;
    for (let c = firstDate; c < header.length; c++) {
      const iso = normalizeDateStr(String(header[c] ?? ''));
      if (!iso) continue;
      let filled = false;
      for (let r = 1; r < data.length; r++) {
        if (String((data[r] as unknown[])?.[c] ?? '').trim() !== '') {
          filled = true;
          break;
        }
      }
      if (filled) latest = laterIso(latest, iso);
    }
    return latest;
  }

  const colByKey: Record<string, { idx: number; startRow: number }> = {
    productivityData: {
      idx: pickColumn(resolveProductivityColumns(data as unknown[][]).date, 0),
      startRow: data.length > 2 ? 2 : 1,
    },
    csatScData: { idx: pickColumn(resolveCsatScColumns(header).date, 0), startRow: 1 },
    slaData: { idx: pickColumn(resolveSlaColumns(data as unknown[][]).date, 0), startRow: 1 },
    qaData: { idx: pickColumn(resolveQaColumns(header).date, 13), startRow: 1 },
  };
  const cfg = colByKey[dataKey];
  if (!cfg || cfg.idx < 0) return null;

  let latest: string | null = null;
  for (let r = cfg.startRow; r < data.length; r++) {
    const iso = normalizeDateStr(String((data[r] as unknown[])?.[cfg.idx] ?? ''));
    if (iso) latest = laterIso(latest, iso);
  }
  return latest;
}

export function lastDatesForAllSources(sources: {
  productivityData?: unknown[][];
  csatScData?: unknown[][];
  slaData?: unknown[][];
  scheduleData?: unknown[][];
  qaData?: unknown[][];
}): SourceLastDates {
  return {
    productivityData: lastDataDate('productivityData', sources.productivityData || []),
    csatScData: lastDataDate('csatScData', sources.csatScData || []),
    slaData: lastDataDate('slaData', sources.slaData || []),
    scheduleData: lastDataDate('scheduleData', sources.scheduleData || []),
    qaData: lastDataDate('qaData', sources.qaData || []),
  };
}

const daysBetween = (a: string, b: string) =>
  Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Sources whose last date lags the freshest dated source by >= `thresholdDays`. */
export function laggingSources(
  lastDates: SourceLastDates,
  thresholdDays = 3,
): { key: string; label: string; lastDate: string; lagDays: number }[] {
  const dated = Object.entries(lastDates).filter(([, v]) => !!v) as [string, string][];
  if (dated.length < 2) return [];
  const newest = dated.reduce((m, [, v]) => (v > m ? v : m), dated[0][1]);
  return dated
    .map(([key, v]) => ({
      key,
      label: SOURCE_LABEL[key] || key,
      lastDate: v,
      lagDays: daysBetween(v, newest),
    }))
    .filter((s) => s.lagDays >= thresholdDays)
    .sort((a, b) => b.lagDays - a.lagDays);
}

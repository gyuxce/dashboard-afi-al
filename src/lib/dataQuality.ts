import { cell, pickColumn, resolveProductivityColumns, resolveRowCsId } from './sheetHeaders';
import { normalizeDateStr } from './dataProcessor';

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'baru saja';
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  return date.toLocaleDateString('id-ID');
}

export function isStaleSync(date: Date | null): boolean {
  if (!date) return false;
  const now = new Date();
  const isDifferentDay = date.toDateString() !== now.toDateString();
  const isOlderThanSixHours = now.getTime() - date.getTime() > 6 * 60 * 60 * 1000;
  return isDifferentDay || isOlderThanSixHours;
}

export function countDataRows(data: any[][]): number {
  if (!data || data.length === 0) return 0;
  return Math.max(0, data.filter((row) => row?.some((c) => String(c || '').trim() !== '')).length - 1);
}

export function extractCsIds(data: any[][]): Set<string> {
  const ids = new Set<string>();
  data.forEach((row) => {
    row?.forEach((c) => {
      const value = String(c || '').trim();
      if (value.startsWith('3-1-')) ids.add(value);
    });
  });
  return ids;
}

export function getProductivityDuplicateCount(data: any[][]): number {
  const seen = new Map<string, number>();
  const columns = resolveProductivityColumns(data);
  const startRow = data.length > 2 ? 2 : 1;

  for (let r = startRow; r < data.length; r++) {
    const row = data[r];
    if (!row || row.length < 2) continue;

    const resolved = resolveRowCsId(row, columns.csId);
    if (!resolved.id) continue;

    const dateIdx = pickColumn(columns.date, resolved.index > 0 ? 0 : -1);
    const rawDate = cell(row, dateIdx);
    const normDate = normalizeDateStr(rawDate) || rawDate;
    const agentId = resolved.id;
    if (!agentId || !normDate) continue;

    const key = [
      agentId,
      normDate,
      cell(row, pickColumn(columns.productivity, resolved.index >= 0 ? resolved.index + 8 : -1)),
      cell(row, pickColumn(columns.csatAsli, resolved.index >= 0 ? resolved.index + 1 : -1)),
      cell(row, pickColumn(columns.whu, resolved.index >= 0 ? resolved.index + 15 : -1)),
      [columns.star5, columns.star4, columns.star3, columns.star2, columns.star1]
        .map((idx, i) => cell(row, pickColumn(idx, 3 + i)))
        .join("/"),
    ].join("|").toLowerCase();

    seen.set(key, (seen.get(key) || 0) + 1);
  }

  return Array.from(seen.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

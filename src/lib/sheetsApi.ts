import { normalizeDateStr } from './dates';
import { cell, findHeader, findHeaderIncludes } from './sheetHeaders';

// Config (dari env variables)
const API_KEY = import.meta.env.VITE_SHEETS_API_KEY;
const DEFAULT_SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID;
// Spreadsheet baru untuk periode Agustus-Oktober 2026.
// Env variable tetap bisa dipakai jika ID-nya nanti dipindahkan atau diganti.
const AUG_OCT_2026_SPREADSHEET_ID =
  import.meta.env.VITE_SPREADSHEET_ID_AUG_OCT_2026 || '156IyfTTE77MPbCUWoHS741M_VJoMzyLr6Tr-498Zmok';
// Pilot CSAT roster lives in one small tab; it does not rotate by month.
const PILOT_SPREADSHEET_ID =
  import.meta.env.VITE_SPREADSHEET_ID_PILOT || AUG_OCT_2026_SPREADSHEET_ID;
const PILOT_SHEET_NAME = import.meta.env.VITE_SHEET_PILOT || 'PILOT';
const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// Type untuk raw data dari Sheets API
export type SheetRow = string[];
export type SheetData = SheetRow[];

export function emptyAllSheetsData(): AllSheetsData {
  return { csid: [], productivity: [], csatSc: [], sla: [], schedule: [], qa: [] };
}

export function isAbortError(error: unknown) {
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && (error.name === 'AbortError' || /aborted|AbortError/i.test(error.message)))
  );
}

export function isTransientNetworkError(error: unknown) {
  if (isAbortError(error)) return true;
  const message = error instanceof Error ? error.message : String(error || '');
  return /failed to fetch|networkerror|load failed|the user aborted/i.test(message);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Combine an external abort signal with a timeout so a stalled fetch
 *  doesn't hang the entire sync. Works without AbortSignal.any. */
function fetchWithTimeout(url: string, signal?: AbortSignal, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  // `cache: 'no-store'` forces a real network hit every time. Without it the
  // browser's HTTP cache can (and does, per user report) serve back an old
  // response for the exact same values.get URL — "Sync sekarang" then
  // reports success and even bumps lastSyncTime, but the row content that
  // actually lands in the store is unchanged, so a sheet edit never shows
  // up until a hard refresh happens to evict the cache some other way.
  return fetch(url, { signal: controller.signal, cache: 'no-store' }).finally(() => clearTimeout(timeoutId));
}

async function readGoogleSheetsError(response: Response): Promise<string> {
  try {
    const json = await response.json();
    return String(json?.error?.message || response.statusText || '').trim();
  } catch {
    return response.statusText || '';
  }
}

function buildSheetFetchError(sheetName: string, status: number, statusText: string, apiMessage: string): Error {
  const normalizedMessage = apiMessage.toLowerCase();
  const isMissingTab =
    status === 400 &&
    (normalizedMessage.includes('unable to parse range') ||
      normalizedMessage.includes('cannot find') ||
      normalizedMessage.includes('not found'));

  if (isMissingTab) {
    return new Error(
      `Tab "${sheetName}" belum ditemukan. Buat tab ini dulu di Google Sheets atau pilih bulan lain.`
    );
  }

  if (status === 403) {
    return new Error(
      `Akses ke Google Sheet ditolak saat membaca tab "${sheetName}". Cek API key, sharing sheet, dan permission.`
    );
  }

  return new Error(
    `Gagal mengambil tab "${sheetName}": ${status} ${statusText}${apiMessage ? ` - ${apiMessage}` : ''}`
  );
}

function buildRange(sheetName: string, range: string = 'A:AZ'): string {
  return `'${sheetName.replace(/'/g, "''")}'!${range}`;
}

// Fetch semua sheet dari Google Sheets
export interface AllSheetsData {
  csid: SheetData;
  productivity: SheetData;
  csatSc: SheetData;
  sla: SheetData;
  schedule: SheetData;
  qa: SheetData;
}

export interface SheetConfig {
  csidSheetName: string;
  productivitySheetName: string;
  csatScSheetName: string;
  slaSheetName: string;
  scheduleSheetName: string;
  qaSheetName: string;
}

export interface SheetMonthOption {
  key: string;
  label: string;
  suffix: string | null;
  description: string;
}

const MONTHS = [
  { number: 1, label: 'Januari', code: 'JAN' },
  { number: 2, label: 'Februari', code: 'FEB' },
  { number: 3, label: 'Maret', code: 'MAR' },
  { number: 4, label: 'April', code: 'APR' },
  { number: 5, label: 'Mei', code: 'MAY' },
  { number: 6, label: 'Juni', code: 'JUN' },
  { number: 7, label: 'Juli', code: 'JUL' },
  { number: 8, label: 'Agustus', code: 'AUG' },
  { number: 9, label: 'September', code: 'SEP' },
  { number: 10, label: 'Oktober', code: 'OCT' },
  { number: 11, label: 'November', code: 'NOV' },
  { number: 12, label: 'Desember', code: 'DEC' },
];

// Default config, user bisa override di env atau settings
const DEFAULT_CONFIG: SheetConfig = {
  csidSheetName: import.meta.env.VITE_SHEET_CSID || 'CSID',
  productivitySheetName: import.meta.env.VITE_SHEET_PRODUCTIVITY || 'Productivity CSAT WHU',
  csatScSheetName: import.meta.env.VITE_SHEET_CSAT_SC || 'CSAT SC',
  slaSheetName: import.meta.env.VITE_SHEET_SLA || 'SLA',
  scheduleSheetName: import.meta.env.VITE_SHEET_SCHEDULE || 'Schedule',
  qaSheetName: import.meta.env.VITE_SHEET_QA || 'QA',
};

const LEGACY_MONTH_OPTION: SheetMonthOption = {
    key: 'legacy',
    label: 'Mei 2026',
    suffix: null,
    description: 'Menggunakan nama tab dari env Vercel saat ini',
};

function buildMonthlySheetOptions(): SheetMonthOption[] {
  const currentYear = new Date().getFullYear();
  const endYear = Math.max(2028, currentYear + 2);
  const options: SheetMonthOption[] = [LEGACY_MONTH_OPTION];

  for (let year = 2026; year <= endYear; year++) {
    for (const month of MONTHS) {
      if (year === 2026 && month.number < 6) continue;

      const suffix = `${month.code}_${year}`;
      options.push({
        key: suffix,
        label: `${month.label} ${year}`,
        suffix,
        description: `Menggunakan tab bulanan format *_${suffix}`,
      });
    }
  }

  return options;
}

export function getSheetMonthOptions(): SheetMonthOption[] {
  return buildMonthlySheetOptions();
}

export function getSheetMonthOption(monthKey: string): SheetMonthOption {
  return getSheetMonthOptions().find(option => option.key === monthKey) || LEGACY_MONTH_OPTION;
}

/** Convert a YYYY-MM filter value (e.g. "2026-08") to a sheet month key (e.g. "AUG_2026"). */
export function getSheetMonthKeyFromDate(monthValue: string): string {
  if (!monthValue) return getCurrentSheetMonthKey();
  const [yearStr, monthStr] = monthValue.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month || month < 1 || month > 12) return getCurrentSheetMonthKey();
  if (year < 2026 || (year === 2026 && month <= 5)) return 'legacy';
  const monthCode = MONTHS[month - 1]?.code;
  if (!monthCode) return 'legacy';
  const key = `${monthCode}_${year}`;
  return getSheetMonthOptions().some(option => option.key === key) ? key : 'legacy';
}

export function getCurrentSheetMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (year < 2026 || (year === 2026 && month <= 5)) return 'legacy';

  const monthCode = MONTHS[month - 1]?.code;
  if (!monthCode) return 'legacy';

  const key = `${monthCode}_${year}`;
  return getSheetMonthOptions().some(option => option.key === key) ? key : 'legacy';
}

function padMonthDay(value: number) {
  return String(value).padStart(2, '0');
}

/** Calendar range for a File Center month key (`AUG_2026`, `legacy` → Mei 2026). */
export function getDateRangeForSheetMonth(monthKey: string): { start: string; end: string } | null {
  const option = getSheetMonthOption(monthKey);
  if (!option.suffix) {
    return { start: '2026-05-01', end: '2026-05-31' };
  }

  const [monthCode, yearValue] = option.key.split('_');
  const month = MONTHS.find((item) => item.code === monthCode);
  const year = Number(yearValue);
  if (!month || !year) return null;

  const lastDay = new Date(year, month.number, 0).getDate();
  return {
    start: `${year}-${padMonthDay(month.number)}-01`,
    end: `${year}-${padMonthDay(month.number)}-${padMonthDay(lastDay)}`,
  };
}

export function getPreviousSheetMonthKey(monthKey: string): string | null {
  const option = getSheetMonthOption(monthKey);
  if (!option.suffix) return null;
  if (option.key === 'JUN_2026') return 'legacy';

  const [monthCode, yearValue] = option.key.split('_');
  const monthIndex = MONTHS.findIndex(month => month.code === monthCode);
  const year = Number(yearValue);
  if (monthIndex === -1 || !year) return null;

  if (monthIndex === 0) {
    return `DEC_${year - 1}`;
  }

  return `${MONTHS[monthIndex - 1].code}_${year}`;
}

/**
 * Sheet months to keep in RAM for sync: selected month + N prior months.
 * N=3 covers Bandingkan MoM (3 previous periods) and Incentive (previous calendar month).
 */
export const SHEETS_HISTORY_LOOKBACK_MONTHS = 3;

export function getSheetMonthHistoryKeys(
  monthKey: string,
  lookback: number = SHEETS_HISTORY_LOOKBACK_MONTHS,
): string[] {
  const keys = [monthKey];
  let cursor = getPreviousSheetMonthKey(monthKey);
  while (cursor && keys.length < lookback + 1) {
    keys.unshift(cursor);
    cursor = getPreviousSheetMonthKey(cursor);
  }
  return keys;
}

export function getSheetConfigForMonth(monthKey: string): SheetConfig {
  const option = getSheetMonthOption(monthKey);
  if (!option.suffix) return DEFAULT_CONFIG;

  return {
    csidSheetName: `CSID_${option.suffix}`,
    productivitySheetName: `PRODUCTIVITY_${option.suffix}`,
    csatScSheetName: `CSAT_SC_${option.suffix}`,
    slaSheetName: `SLA_${option.suffix}`,
    scheduleSheetName: `SCHEDULE_${option.suffix}`,
    qaSheetName: `QA_${option.suffix}`,
  };
}

export function getSpreadsheetIdForMonth(monthKey: string): string {
  if (['AUG_2026', 'SEP_2026', 'OCT_2026'].includes(monthKey)) {
    return AUG_OCT_2026_SPREADSHEET_ID;
  }

  return DEFAULT_SPREADSHEET_ID;
}

/**
 * Workbooks to try, in order, when fetching a history month.
 *
 * A history month of an archive-workbook period (Aug–Oct 2026) usually lives in
 * that same workbook — kept together for MoM comparison and the incentive
 * simulation (previous calendar month). Without this, selecting August and
 * opening Simulasi Insentif fetches `PRODUCTIVITY_JUL_2026` from the default
 * workbook, 404s, and every agent shows "Data belum lengkap".
 */
export function getSpreadsheetIdCandidatesForMonth(
  monthKey: string,
  selectedMonthKey?: string,
): string[] {
  const ordered = [
    getSpreadsheetIdForMonth(monthKey),
    selectedMonthKey ? getSpreadsheetIdForMonth(selectedMonthKey) : '',
    DEFAULT_SPREADSHEET_ID,
    AUG_OCT_2026_SPREADSHEET_ID,
  ];
  return ordered.filter((id, i) => id && ordered.indexOf(id) === i);
}

export async function fetchAllSheets(
  config: SheetConfig = DEFAULT_CONFIG,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  signal?: AbortSignal,
): Promise<AllSheetsData> {
  const sheetEntries = [
    ['csid', config.csidSheetName],
    ['productivity', config.productivitySheetName],
    ['csatSc', config.csatScSheetName],
    ['sla', config.slaSheetName],
    ['schedule', config.scheduleSheetName],
    ['qa', config.qaSheetName],
  ] as const;
  const params = new URLSearchParams({ key: API_KEY });

  sheetEntries.forEach(([, sheetName]) => {
    params.append('ranges', buildRange(sheetName));
  });

  const url = `${BASE_URL}/${spreadsheetId}/values:batchGet?${params.toString()}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    throwIfAborted(signal);
    try {
      const response = await fetchWithTimeout(url, signal, 30000);

      if (response.ok) {
        const json = await response.json();
        const valueRanges: Array<{ values?: SheetData }> = json.valueRanges || [];
        return sheetEntries.reduce((result, [key], index) => {
          result[key] = valueRanges[index]?.values || [];
          return result;
        }, {} as AllSheetsData);
      }

      const shouldRetry = RETRYABLE_STATUS.has(response.status) && attempt < 3;
      if (!shouldRetry) {
        const apiMessage = await readGoogleSheetsError(response);
        throw buildSheetFetchError('beberapa tab Google Sheets', response.status, response.statusText, apiMessage);
      }
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) throw error;
      if (attempt >= 3 || !isTransientNetworkError(error)) throw error;
    }

    await sleep(1000 * Math.pow(2, attempt));
  }

  throw new Error('Koneksi ke Google Sheets terputus. Coba Sync lagi.');
}

/**
 * Pilot CSAT roster tab. Optional — a missing / unshared tab just means "no pilot
 * config" and must never fail a normal sync, so this swallows non-abort errors.
 */
export async function fetchPilotRows(signal?: AbortSignal): Promise<string[][]> {
  if (!API_KEY || !PILOT_SPREADSHEET_ID) return [];
  const range = buildRange(PILOT_SHEET_NAME);
  const url = `${BASE_URL}/${PILOT_SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  try {
    const res = await fetchWithTimeout(url, signal, 20000);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.values || []) as string[][];
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error;
    return [];
  }
}

function cellHasNumericScore(value: string): boolean {
  const raw = String(value || '').trim().replace(',', '.');
  if (!raw) return false;
  const parsed = parseFloat(raw.replace('%', ''));
  return !Number.isNaN(parsed);
}

function mergeSheetData(
  previous: SheetData,
  current: SheetData,
  ticketAliases: string[] = [],
  lineIdentityAliases: string[][] = [],
  scoreAliases: string[] = [],
): SheetData {
  if (!previous.length) return current;
  if (!current.length) return previous;

  const header = previous[0] || [];
  const ticketIdx = ticketAliases.length ? findHeaderIncludes(header, ticketAliases) : -1;
  const csIdIdx = findHeader(header, ['CS ID', 'csid', 'cs_id', 'agent id', 'csid agent']);
  const dateIdx = findHeaderIncludes(header, ['checking date', 'check date', 'qa date', 'date', 'tanggal']);
  const scoreIdx = scoreAliases.length ? findHeaderIncludes(header, scoreAliases) : -1;
  const lineIdxs = lineIdentityAliases.map((aliases) => findHeaderIncludes(header, aliases));

  // History tabs can overlap at month boundaries. Drop exact duplicate rows,
  // then keep the latest row for the same agent + calendar day + ticket
  // (+ QA line identity: one ticket often has several mistake rows).
  const seenRows = new Set<string>();
  const ticketIndex = new Map<string, number>();
  const body: SheetRow[] = [];

  for (const row of [...previous.slice(1), ...current.slice(1)]) {
    const key = row.map((item) => String(item ?? '')).join('\u001F');
    if (seenRows.has(key)) continue;
    seenRows.add(key);

    const ticket = ticketIdx >= 0 ? cell(row, ticketIdx).toLowerCase() : '';
    const csId = csIdIdx >= 0 ? cell(row, csIdIdx).toLowerCase() : '';
    const rawDate = dateIdx >= 0 ? cell(row, dateIdx) : '';
    const day = (normalizeDateStr(rawDate) || rawDate).toLowerCase();
    const lineParts = lineIdxs.map((idx) => (idx >= 0 ? cell(row, idx).toLowerCase() : ''));
    const mergeKey = ticket ? [csId, day, ticket, ...lineParts].join('|') : '';
    if (mergeKey && ticketIndex.has(mergeKey)) {
      const existingIdx = ticketIndex.get(mergeKey)!;
      // Never replace a filled QC Score with an empty follow-up line.
      if (
        scoreIdx >= 0 &&
        cellHasNumericScore(cell(body[existingIdx], scoreIdx)) &&
        !cellHasNumericScore(cell(row, scoreIdx))
      ) {
        continue;
      }
      body[existingIdx] = row;
      continue;
    }
    if (mergeKey) ticketIndex.set(mergeKey, body.length);
    body.push(row);
  }
  return [header, ...body];
}

function mergeScheduleSheetData(previous: SheetData, current: SheetData): SheetData {
  if (!previous.length) return current;
  if (!current.length) return previous;

  const previousHeader = previous[0] || [];
  const currentHeader = current[0] || [];
  const baseHeader = currentHeader.length >= 5 ? currentHeader.slice(0, 5) : previousHeader.slice(0, 5);

  // Dedupe date columns by normalized calendar day to avoid double-counting man-days
  // when the same day appears as "1/7/2026" and "01/07/2026".
  const dateHeaders: string[] = [];
  const dateNormToIndex = new Map<string, number>();

  const addDateHeader = (header: string) => {
    const date = String(header || '').trim();
    if (!date) return;
    const norm = normalizeDateStr(date);
    if (norm) {
      if (dateNormToIndex.has(norm)) return;
      dateNormToIndex.set(norm, dateHeaders.length);
      dateHeaders.push(date);
      return;
    }
    if (!dateHeaders.includes(date)) dateHeaders.push(date);
  };

  [...previousHeader.slice(5), ...currentHeader.slice(5)].forEach(addDateHeader);

  const rowsById = new Map<string, string[]>();

  const addRows = (sheet: SheetData) => {
    const header = sheet[0] || [];
    const headerDates = header.slice(5).map(cell => String(cell || '').trim());

    sheet.slice(1).forEach(row => {
      const csId = String(row[1] || '').trim();
      if (!csId) return;

      if (!rowsById.has(csId)) {
        rowsById.set(csId, Array(baseHeader.length + dateHeaders.length).fill(''));
      }

      const mergedRow = rowsById.get(csId)!;
      for (let i = 0; i < Math.min(5, row.length); i++) {
        // Later months win for name / TL / BPO so a CSID move is not stuck
        // on the first history tab's identity columns.
        if (row[i]) mergedRow[i] = row[i];
      }

      headerDates.forEach((date, idx) => {
        if (!date) return;
        const norm = normalizeDateStr(date);
        let targetIndex = -1;
        if (norm && dateNormToIndex.has(norm)) {
          targetIndex = baseHeader.length + (dateNormToIndex.get(norm) as number);
        } else {
          const fallbackIdx = dateHeaders.indexOf(date);
          if (fallbackIdx >= 0) targetIndex = baseHeader.length + fallbackIdx;
        }
        if (targetIndex < 0) return;
        const value = row[idx + 5];
        if (value !== undefined && value !== '') mergedRow[targetIndex] = value;
      });
    });
  };

  addRows(previous);
  addRows(current);

  return [[...baseHeader, ...dateHeaders], ...Array.from(rowsById.values())];
}

export function mergeAllSheetsData(previous: AllSheetsData, current: AllSheetsData): AllSheetsData {
  return {
    csid: mergeSheetData(previous.csid, current.csid),
    productivity: mergeSheetData(previous.productivity, current.productivity),
    csatSc: mergeSheetData(previous.csatSc, current.csatSc, ['ticket id', 'ticket', 'chat id']),
    sla: mergeSheetData(previous.sla, current.sla, ['ticket id', 'ticket']),
    schedule: mergeScheduleSheetData(previous.schedule, current.schedule),
    // QA tickets are several rows (score + extra mistake lines). Ticket-level
    // collapse kept the empty follow-up row and wiped daily scores for every
    // agent. Exact-row dedupe is enough for overlapping month tabs.
    qa: mergeSheetData(previous.qa, current.qa),
  };
}

// Convert SheetData ke format yang sama dengan PapaParse output
export function sheetDataToParseResult(
  data: SheetData
): { data: string[][] } {
  return { data };
}

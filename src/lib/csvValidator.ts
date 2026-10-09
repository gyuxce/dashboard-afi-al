import { resolveCsidColumns } from './csid';
import {
  cell,
  missingHeaderLabels,
  pickColumn,
  resolveCsatScColumns,
  resolveProductivityColumns,
  resolveQaColumns,
  resolveRowCsId,
  resolveSlaColumns,
} from './sheetHeaders';

export type ValidationSeverity = 'ok' | 'warning' | 'error';

export interface ValidationResult {
  isValid: boolean;
  errorType?: string;
  message?: string;
  severity: ValidationSeverity;
}

export function extractHeaders(parsedData: any[][]): string[] {
  if (!parsedData || parsedData.length === 0) return [];
  // Find the first row that has at least some content
  const headerRow = parsedData.find(row => row && row.some(cell => String(cell || '').trim() !== '')) || [];
  return headerRow.map((h: any) => String(h || ''));
}

export function normalizeHeader(str: string): string {
  return str.toLowerCase().replace(/[\s_-]/g, '');
}

export function hasAnyHeader(headers: string[], possibleNames: string[]): boolean {
  const normalizedHeaders = headers.map(normalizeHeader);
  const normalizedNames = possibleNames.map(normalizeHeader);
  return normalizedHeaders.some(h => normalizedNames.includes(h));
}

export function countDataRows(parsedData: any[][]): number {
  const validRows = parsedData.filter(row => row && row.some(cell => String(cell || '').trim() !== ''));
  return Math.max(0, validRows.length - 1);
}

export function scanRowsForKeyword(
  parsedData: any[][], 
  keywords: string[], 
  maxRows: number = 5
): boolean {
  const rowsToScan = parsedData.slice(0, maxRows);
  for (const row of rowsToScan) {
    if (!row) continue;
    const rowText = row.join(' ').toLowerCase();
    for (const keyword of keywords) {
      if (rowText.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

function getBaseIssues(parsedData: any[][]): ValidationResult | null {
  if (!parsedData || parsedData.length === 0) {
    return {
      isValid: false,
      errorType: 'PARSE_ERROR',
      message: 'File tidak bisa di-parse, kemungkinan format bukan CSV.',
      severity: 'error'
    };
  }
  const rows = countDataRows(parsedData);
  if (rows === 0) {
    return {
      isValid: false,
      errorType: 'EMPTY_DATA',
      message: 'File tidak memiliki data (hanya header).',
      severity: 'warning'
    };
  }
  return null;
}

export function validateCsidFile(parsedData: any[][]): ValidationResult {
  const base = getBaseIssues(parsedData);
  if (base && base.errorType !== 'FEW_ROWS') return base;

  const headers = extractHeaders(parsedData);
  // Parser and validator intentionally share aliases so a file cannot be
  // shown as valid while its CSID columns are read from different positions.
  const columns = resolveCsidColumns(headers);
  const hasId = columns.id >= 0;
  const hasName = columns.name >= 0;
  const hasBpo = columns.bpo >= 0;
  const hasTl = columns.teamLeader >= 0;

  if (!hasId || !hasName || !hasBpo || !hasTl) {
    let missing = [];
    if (!hasId) missing.push('CS ID');
    if (!hasName) missing.push('Agent Name');
    if (!hasBpo) missing.push('BPO');
    if (!hasTl) missing.push('Team Leader');
    
    return {
      isValid: false,
      errorType: 'MISSING_COLUMN',
      message: `Kolom wajib tidak ditemukan: ${missing.join(', ')}.`,
      severity: 'error'
    };
  }

  const rows = countDataRows(parsedData);
  if (rows < 5) {
    return {
      isValid: false,
      errorType: 'FEW_ROWS',
      message: `File hanya memiliki ${rows} baris data, mungkin tidak lengkap.`,
      severity: 'warning'
    };
  }

  return { isValid: true, severity: 'ok' };
}

export function validateProductivityFile(parsedData: any[][]): ValidationResult {
  const base = getBaseIssues(parsedData);
  if (base && base.errorType !== 'FEW_ROWS') return base;

  const columns = resolveProductivityColumns(parsedData);
  const missing = missingHeaderLabels(columns, {
    date: 'Date / Tanggal',
    csId: 'CS ID',
    productivity: 'Productivity',
  });

  let rowsWithCsId = 0;
  let rowsWithProdValue = 0;
  const startRow = parsedData.length > 2 ? 2 : 1;
  for (let i = startRow; i < parsedData.length; i++) {
    const row = parsedData[i];
    const resolved = resolveRowCsId(row, columns.csId);
    if (!resolved.id) continue;
    rowsWithCsId++;
    const prodIdx = pickColumn(columns.productivity, resolved.index >= 0 ? resolved.index + 8 : -1);
    const prodRaw = cell(row, prodIdx).replace(',', '.');
    if (prodRaw && !Number.isNaN(parseFloat(prodRaw))) rowsWithProdValue++;
  }

  if (columns.date < 0 && columns.csId < 0 && columns.productivity < 0 && rowsWithCsId === 0) {
    return {
      isValid: false,
      errorType: 'MISSING_COLUMN',
      message: `Kolom wajib Productivity tidak ditemukan: ${missing.join(', ')}.`,
      severity: 'error',
    };
  }

  if (rowsWithCsId === 0) {
    return {
      isValid: false,
      errorType: 'MISSING_CSID',
      message: 'Tidak menemukan baris Productivity dengan CS ID.',
      severity: 'error',
    };
  }

  if (rowsWithProdValue === 0) {
    return {
      isValid: false,
      errorType: 'MISSING_PRODUCTIVITY_VALUE',
      message: columns.productivity < 0
        ? 'CS ID ditemukan, tapi kolom Productivity tidak terbaca dari header maupun offset lama.'
        : 'CS ID ditemukan, tapi nilai Productivity kosong/tidak numerik.',
      severity: 'error',
    };
  }
  
  const rows = countDataRows(parsedData);
  if (rows < 5) {
    return {
      isValid: false,
      errorType: 'FEW_ROWS',
      message: `File hanya memiliki ${rows} baris data, mungkin tidak lengkap.`,
      severity: 'warning'
    };
  }

  return { isValid: true, severity: 'ok' };
}

export function validateCsatScFile(parsedData: any[][]): ValidationResult {
  const base = getBaseIssues(parsedData);
  if (base && base.errorType !== 'FEW_ROWS') return base;

  const columns = resolveCsatScColumns(extractHeaders(parsedData));
  let rowsWithCsId = 0;
  for (let i = 1; i < parsedData.length; i++) {
    if (resolveRowCsId(parsedData[i], columns.csId).id) rowsWithCsId++;
  }

  if (rowsWithCsId === 0 && columns.score < 0 && columns.ticketId < 0) {
    return {
      isValid: false,
      errorType: 'MISSING_COLUMN',
      message: 'Kolom CSAT SC tidak lengkap: butuh CS ID, Score, atau Ticket ID.',
      severity: 'error'
    };
  }

  const rows = countDataRows(parsedData);
  if (rows < 5) {
    return {
      isValid: false,
      errorType: 'FEW_ROWS',
      message: `File hanya memiliki ${rows} baris data, mungkin tidak lengkap.`,
      severity: 'warning'
    };
  }

  return { isValid: true, severity: 'ok' };
}

export function validateSlaFile(parsedData: any[][]): ValidationResult {
  const base = getBaseIssues(parsedData);
  if (base && base.errorType !== 'FEW_ROWS') return base;

  const parseSlaLikeProcessor = (value: unknown): number | null => {
    const clean = String(value || '').replace(',', '.').trim();
    if (!clean) return null;
    if (clean.includes('%')) {
      const pct = parseFloat(clean.replace('%', ''));
      return Number.isNaN(pct) ? null : pct;
    }
    const n = parseFloat(clean);
    return Number.isNaN(n) ? null : n * 100;
  };

  const columns = resolveSlaColumns(parsedData);
  let rowsWithCsId = 0;
  let rowsWithSlaValue = 0;

  for (let i = 1; i < parsedData.length; i++) {
    const row = parsedData[i];
    if (!row || !Array.isArray(row)) continue;

    const resolved = resolveRowCsId(row, columns.csId);
    if (!resolved.id) continue;

    rowsWithCsId++;

    const sla1Idx = pickColumn(columns.sla1m, resolved.index >= 0 ? resolved.index + 11 : -1);
    const sla3Idx = pickColumn(columns.sla3m, resolved.index >= 0 ? resolved.index + 13 : -1);
    const sla1 = parseSlaLikeProcessor(cell(row, sla1Idx));
    const sla3 = parseSlaLikeProcessor(cell(row, sla3Idx));
    if (sla1 !== null || sla3 !== null) rowsWithSlaValue++;
  }

  if (rowsWithCsId === 0) {
    return {
      isValid: false,
      errorType: 'MISSING_CSID',
      message: 'Tidak menemukan baris SLA dengan CS ID.',
      severity: 'error'
    };
  }

  if (rowsWithSlaValue === 0) {
    return {
      isValid: false,
      errorType: 'MISSING_SLA_VALUE',
      message: columns.sla1m < 0 && columns.sla3m < 0
        ? 'CS ID ditemukan, tapi header SLA 1m/3m tidak ada dan offset lama +11/+13 kosong.'
        : 'CS ID ditemukan, tapi nilai SLA 1m/3m tidak terbaca.',
      severity: 'error'
    };
  }
  
  const rows = countDataRows(parsedData);
  if (rows < 5) {
    return {
      isValid: false,
      errorType: 'FEW_ROWS',
      message: `File hanya memiliki ${rows} baris data, mungkin tidak lengkap.`,
      severity: 'warning'
    };
  }

  return { isValid: true, severity: 'ok' };
}

export function validateScheduleFile(parsedData: any[][]): ValidationResult {
  const base = getBaseIssues(parsedData);
  if (base && base.errorType !== 'FEW_ROWS') return base;

  let maxCols = 0;
  for (let i = 0; i < Math.min(parsedData.length, 10); i++) {
    const row = parsedData[i];
    if (row && row.length > maxCols) maxCols = row.length;
  }

  if (maxCols < 6) {
    return {
      isValid: false,
      errorType: 'FEW_COLUMNS',
      message: `File ini terlalu sempit (hanya ${maxCols} kolom) untuk menjadi file Schedule.`,
      severity: 'error'
    };
  }

  // Check some data logic
  const topRowsContent = parsedData.slice(0, 10).map(row => row.join(' ').toLowerCase()).join(' ');
  const hasShiftKeywords = topRowsContent.includes('off') || topRowsContent.includes('pullout') || topRowsContent.includes('sick');
  
  // Checking format shift in body (e.g. \d{2}:\d{2} or OFF or PULLOUT)
  let hasShiftTime = false;
  for (let i = 1; i < Math.min(parsedData.length, 10); i++) {
    const row = parsedData[i];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').trim().toUpperCase();
      if (/^\d{1,2}:\d{2}/.test(cell) || cell === 'OFF' || cell === 'PULLOUT') {
        hasShiftTime = true;
        break;
      }
    }
  }

  if (!hasShiftTime && !hasShiftKeywords) {
    return {
      isValid: false,
      errorType: 'INVALID_FORMAT',
      message: 'Format mencurigakan: tidak ada data shift atau OFF/PULLOUT di beberapa baris pertama.',
      severity: 'error'
    };
  }

  const rows = countDataRows(parsedData);
  if (rows < 5) {
    return {
      isValid: false,
      errorType: 'FEW_ROWS',
      message: `File hanya memiliki ${rows} baris data, mungkin tidak lengkap.`,
      severity: 'warning'
    };
  }
  return { isValid: true, severity: 'ok' };
}

export function validateQaFile(parsedData: any[][]): ValidationResult {
  const base = getBaseIssues(parsedData);
  if (base && base.errorType !== 'FEW_ROWS') return base;

  const columns = resolveQaColumns(extractHeaders(parsedData));
  const hasIdentity = columns.csId >= 0 || columns.date >= 0 || columns.score >= 0;
  const keywords = ['QA', 'Score', 'Defect', 'CSAT', 'QC', 'Mistake', 'Quality', 'Audit', 'Indicator', 'KODE', 'Banding'];
  
  const rowsToScan = parsedData.slice(0, 5);
  const combinedText = rowsToScan.map(row => (row || []).join(' ').toLowerCase()).join(' ');
  
  let matchCount = 0;
  for (const keyword of keywords) {
    if (combinedText.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }

  if (!hasIdentity && matchCount < 2) {
    return {
      isValid: false,
      errorType: 'MISSING_COLUMN',
      message: 'Kolom indikator QA (CS ID, Checking Date, QC Score, atau keyword QA/Defect) tidak cukup.',
      severity: 'error'
    };
  }

  // Legacy exports need 33 columns when headers are missing. Header-mapped
  // files can be narrower without silently dropping QC score / category.
  const maxColumns = parsedData.reduce(
    (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
    0,
  );
  const mappedCore = columns.csId >= 0 && columns.date >= 0 && columns.score >= 0;
  if (!mappedCore && maxColumns < 33) {
    return {
      isValid: false,
      errorType: 'SCHEMA_TOO_NARROW',
      message: `Struktur QA kurang kolom (Punya: ${maxColumns}, butuh header CS ID/Checking Date/QC Score atau minimal 33 sampai kolom AG).`,
      severity: 'error',
    };
  }
  
  const rows = countDataRows(parsedData);
  if (rows < 5) {
    return {
      isValid: false,
      errorType: 'FEW_ROWS',
      message: `File hanya memiliki ${rows} baris data, mungkin tidak lengkap.`,
      severity: 'warning'
    };
  }

  return { isValid: true, severity: 'ok' };
}

/**
 * Shared header aliases for sheet/CSV parsers and File Center validators.
 * Column order can change; resolvers prefer header names, then legacy offsets.
 */

export const normalizeHeader = (value: unknown) =>
  String(value || '').toLowerCase().replace(/[\s_-]/g, '');

export function findHeader(headers: unknown[], aliases: readonly string[]) {
  // Prefer earlier aliases so "CS ID" wins over a generic "ID" column.
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    if (!normalizedAlias) continue;
    const index = headers.findIndex((header) => normalizeHeader(header) === normalizedAlias);
    if (index >= 0) return index;
  }
  return -1;
}

export function findHeaderIncludes(headers: unknown[], terms: readonly string[]) {
  // Prefer earlier aliases so "Checking Date" wins over a generic "Date".
  for (const term of terms) {
    const normalizedTerm = normalizeHeader(term);
    if (!normalizedTerm) continue;
    const index = headers.findIndex((header) => {
      const value = normalizeHeader(header);
      return value.length > 0 && value.includes(normalizedTerm);
    });
    if (index >= 0) return index;
  }
  return -1;
}

export function findHeaderInRows(rows: unknown[][], aliases: readonly string[]) {
  for (const row of rows) {
    const index = findHeader(row || [], aliases);
    if (index >= 0) return index;
  }
  return -1;
}

export function findHeaderIncludesInRows(rows: unknown[][], terms: readonly string[]) {
  for (const row of rows) {
    const index = findHeaderIncludes(row || [], terms);
    if (index >= 0) return index;
  }
  return -1;
}

export function cell(row: unknown[] | undefined, index: number) {
  if (!row || index < 0 || index >= row.length) return '';
  return String(row[index] ?? '').trim();
}

export function isLegacyCsId(value: unknown) {
  return String(value || '').trim().startsWith('3-1-');
}

export function findLegacyCsIdIndex(row: unknown[] | undefined) {
  if (!row) return -1;
  return row.findIndex((item) => isLegacyCsId(item));
}

const CS_ID_ALIASES = ['CS ID', 'csid', 'id', 'cs_id', 'agent id', 'csid agent'];
const TICKET_ALIASES = ['ticket id', 'ticket', 'ticketid', 'id ticket', 'case id'];
const CHAT_ALIASES = ['chat id', 'chatid', 'chat', 'room id'];
const UID_ALIASES = ['uid', 'user id', 'userid', 'customer id'];

export const PRODUCTIVITY_STAR_ALIASES = {
  star5: ['csat 5', 'star 5', '5 star', 'rating 5', 'score 5', '5*'],
  star4: ['csat 4', 'star 4', '4 star', 'rating 4', 'score 4', '4*'],
  star3: ['csat 3', 'star 3', '3 star', 'rating 3', 'score 3', '3*'],
  star2: ['csat 2', 'star 2', '2 star', 'rating 2', 'score 2', '2*'],
  star1: ['csat 1', 'star 1', '1 star', 'rating 1', 'score 1', '1*'],
} as const;

export type ProductivityColumns = {
  date: number;
  csId: number;
  productivity: number;
  csatAsli: number;
  whu: number;
  star5: number;
  star4: number;
  star3: number;
  star2: number;
  star1: number;
};

export type CsatScColumns = {
  date: number;
  csId: number;
  ticketId: number;
  chatId: number;
  uid: number;
  category: number;
  score: number;
  response: number;
  timestamp: number;
  rcaAgent: number;
  rcaCustomer: number;
  rcaAkulaku: number;
};

export type SlaColumns = {
  date: number;
  csId: number;
  ticketId: number;
  sla1m: number;
  sla3m: number;
};

export type QaColumns = {
  csId: number;
  date: number;
  ticketId: number;
  uid: number;
  chatId: number;
  caseDate: number;
  systemCheckingType: number;
  qcName: number;
  mistakeLevel: number;
  score: number;
  category: number;
  remarks: number;
  crmKode: number;
};

export type ScheduleIdentityColumns = {
  csId: number;
  name: number;
  teamLeader: number;
  bpo: number;
  firstDateColumn: number;
};

function firstHeaderRows(data: unknown[][], count: number) {
  return data.slice(0, Math.min(count, data.length));
}

export function resolveProductivityColumns(data: unknown[][]): ProductivityColumns {
  const headerRows = firstHeaderRows(data, 3);
  return {
    date: findHeaderIncludesInRows(headerRows, ['date', 'tanggal', 'waktu', 'timestamp']),
    csId: findHeaderInRows(headerRows, CS_ID_ALIASES),
    productivity: findHeaderIncludesInRows(headerRows, ['productivity', 'produktivitas', 'chat handled', 'ticket handled']),
    csatAsli: (() => {
      const specific = findHeaderIncludesInRows(headerRows, ['csat asli', 'csat official', 'csat avg', 'avg csat']);
      if (specific >= 0) return specific;
      return findHeaderInRows(headerRows, ['CSAT']);
    })(),
    whu: findHeaderInRows(headerRows, ['WHU', 'whu %']),
    star5: findHeaderInRows(headerRows, PRODUCTIVITY_STAR_ALIASES.star5),
    star4: findHeaderInRows(headerRows, PRODUCTIVITY_STAR_ALIASES.star4),
    star3: findHeaderInRows(headerRows, PRODUCTIVITY_STAR_ALIASES.star3),
    star2: findHeaderInRows(headerRows, PRODUCTIVITY_STAR_ALIASES.star2),
    star1: findHeaderInRows(headerRows, PRODUCTIVITY_STAR_ALIASES.star1),
  };
}

export function resolveCsatScColumns(headers: unknown[]): CsatScColumns {
  // Score is resolved by header only. The previous data-based fallback
  // (findScoreColumnByData) misread the date column as the score column
  // because parseFloat('5/8/2026') === 5, which made CSAT Room show only
  // days 1-5 with the date number as the score. With placeholder headers
  // the score falls back to the legacy offset (idIdx + 11) in processCsatSc,
  // which lands on column O. (Restored to the pre-5126aeb behavior.)
  return {
    date: findHeaderIncludes(headers, ['date', 'tanggal']),
    csId: findHeader(headers, CS_ID_ALIASES),
    ticketId: findHeaderIncludes(headers, TICKET_ALIASES),
    chatId: findHeaderIncludes(headers, CHAT_ALIASES),
    uid: findHeaderIncludes(headers, UID_ALIASES),
    category: findHeaderIncludes(headers, ['category', 'kategori', 'case category']),
    score: findHeaderIncludes(headers, ['csat score', 'score', 'rating']),
    response: findHeaderIncludes(headers, ['response', 'respon', 'feedback', 'comment', 'komentar']),
    timestamp: findHeaderIncludes(headers, ['timestamp', 'close time', 'waktu close', 'close']),
    rcaAgent: findHeader(headers, ['RCA Agent Area', 'rca agent']),
    rcaCustomer: findHeader(headers, ['RCA Customer Area', 'rca customer']),
    rcaAkulaku: findHeader(headers, ['RCA Akulaku Process', 'rca akulaku']),
  };
}

export function resolveSlaColumns(data: unknown[][]): SlaColumns {
  const headerRows = firstHeaderRows(data, 2);
  return {
    date: findHeaderIncludesInRows(headerRows, ['date', 'tanggal', 'time', 'waktu']),
    csId: findHeaderInRows(headerRows, CS_ID_ALIASES),
    ticketId: findHeaderIncludesInRows(headerRows, TICKET_ALIASES),
    sla1m: findHeaderIncludesInRows(headerRows, ['sla 1m', 'sla1m', 'sla 1 min']),
    sla3m: findHeaderIncludesInRows(headerRows, ['sla 3m', 'sla3m', 'sla 3 min']),
  };
}

export function resolveQaColumns(headers: unknown[]): QaColumns {
  const caseDate = findHeaderIncludes(headers, ['case date', 'tanggal case', 'tgl case']);
  const checkingDate = findHeaderIncludes(headers, [
    'checking date',
    'check date',
    'qa date',
    'qc date',
    'tanggal checking',
    'tgl checking',
    'tanggal qc',
    'tgl qc',
  ]);
  const genericDate = findHeaderIncludes(headers, ['date', 'tanggal']);
  const qcScore = findHeaderIncludes(headers, ['qc score', 'qa score', 'final score', 'nilai qc', 'nilai qa']);

  return {
    csId: findHeader(headers, CS_ID_ALIASES),
    date: checkingDate >= 0
      ? checkingDate
      : (genericDate >= 0 && genericDate !== caseDate ? genericDate : -1),
    ticketId: findHeaderIncludes(headers, ['ticket id', 'ticketid', 'id ticket']),
    uid: findHeaderIncludes(headers, UID_ALIASES),
    chatId: findHeaderIncludes(headers, CHAT_ALIASES),
    caseDate,
    systemCheckingType: findHeaderIncludes(headers, ['system checking', 'checking type', 'tipe checking']),
    qcName: findHeaderIncludes(headers, ['qc name', 'qa name', 'auditor', 'checker']),
    mistakeLevel: findHeaderIncludes(headers, ['mistake level', 'defect level', 'severity']),
    score: qcScore >= 0 ? qcScore : findHeader(headers, ['Score', 'Nilai']),
    category: findHeaderIncludes(headers, ['category', 'kategori', 'defect category']),
    remarks: findHeaderIncludes(headers, ['remarks', 'remark', 'catatan', 'notes']),
    crmKode: findHeaderIncludes(headers, ['crm kode', 'crm code', 'kode crm']),
  };
}

export function resolveScheduleIdentityColumns(headers: unknown[]): ScheduleIdentityColumns {
  const csId = findHeader(headers, CS_ID_ALIASES);
  const name = findHeader(headers, ['Agent Name', 'name', 'Nama']);
  const teamLeader = findHeader(headers, ['Team Leader', 'TL', 'leader', 'supervisor']);
  const bpo = findHeader(headers, ['BPO', 'company', 'Perusahaan']);
  return {
    csId: csId >= 0 ? csId : 1,
    name: name >= 0 ? name : 2,
    teamLeader: teamLeader >= 0 ? teamLeader : 3,
    bpo: bpo >= 0 ? bpo : 4,
    firstDateColumn: 5,
  };
}

export function resolveRowCsId(row: unknown[] | undefined, headerIdx: number) {
  const fromHeader = cell(row, headerIdx);
  if (fromHeader) return { index: headerIdx, id: fromHeader };
  const fallbackIdx = findLegacyCsIdIndex(row);
  return { index: fallbackIdx, id: cell(row, fallbackIdx) };
}

export function pickColumn(headerIdx: number, fallbackIdx: number) {
  return headerIdx >= 0 ? headerIdx : fallbackIdx;
}

export function missingHeaderLabels(columns: Record<string, number>, labels: Record<string, string>) {
  return Object.entries(labels)
    .filter(([key]) => (columns[key] ?? -1) < 0)
    .map(([, label]) => label);
}

import { cell, findLegacyCsIdIndex, isLegacyCsId } from './sheetHeaders';
import { isAgentDictionaryPopulated } from './csid';
import { normalizeDateStr } from './dates';
import { processSchedule } from './processors/schedule';
import { processProductivity } from './processors/productivity';
import { processCsatSc } from './processors/csatSc';
import { processSla } from './processors/sla';
import { processQa } from './processors/qa';
import { finalizeAgents } from './processors/finalize';
import {
  createAccumulators,
  createDedupeSets,
  type ProcessorContext,
} from './processors/context';

export interface CSATEntry {
  date: string;
  normDate?: string | null;
  ticketId: string;
  chatId: string;
  uid: string;
  score: number;
  category: string;
  response: string;
  isTakeout: boolean;
  rcaAgent?: string;
  rcaCustomer?: string;
  rcaAkulaku?: string;
  agentName?: string;
  csId?: string;
}

export interface QAEntry {
  date: string;
  normDate?: string | null;
  systemCheckingType?: string;
  ticketId: string;
  chatId?: string;
  uid?: string;
  qcName?: string;
  caseDate?: string;
  mistakeLevel: string;
  category: string;
  remarks: string;
  score: number;
  hasScore?: boolean;
  crmKode?: string;
}

export interface HistoryEntry {
  date: string;
  normDate?: string | null;
  value: number;
  count?: number;
  sum?: number;
}

export const CSAT_TAKEOUT_CATEGORIES = [
  "tidak bisa transaksi namun memiliki limit",
  "pengajuan limit kredit ditolak",
  "pertanyaan belum bisa diidentifikasi",
] as const;

const normalizeCsatCategory = (value: unknown) =>
  String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

export const isCsatTakeoutCategory = (category: unknown) =>
  CSAT_TAKEOUT_CATEGORIES.includes(
    normalizeCsatCategory(category) as (typeof CSAT_TAKEOUT_CATEGORIES)[number],
  );

export const isValidCsatScScore = (score: number) =>
  score === 1 || score === 2 || score === 4 || score === 5;

export interface AgentKPI {
  csId: string;
  name: string;
  bpo: string;
  teamLeader: string;
  productivityBase: number;
  productivityTotal: number;
  productivityAverage: number;
  manDays: number;
  targetQuota: number;
  gap: number;
  csatRespondents: number;
  csat5Count: number;
  csat4Count: number;
  csat3Count: number;
  csat2Count: number;
  csat1Count: number;

  attendanceDuty: number;
  attendancePresence: number;
  attendanceOff: number;
  attendanceS: number;
  attendanceC: number;
  attendancePullout: number;
  attendanceTotalDays: number;
  attendanceScore: number;

  csatAsli: number | null;
  whu: number | null;

  csatScFullCount: number;
  csatScGoodCount: number;
  csatScBadCount: number;
  csatScTotalValid: number;
  csatScFull: number | null;

  csatScFairCount: number;
  csatScFairGoodCount: number;
  csatScFairBadCount: number;
  csatScFairTotalValid: number;
  csatScFair: number | null;

  csatScCategoriesFull: Record<string, number>;
  csatScCategoriesFair: Record<string, number>;
  csatScScoreDistribution: Record<string, Record<string, number>>;

  csatScBadScoreFullCount: number;
  csatScBadScoreFairCount: number;

  // RCA (Root Cause Analysis)
  rcaAgentAreaCounts: Record<string, number>;
  rcaCustomerAreaCounts: Record<string, number>;
  rcaAkulakuProcessCounts: Record<string, number>;
  rcaTotalCases: number;

  sla1m: number | null;
  sla3m: number | null;
  sla1mCount: number;
  sla3mCount: number;

  qaScoreSum: number;
  qaScoreCount: number;
  qaHistory: QAEntry[];
  csatHistory: CSATEntry[];
  hourlyProductivity: number[];
  hourlyCategoryCounts: Record<string, number>[];
  dailyHistory: {
    productivity: HistoryEntry[];
    csat: HistoryEntry[];
    csatScFull: { date: string; normDate?: string | null; score: number; count: number }[];
    csatScFair: { date: string; normDate?: string | null; score: number; count: number }[];
    sla1m: HistoryEntry[];
    sla3m: HistoryEntry[];
    whu: HistoryEntry[];
    schedule: {
      date: string;
      status: string;
      isManDay: boolean;
      normDate: string | null;
    }[];
  };
}

export interface AgentScopeFilters {
  bpo?: string;
  teamLeader?: string;
  agent?: string;
}

const PERIOD_MONTH_CODES = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

const normalizeScopeValue = (value: unknown) =>
  String(value || "").trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Keep standalone BPOs distinct from the shared TCID × TIN roster.
 * Source sheets use a few separators (`x`, `×`, `&`, `/`), so normalize
 * them into one canonical combined value before strict scope comparison.
 */
const normalizeBpoScope = (value: unknown) => {
  const normalized = normalizeScopeValue(value)
    .replace(/[×&/+]/g, " X ")
    .replace(/\s*X\s*/g, " X ")
    .trim();
  const tokens = new Set(normalized.split(" ").filter(Boolean));
  if (tokens.has("TCID") && tokens.has("TIN")) return "TCID X TIN";
  return normalized;
};

const matchesScopePersonName = (left: unknown, right: unknown) => {
  const leftValue = normalizeScopeValue(left);
  const rightValue = normalizeScopeValue(right);
  if (!leftValue || !rightValue) return false;
  if (leftValue === rightValue) return true;

  const leftParts = leftValue.split(" ");
  const rightParts = rightValue.split(" ");
  return (leftParts.length === 1 && rightParts.includes(leftParts[0]))
    || (rightParts.length === 1 && leftParts.includes(rightParts[0]));
};

const isAllScopeValue = (value: unknown, allValues: string[]) => {
  const normalized = normalizeScopeValue(value);
  return !normalized || allValues.includes(normalized);
};

export const matchesAgentScope = (
  agent: Pick<AgentKPI, "bpo" | "teamLeader" | "name" | "csId">,
  filters: AgentScopeFilters,
) => {
  const selectedBpo = normalizeBpoScope(filters.bpo);
  const selectedTeamLeader = normalizeScopeValue(filters.teamLeader);
  const selectedAgent = normalizeScopeValue(filters.agent);

  const bpoMatches = isAllScopeValue(filters.bpo, ["ALL BPO"])
    || normalizeBpoScope(agent.bpo) === selectedBpo;
  const teamLeaderMatches = isAllScopeValue(filters.teamLeader, ["ALL TL", "ALL TEAM LEADERS"])
    || matchesScopePersonName(agent.teamLeader, selectedTeamLeader);
  const agentMatches = isAllScopeValue(filters.agent, ["ALL AGENTS"])
    || normalizeScopeValue(agent.name) === selectedAgent
    || normalizeScopeValue(agent.csId) === selectedAgent;

  return bpoMatches && teamLeaderMatches && agentMatches;
};

export const getAgentDictionaryForPeriod = (
  periodStart: string | undefined,
  fallbackDictionary?: Record<string, { name: string; bpo: string; teamLeader: string }>,
  dictionariesByMonth?: Record<string, Record<string, { name: string; bpo: string; teamLeader: string }>>,
) => {
  if (!dictionariesByMonth || Object.keys(dictionariesByMonth).length === 0) {
    return fallbackDictionary;
  }

  const [year, month] = String(periodStart || "").split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return fallbackDictionary;

  const monthKey = `${PERIOD_MONTH_CODES[month - 1]}_${year}`;
  const monthDictionary = dictionariesByMonth[monthKey];
  const legacyDictionary = monthKey === "MAY_2026" ? dictionariesByMonth.legacy : undefined;
  return (
    (isAgentDictionaryPopulated(monthDictionary) ? monthDictionary : undefined)
    || (isAgentDictionaryPopulated(legacyDictionary) ? legacyDictionary : undefined)
    || fallbackDictionary
  );
};

export const applyAgentRoster = (
  agents: AgentKPI[],
  roster?: Record<string, { name: string; bpo: string; teamLeader: string }>,
) => agents.map((agent) => {
  const rosterInfo = roster?.[agent.csId] || roster?.[String(agent.csId || "").trim()];
  if (!rosterInfo) return agent;

  return {
    ...agent,
    name: rosterInfo.name || agent.name,
    bpo: rosterInfo.bpo || agent.bpo,
    teamLeader: rosterInfo.teamLeader || agent.teamLeader,
  };
});

const normalizeQaIdentifier = (value: unknown) =>
  String(value || "").trim().toLowerCase();

export const isBadCsatQaEntry = (entry: Pick<QAEntry, "systemCheckingType" | "mistakeLevel">) => {
  const checkingType = normalizeQaIdentifier(entry.systemCheckingType).toUpperCase();
  const mistakeLevel = normalizeQaIdentifier(entry.mistakeLevel).toUpperCase();

  return (
    checkingType === "CSAT" &&
    mistakeLevel !== "" &&
    !mistakeLevel.includes("NO MISTAKE")
  );
};

export const getCsatBadRatingCount = (agent: Pick<AgentKPI, "qaHistory">) => {
  const seenCases = new Set<string>();

  return agent.qaHistory.reduce((count, entry) => {
    if (!isBadCsatQaEntry(entry)) return count;

    const primaryCaseId = [entry.ticketId, entry.chatId, entry.uid, entry.caseDate]
      .map(normalizeQaIdentifier)
      .find(Boolean);
    const fallbackCaseId = [
      entry.normDate || entry.date,
      entry.qcName,
      entry.mistakeLevel,
      entry.category,
    ].map(normalizeQaIdentifier).join("|");
    const caseKey = primaryCaseId || fallbackCaseId;

    if (seenCases.has(caseKey)) return count;
    seenCases.add(caseKey);
    return count + 1;
  }, 0);
};

export const getOfficialCsatAggregate = (data: AgentKPI[]) => {
  let points = 0;
  let respondents = 0;

  data.forEach((agent) => {
    points +=
      agent.csat5Count * 5 +
      agent.csat4Count * 4 +
      agent.csat3Count * 3 +
      agent.csat2Count * 2 +
      agent.csat1Count;
    respondents += agent.csatRespondents;
  });

  return {
    points,
    respondents,
    score: respondents > 0 ? points / respondents : null,
  };
};

// Helpers
export function getPreviousPeriod(startDate: string, endDate: string) {
  if (!startDate || !endDate) return { start: '', end: '' };
  const toLocalDate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  };
  const start = toLocalDate(startDate);
  const end = toLocalDate(endDate);
  
  // Calculate duration in days
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - diffDays + 1);
  
  return {
    start: toIsoDate(prevStart),
    end: toIsoDate(prevEnd)
  };
}

export function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getPreviousMonthDate(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const previousMonthLastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, previousMonthLastDay));
}

export function getPreviousMonthPeriod(startDate: string, endDate: string) {
  if (!startDate || !endDate) return { start: '', end: '' };

  return {
    start: toIsoDate(getPreviousMonthDate(new Date(startDate))),
    end: toIsoDate(getPreviousMonthDate(new Date(endDate))),
  };
}

// normalizeDateStr moved to lib/dates.ts — re-exported for backward compat.
export { normalizeDateStr } from './dates';


/** Shift duty / man-day: numeric shift code, HH:MM time, or S (sakit). */
export function isScheduleManDay(statusRaw: string): boolean {
  const status = String(statusRaw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!status) return false;
  if (status === "S") return true;
  if (status === "OFF" || status === "C" || status === "PULLOUT") return false;
  // Pure shift number: 7, 14, 22, 8.0, etc.
  if (/^\d+([.,]\d+)?$/.test(status)) return true;
  // Time-format shift: 07:00, 22:00
  if (/^\d{1,2}:\d{2}/.test(status)) return true;
  return false;
}

export function normalizeScheduleStatus(statusRaw: string): string {
  const status = String(statusRaw || "").trim().toUpperCase();
  if (status.replace(/\s+/g, "") === "PULLOUT") return "PULLOUT";
  return status;
}

export function readStarCount(row: unknown[] | undefined, index: number) {
  const raw = cell(row, index);
  if (!raw || isLegacyCsId(raw)) return 0;
  return parseFloat(raw.replace(",", ".")) || 0;
}

export function transactionKey(parts: Array<string | number | null | undefined>) {
  return parts.map((part) => String(part || "").trim().toLowerCase()).join("|");
}

export function ticketOccurrenceKey(
  agentId: string,
  normDate: string | null | undefined,
  dateStr: string,
  ticketId: string,
  fallbackParts: Array<string | null | undefined> = [],
) {
  const agent = String(agentId || "").trim().toLowerCase();
  const day = String(normDate || normalizeDateStr(dateStr) || dateStr || "").trim().toLowerCase();
  const ticket = String(ticketId || "").trim().toLowerCase();
  if (ticket) return `${agent}|${day}|${ticket}`;
  const fallback = fallbackParts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("|")
    .toLowerCase();
  if (!fallback) return "";
  return `${agent}|${day}|${fallback}`;
}

export function productivityDataStartRow(data: any[][]) {
  if (data.length <= 1) return data.length;
  const probe = data[1] || [];
  const looksLikeData =
    findLegacyCsIdIndex(probe) >= 0 || !!normalizeDateStr(String(probe[0] || ""));
  return looksLikeData ? 1 : 2;
}


export const processKPIs = (
  prodData: any[][] = [],
  csatData: any[][] = [],
  slaData: any[][] = [],
  schedData: any[][] = [],
  qaData: any[][] = [],
  startDate?: string,
  endDate?: string,
  agentDictionary?: Record<
    string,
    { name: string; bpo: string; teamLeader: string }
  >,
  agentDictionaryByMonth?: Record<
    string,
    Record<string, { name: string; bpo: string; teamLeader: string }>
  >,
): AgentKPI[] => {
  const agents: Record<string, AgentKPI> = {};

  const periodDictionary = getAgentDictionaryForPeriod(
    startDate || endDate,
    agentDictionary,
    agentDictionaryByMonth,
  );

  const isWithin = (dStr: string | null) => {
    if (!startDate && !endDate) return true;
    if (!dStr) return false;
    if (startDate && dStr < startDate) return false;
    if (endDate && dStr > endDate) return false;
    return true;
  };

  const subtractOneDay = (dStr: string) => {
    const parts = dStr.split("-").map((p) => parseInt(p, 10));
    if (parts.length !== 3 || parts.some((n) => isNaN(n))) return dStr;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() - 1);
    return toIsoDate(d);
  };

  const scheduleStatusByAgentDate = new Map<string, string>();
  const scheduleDateLabelByAgentDate = new Map<string, string>();
  const getScheduleKey = (agentId: string, normDate: string) =>
    `${agentId}|${normDate}`;

  const isShift22Status = (statusRaw: string) => {
    const status = String(statusRaw || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(",", ".");
    return status === "22" || status === "22.0" || status === "22:00" || status === "22:00:00";
  };

  const extractTimestampHour = (rawTimestamp: unknown) => {
    const match = String(rawTimestamp || "").match(
      /(?:^|[T\s])(\d{1,2}):\d{2}(?::\d{2})?/,
    );
    if (!match) return -1;

    const hour = Number(match[1]);
    return hour >= 0 && hour < 24 ? hour : -1;
  };

  const getShiftAdjustedDate = (
    agentId: string,
    normDate: string | null,
    hour: number,
  ) => {
    if (!normDate || hour < 0 || hour >= 7) return normDate;

    const previousDate = subtractOneDay(normDate);
    const previousStatus = scheduleStatusByAgentDate.get(
      getScheduleKey(agentId, previousDate),
    );

    return previousStatus && isShift22Status(previousStatus)
      ? previousDate
      : normDate;
  };

  const getScheduleDateLabel = (agentId: string, normDate: string | null) => {
    if (!normDate) return "";

    const scheduleLabel = scheduleDateLabelByAgentDate.get(
      getScheduleKey(agentId, normDate),
    );
    if (scheduleLabel) return scheduleLabel;

    const parts = normDate.split("-");
    return parts.length === 3
      ? `${parts[2]}/${parts[1]}/${parts[0]}`
      : normDate;
  };

  const getAgent = (id: string) => {
    const cleanId = String(id || "").trim();
    if (
      !cleanId ||
      cleanId === "0" ||
      cleanId === "-" ||
      cleanId.toLowerCase() === "total" ||
      cleanId.toLowerCase() === "currentaccount" ||
      cleanId.toLowerCase() === "cs id"
    )
      return null;
    if (!agents[cleanId]) {
      const dictInfo = periodDictionary?.[cleanId] || {
        name: "",
        bpo: "",
        teamLeader: "",
      };
      agents[cleanId] = {
        csId: cleanId,
        name: dictInfo.name,
        bpo: dictInfo.bpo,
        teamLeader: dictInfo.teamLeader,
        productivityBase: 0,
        productivityTotal: 0,
        productivityAverage: 0,
        targetQuota: 0,
        gap: 0,
        csatRespondents: 0,
        csat5Count: 0,
        csat4Count: 0,
        csat3Count: 0,
        csat2Count: 0,
        csat1Count: 0,
        attendanceDuty: 0,
        attendancePresence: 0,
        attendanceOff: 0,
        attendanceS: 0,
        attendanceC: 0,
        attendancePullout: 0,
        attendanceTotalDays: 0,
        attendanceScore: 0,
        manDays: 0,
        csatAsli: null,
        whu: null,
        csatScFullCount: 0,
        csatScGoodCount: 0,
        csatScBadCount: 0,
        csatScTotalValid: 0,
        csatScFull: null,
        csatScFairCount: 0,
        csatScFairGoodCount: 0,
        csatScFairBadCount: 0,
        csatScFairTotalValid: 0,
        csatScFair: null,
        csatScCategoriesFull: {},
        csatScCategoriesFair: {},
        csatScScoreDistribution: {
          "No Survey": {},
          "1": {},
          "2": {},
          "3": {},
          "4": {},
          "5": {},
        },
        csatScBadScoreFullCount: 0,
        csatScBadScoreFairCount: 0,
        rcaAgentAreaCounts: {},
        rcaCustomerAreaCounts: {},
        rcaAkulakuProcessCounts: {},
        rcaTotalCases: 0,
        sla1m: null,
        sla3m: null,
        sla1mCount: 0,
        sla3mCount: 0,
        qaScoreSum: 0,
        qaScoreCount: 0,
        qaHistory: [],
        csatHistory: [],
        hourlyProductivity: new Array(24).fill(0),
        hourlyCategoryCounts: Array.from({ length: 24 }, () => ({})),
        dailyHistory: {
          productivity: [],
          csat: [],
          csatScFull: [],
          csatScFair: [],
          sla1m: [],
          sla3m: [],
          whu: [],
          schedule: [],
        },
      };
    }
    return agents[cleanId];
  };

  if (periodDictionary) {
    Object.keys(periodDictionary).forEach((csId) => {
      getAgent(csId);
    });
  }

  const acc = createAccumulators();
  const dedupes = createDedupeSets();

  const ctx: ProcessorContext = {
    agents,
    getAgent,
    isWithin,
    periodDictionary,
    scheduleStatusByAgentDate,
    scheduleDateLabelByAgentDate,
    getScheduleKey,
    isShift22Status,
    extractTimestampHour,
    getShiftAdjustedDate,
    getScheduleDateLabel,
    subtractOneDay,
    ...acc,
    ...dedupes,
  };

  processSchedule(ctx, schedData);
  processProductivity(ctx, prodData);
  processCsatSc(ctx, csatData);
  processSla(ctx, slaData);
  processQa(ctx, qaData);

  return finalizeAgents(ctx);
};

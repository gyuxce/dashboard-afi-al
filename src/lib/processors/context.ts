import type { AgentKPI } from '../dataProcessor';

type AgentDictionary = Record<string, { name: string; bpo: string; teamLeader: string }>;

/**
 * Shared state passed through every domain processor. This keeps the
 * processors pure-ish (they mutate agents in place, same as the original
 * single function) without re-declaring closures in each file.
 */
export interface ProcessorContext {
  agents: Record<string, AgentKPI>;
  getAgent: (id: string) => AgentKPI | null;
  isWithin: (dStr: string | null) => boolean;
  periodDictionary: AgentDictionary | undefined;

  scheduleStatusByAgentDate: Map<string, string>;
  scheduleDateLabelByAgentDate: Map<string, string>;
  getScheduleKey: (agentId: string, normDate: string) => string;
  isShift22Status: (statusRaw: string) => boolean;
  extractTimestampHour: (rawTimestamp: unknown) => number;
  getShiftAdjustedDate: (
    agentId: string,
    normDate: string | null,
    hour: number,
  ) => string | null;
  getScheduleDateLabel: (agentId: string, normDate: string | null) => string;
  subtractOneDay: (dStr: string) => string;

  totalProdCsatAsliSum: Record<string, { sum: number; count: number }>;
  totalWhuSum: Record<string, { sum: number; count: number }>;
  sla1mSum: Record<string, { sum: number; count: number }>;
  sla3mSum: Record<string, { sum: number; count: number }>;

  seenProductivityEntries: Set<string>;
  seenCsatScEntries: Set<string>;
  seenCsatTickets: Set<string>;
  seenSlaEntries: Set<string>;
  seenSlaTickets: Set<string>;
  seenQaEntries: Set<string>;
  seenQaTicketScores: Set<string>;
}

export function createAccumulators() {
  return {
    totalProdCsatAsliSum: {} as Record<string, { sum: number; count: number }>,
    totalWhuSum: {} as Record<string, { sum: number; count: number }>,
    sla1mSum: {} as Record<string, { sum: number; count: number }>,
    sla3mSum: {} as Record<string, { sum: number; count: number }>,
  };
}

export function createDedupeSets() {
  return {
    seenProductivityEntries: new Set<string>(),
    seenCsatScEntries: new Set<string>(),
    seenCsatTickets: new Set<string>(),
    seenSlaEntries: new Set<string>(),
    seenSlaTickets: new Set<string>(),
    seenQaEntries: new Set<string>(),
    seenQaTicketScores: new Set<string>(),
  };
}

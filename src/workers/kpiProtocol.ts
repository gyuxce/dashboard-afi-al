import type { AgentKPI } from '../lib/dataProcessor';

export type PeriodRange = { start: string; end: string } | null;

export type AgentDict = Record<
  string,
  { name: string; bpo: string; teamLeader: string }
>;

export type KpiRawData = {
  productivityData: unknown[][];
  csatScData: unknown[][];
  slaData: unknown[][];
  scheduleData: unknown[][];
  qaData: unknown[][];
  agentDictionary: AgentDict;
  agentDictionaryByMonth: Record<string, AgentDict>;
};

export type KpiBundle = {
  rawData: AgentKPI[];
  previousRawData: AgentKPI[];
  previousRawData2: AgentKPI[];
  previousRawData3: AgentKPI[];
  /** Optional extra period (Pilot CSAT window incl. baseline). */
  pilotRawData: AgentKPI[];
};

export type KpiWorkerRequest =
  | { type: 'setData'; dataVersion: number; payload: KpiRawData }
  | {
      type: 'process';
      reqId: number;
      dataVersion: number;
      periods: {
        current: { start: string; end: string };
        prev1: PeriodRange;
        prev2: PeriodRange;
        prev3: PeriodRange;
        pilot: PeriodRange;
      };
    };

export type KpiWorkerResponse = {
  type: 'result';
  reqId: number;
  dataVersion: number;
  bundle: KpiBundle;
};

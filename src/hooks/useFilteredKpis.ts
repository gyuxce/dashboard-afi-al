import { useMemo } from 'react';
import {
  applyAgentRoster,
  getAgentDictionaryForPeriod,
  matchesAgentScope,
  type AgentKPI,
} from '../lib/dataProcessor';
import { isAgentDictionaryPopulated } from '../lib/csid';
import { applyCaseBasisQa } from '../lib/incentiveScoring';

type AgentDict = Record<string, { name: string; bpo: string; teamLeader: string }>;

export type FilteredKpis = {
  kpiData: AgentKPI[];
  previousKpiData: AgentKPI[];
  previousKpiData2: AgentKPI[];
  previousKpiData3: AgentKPI[];
  incentiveKpiData: AgentKPI[];
  weekKpiData: AgentKPI[][];
  extraKpiData: AgentKPI[][];
  incentivePeriod: { start: string; end: string };
  tlList: string[];
  agentList: string[];
};

type Args = {
  rawData: AgentKPI[];
  previousRawData: AgentKPI[];
  previousRawData2: AgentKPI[];
  previousRawData3: AgentKPI[];
  incentiveRawData: AgentKPI[];
  weekRawData: AgentKPI[][];
  extraRawData: AgentKPI[][];
  activeTab: string;
  startDate: string;
  endDate: string;
  selectedSheetMonth: string;
  selectedBpo: string;
  selectedTL: string;
  selectedGlobalAgent: string;
  agentDictionary: AgentDict;
  agentDictionaryByMonth: Record<string, AgentDict>;
};

/**
 * Roster overlay + scope filter. Simulasi Insentif now runs on the same live
 * period as every other tab (per 1 Sep 2026 the dashboard is live) — no more
 * previous-calendar-month special case.
 */
export function useFilteredKpis(args: Args): FilteredKpis {
  const {
    rawData, previousRawData, previousRawData2, previousRawData3, incentiveRawData, weekRawData, extraRawData,
    activeTab, startDate, endDate, selectedSheetMonth,
    selectedBpo, selectedTL, selectedGlobalAgent,
    agentDictionary, agentDictionaryByMonth,
  } = args;

  return useMemo(() => {
    const currentRoster = getAgentDictionaryForPeriod(
      startDate || endDate,
      agentDictionary,
      agentDictionaryByMonth,
    );
    const selectedMonthRoster = isAgentDictionaryPopulated(agentDictionaryByMonth[selectedSheetMonth])
      ? agentDictionaryByMonth[selectedSheetMonth]
      : currentRoster;
    const data = applyAgentRoster(rawData, selectedMonthRoster);

    const applyFilters = (d: AgentKPI[]) => {
      return d.filter(a => matchesAgentScope(a, {
        bpo: selectedBpo,
        teamLeader: selectedTL,
        agent: selectedGlobalAgent,
      }));
    };

    const filteredData = applyFilters(data);
    const incentiveByCsId = new Map(incentiveRawData.map((agent) => [agent.csId, agent]));
    const filteredPrevData = applyFilters(previousRawData);
    const filteredPrevData2 = applyFilters(previousRawData2);
    const filteredPrevData3 = applyFilters(previousRawData3);
    const filteredWeekData = weekRawData.map(applyFilters);
    const filteredExtraData = extraRawData.map(applyFilters);

    const bpoScopedData = data.filter(a => matchesAgentScope(a, {
      bpo: selectedBpo,
      teamLeader: 'All TL',
      agent: 'All Agents',
    }));

    const agents = new Set<string>();
    bpoScopedData
      .filter(a => matchesAgentScope(a, {
        bpo: selectedBpo,
        teamLeader: selectedTL,
        agent: 'All Agents',
      }))
      .forEach(a => {
        if (a.name && a.name !== '-') agents.add(a.name);
        else agents.add(a.csId);
      });

    const optionTls = new Set<string>();
    bpoScopedData.forEach(a => {
      if (a.teamLeader && a.teamLeader.trim() !== '') optionTls.add(a.teamLeader.trim());
    });

    return {
      kpiData: filteredData,
      previousKpiData: filteredPrevData,
      previousKpiData2: filteredPrevData2,
      previousKpiData3: filteredPrevData3,
      weekKpiData: filteredWeekData,
      extraKpiData: filteredExtraData,
      // QA (score and the history behind bad-CSAT) comes from the Tanggal Case pass; CSAT good
      // counts, productivity and everything else stay exactly as on the other tabs.
      // Empty until that pass lands.
      incentiveKpiData: activeTab === 'incentive' && incentiveRawData.length > 0
        ? filteredData.map((agent) => applyCaseBasisQa(agent, incentiveByCsId.get(agent.csId)))
        : [],
      incentivePeriod: { start: startDate || '', end: endDate || '' },
      tlList: Array.from(optionTls).sort((a, b) => a.localeCompare(b)),
      agentList: Array.from(agents).sort((a, b) => a.localeCompare(b)),
    };
  }, [
    agentDictionary,
    agentDictionaryByMonth,
    endDate,
    previousRawData,
    previousRawData2,
    previousRawData3,
    incentiveRawData,
    weekRawData,
    extraRawData,
    activeTab,
    rawData,
    selectedBpo,
    selectedGlobalAgent,
    selectedTL,
    startDate,
    selectedSheetMonth,
  ]);
}

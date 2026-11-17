import { normalizeDateStr, type AgentKPI, type QAEntry } from './dataProcessor';
import { formatDayMonth } from './dayCalendar';
import { formatNum, parseDateForSort } from './utils';

/** QA target, percent (KPI_TARGETS.qa). */
export const QA_TARGET = 92;

export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

/** A QA entry counts as a defect when its mistake level is LOW, MEDIUM, HIGH or VERY HIGH. */
export const isQaDefect = (entry: QAEntry) => {
  const level = (entry.mistakeLevel || '').toUpperCase();
  return level.includes('LOW') || level.includes('MEDIUM') || level.includes('HIGH') || level.includes('VERY HIGH');
};

export type QaDefectAgent = AgentKPI & {
  defects: QAEntry[];
  lowCount: number;
  mediumCount: number;
  highCount: number;
  veryHighCount: number;
  totalDefect: number;
  mostFrequentMistake: string;
};

/** Agents that have at least one QA score and match the search box (CS ID or name) / TL filter. */
export function filterQaAgents(data: AgentKPI[], search: string, filterTL: string | null): AgentKPI[] {
  const q = search.toLowerCase();
  return data.filter((a) => {
    const matchSearch = a.csId.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q);
    const matchTL = filterTL ? a.teamLeader === filterTL : true;
    return matchSearch && matchTL && a.qaScoreCount > 0;
  });
}

/** Per agent: defects newest-first, counts per severity (VERY HIGH is checked before HIGH), most frequent category. Sorted by total defects, most first. */
export function buildDefectData(agents: AgentKPI[]): QaDefectAgent[] {
  return agents
    .map((agent) => {
      const defects = agent.qaHistory
        .filter(isQaDefect)
        .sort((a, b) => parseDateForSort(b.normDate || b.date || '') - parseDateForSort(a.normDate || a.date || ''));

      let lowCount = 0;
      let mediumCount = 0;
      let highCount = 0;
      let veryHighCount = 0;
      const mistakeCounts: Record<string, number> = {};

      defects.forEach((d) => {
        const level = (d.mistakeLevel || '').toUpperCase();
        if (level.includes('VERY HIGH')) veryHighCount++;
        else if (level.includes('HIGH')) highCount++;
        else if (level.includes('MEDIUM')) mediumCount++;
        else if (level.includes('LOW')) lowCount++;

        const category = d.category || '-';
        mistakeCounts[category] = (mistakeCounts[category] || 0) + 1;
      });

      const totalDefect = lowCount + mediumCount + highCount + veryHighCount;

      let mostFrequentMistake = '-';
      let maxCount = 0;
      for (const cat in mistakeCounts) {
        if (mistakeCounts[cat] > maxCount) {
          maxCount = mistakeCounts[cat];
          mostFrequentMistake = cat;
        }
      }

      return { ...agent, defects, lowCount, mediumCount, highCount, veryHighCount, totalDefect, mostFrequentMistake };
    })
    .sort((a, b) => b.totalDefect - a.totalDefect);
}

const compareBy = (aVal: string | number, bVal: string | number, direction: 'asc' | 'desc') => {
  if (aVal < bVal) return direction === 'asc' ? -1 : 1;
  if (aVal > bVal) return direction === 'asc' ? 1 : -1;
  return 0;
};

/** "Ringkasan" table order. Keeps the input order (most defects first) when no column is chosen. */
export function sortPerformanceAgents(agents: QaDefectAgent[], sort: SortConfig): QaDefectAgent[] {
  const sortable = [...agents];
  if (!sort) return sortable;
  return sortable.sort((a, b) => {
    let aVal: string | number;
    let bVal: string | number;
    switch (sort.key) {
      case 'name': aVal = a.name || a.csId; bVal = b.name || b.csId; break;
      case 'bpo': aVal = a.bpo || ''; bVal = b.bpo || ''; break;
      case 'teamLeader': aVal = a.teamLeader || ''; bVal = b.teamLeader || ''; break;
      case 'average':
      default:
        aVal = a.qaScoreCount > 0 ? a.qaScoreSum / a.qaScoreCount : -1;
        bVal = b.qaScoreCount > 0 ? b.qaScoreSum / b.qaScoreCount : -1;
        break;
    }
    return compareBy(aVal, bVal, sort.direction);
  });
}

/** "Analisis Defect" table: only agents with defects; most defects first unless a column is chosen. */
export function sortDefectAgents(agents: QaDefectAgent[], sort: SortConfig): QaDefectAgent[] {
  const sortable = agents.filter((agent) => agent.totalDefect > 0);
  if (!sort) return sortable.sort((a, b) => b.totalDefect - a.totalDefect);
  return sortable.sort((a, b) => {
    let aVal: string | number;
    let bVal: string | number;
    switch (sort.key) {
      case 'name': aVal = a.name || a.csId; bVal = b.name || b.csId; break;
      case 'bpo': aVal = a.bpo || ''; bVal = b.bpo || ''; break;
      case 'teamLeader': aVal = a.teamLeader || ''; bVal = b.teamLeader || ''; break;
      case 'low': aVal = a.lowCount || 0; bVal = b.lowCount || 0; break;
      case 'medium': aVal = a.mediumCount || 0; bVal = b.mediumCount || 0; break;
      case 'high': aVal = a.highCount || 0; bVal = b.highCount || 0; break;
      case 'veryHigh': aVal = a.veryHighCount || 0; bVal = b.veryHighCount || 0; break;
      case 'category': aVal = a.mostFrequentMistake || ''; bVal = b.mostFrequentMistake || ''; break;
      default: aVal = a.totalDefect; bVal = b.totalDefect; break;
    }
    return compareBy(aVal, bVal, sort.direction);
  });
}

/** Totals plus the "Highlight KPI" lists: top categories, worst days, best and worst agents. */
export function buildQaHighlights(tableData: AgentKPI[], defectData: QaDefectAgent[]) {
  const totalEvaluations = tableData.reduce((sum, agent) => sum + agent.qaScoreCount, 0);
  const totalMistakes = defectData.reduce((sum, agent) => sum + agent.totalDefect, 0);
  const categoryCounts: Record<string, number> = {};

  defectData.forEach((agent) => {
    agent.defects.forEach((defect) => {
      const category = defect.category || 'Tidak ada kategori';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
  });

  const categoriesByCount = Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const agentsByQa = [...tableData]
    .filter((agent) => agent.qaScoreCount > 0)
    .map((agent) => ({ agent, avg: agent.qaScoreSum / agent.qaScoreCount }))
    .sort((a, b) => b.avg - a.avg);

  const dailyMap = new Map<string, { scoreSum: number; scoreCount: number; mistakes: number }>();
  tableData.forEach((agent) => {
    agent.qaHistory?.forEach((entry) => {
      const date = entry.normDate || normalizeDateStr(entry.date || '') || entry.date;
      if (!date) return;
      const current = dailyMap.get(date) || { scoreSum: 0, scoreCount: 0, mistakes: 0 };
      if (entry.hasScore !== false && typeof entry.score === 'number' && !isNaN(entry.score)) {
        current.scoreSum += entry.score;
        current.scoreCount += 1;
      }
      if (isQaDefect(entry)) current.mistakes += 1;
      dailyMap.set(date, current);
    });
  });

  const daysByQa = Array.from(dailyMap.entries())
    .map(([date, stats]) => ({
      date,
      avg: stats.scoreCount > 0 ? stats.scoreSum / stats.scoreCount : null,
      mistakes: stats.mistakes,
      scoreCount: stats.scoreCount,
    }))
    .filter((d) => d.avg !== null && d.scoreCount > 0)
    .sort((a, b) => (a.avg || 0) - (b.avg || 0));

  const agentItem = (a: { agent: AgentKPI; avg: number }) => ({
    label: a.agent.name || a.agent.csId,
    subLabel: a.agent.teamLeader || a.agent.csId,
    value: `${formatNum(a.avg, 1)}%`,
  });

  return {
    totalEvaluations,
    totalMistakes,
    mistakeRate: totalEvaluations > 0 ? (totalMistakes / totalEvaluations) * 100 : 0,
    topCategories: categoriesByCount.slice(0, 3).map((c) => ({ label: c.category, value: `${formatNum(c.count, 0)} temuan` })),
    bottomDays: daysByQa.slice(0, 3).map((d) => ({
      label: formatDayMonth(d.date),
      subLabel: `${formatNum(d.mistakes, 0)} temuan · ${formatNum(d.scoreCount, 0)} evaluasi`,
      value: `${formatNum(d.avg, 1)}%`,
    })),
    topAgents: agentsByQa.slice(0, 3).map(agentItem),
    bottomAgents: agentsByQa.length > 3 ? agentsByQa.slice(Math.max(3, agentsByQa.length - 3)).reverse().map(agentItem) : [],
  };
}

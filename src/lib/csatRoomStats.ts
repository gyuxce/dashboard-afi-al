import type { AgentKPI } from './dataProcessor';
import { isCsatTakeoutCategory } from './dataProcessor';
import { formatDayMonth } from './dayCalendar';
import { formatNum } from './utils';

export type RoomViewMode = 'full' | 'fair';
export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
export type ScoreCase = 'All' | 'No Survey' | '1' | '2' | '3' | '4' | '5' | 'Bad' | 'Good' | string;

export const roomTarget = (viewMode: RoomViewMode) => (viewMode === 'full' ? 75 : 92);
export const roomKpiType = (viewMode: RoomViewMode) => (viewMode === 'full' ? ('csatFull' as const) : ('csatFair' as const));

/** An agent's CSAT SC % for the chosen basis (Full keeps every valid rating, Fair excludes the takeout categories). */
export const agentRoomPct = (a: AgentKPI, viewMode: RoomViewMode): number | null => {
  if (viewMode === 'full') {
    return a.csatScTotalValid > 0 ? (a.csatScGoodCount / a.csatScTotalValid) * 100 : null;
  }
  return a.csatScFairTotalValid > 0 ? (a.csatScFairGoodCount / a.csatScFairTotalValid) * 100 : null;
};

const categoriesOf = (a: AgentKPI, viewMode: RoomViewMode) =>
  (viewMode === 'full' ? a.csatScCategoriesFull : a.csatScCategoriesFair) || {};

/** Agents with at least one survey in the chosen basis that match the search box (CS ID or name) / TL filter. */
export function filterRoomAgents(data: AgentKPI[], search: string, filterTL: string | null, viewMode: RoomViewMode): AgentKPI[] {
  const q = search.toLowerCase();
  return data.filter((a) => {
    const matchSearch = a.csId.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q);
    const matchTL = filterTL ? a.teamLeader === filterTL : true;
    const count = viewMode === 'full' ? a.csatScFullCount : a.csatScFairCount;
    return matchSearch && matchTL && count > 0;
  });
}

/** Category name to total count over the agents, in the chosen basis. */
export function aggregateCategories(agents: AgentKPI[], viewMode: RoomViewMode): Record<string, number> {
  const agg: Record<string, number> = {};
  agents.forEach((a) => {
    const cats = categoriesOf(a, viewMode);
    for (const cat in cats) {
      if (!agg[cat]) agg[cat] = 0;
      agg[cat] += cats[cat];
    }
  });
  return agg;
}

/** Top ten categories by count, ranked from 1. */
export function topCategoryList(agents: AgentKPI[], viewMode: RoomViewMode) {
  return Object.entries(aggregateCategories(agents, viewMode))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map((entry, idx) => ({ rank: idx + 1, name: entry[0], count: entry[1] }));
}

/** The "Highlight KPI" lists: top categories, lowest days, best and worst agents by CSAT SC %. */
export function buildRoomHighlights(tableData: AgentKPI[], viewMode: RoomViewMode) {
  const categories = Object.entries(aggregateCategories(tableData, viewMode))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const agentRows = tableData
    .map((a) => {
      const count = viewMode === 'full' ? a.csatScFullCount : a.csatScFairCount;
      return { agent: a, pct: agentRoomPct(a, viewMode), count };
    })
    .filter((a): a is { agent: AgentKPI; pct: number; count: number } => a.pct !== null)
    .sort((a, b) => b.pct - a.pct);

  const dailyMap = new Map<string, { good: number; total: number }>();
  tableData.forEach((a) => {
    const dailyArr = viewMode === 'full' ? a.dailyHistory?.csatScFull : a.dailyHistory?.csatScFair;
    dailyArr?.forEach((h) => {
      const key = h.normDate || h.date;
      if (!key || !h.count) return;
      const current = dailyMap.get(key) || { good: 0, total: 0 };
      dailyMap.set(key, { good: current.good + h.score, total: current.total + h.count });
    });
  });

  const daysByScore = Array.from(dailyMap.entries())
    .map(([date, stats]) => ({ date, pct: stats.total > 0 ? (stats.good / stats.total) * 100 : 0, count: stats.total }))
    .filter((d) => d.count > 0)
    .sort((a, b) => a.pct - b.pct);

  const agentItem = (a: { agent: AgentKPI; pct: number }) => ({
    label: a.agent.name || a.agent.csId,
    subLabel: a.agent.teamLeader || a.agent.csId,
    value: `${formatNum(a.pct, 1)}%`,
  });

  return {
    topCategories: categories.slice(0, 3).map((c) => ({ label: c.name, value: formatNum(c.count, 0) })),
    bottomDays: daysByScore.slice(0, 3).map((d) => ({
      label: formatDayMonth(d.date),
      subLabel: `${formatNum(d.count, 0)} rating`,
      value: `${formatNum(d.pct, 1)}%`,
    })),
    topAgents: agentRows.slice(0, 3).map(agentItem),
    bottomAgents: agentRows.length > 3 ? agentRows.slice(Math.max(3, agentRows.length - 3)).reverse().map(agentItem) : [],
  };
}

/** Agents with the most (critical) and fewest (stable) bad scores, ten each. */
export function buildAgentRankings(tableData: AgentKPI[], viewMode: RoomViewMode) {
  const agents = tableData.map((a) => {
    const count = viewMode === 'full' ? a.csatScBadScoreFullCount || 0 : a.csatScBadScoreFairCount || 0;
    return { name: a.name || a.csId, csId: a.csId, bpo: a.bpo, tl: a.teamLeader, badScoreCount: count };
  });
  const critical = [...agents].sort((a, b) => b.badScoreCount - a.badScoreCount).filter((a) => a.badScoreCount > 0).slice(0, 10);
  const stable = [...agents]
    .sort((a, b) => (a.badScoreCount === b.badScoreCount ? a.name.localeCompare(b.name) : a.badScoreCount - b.badScoreCount))
    .slice(0, 10);
  return { critical, stable };
}

export type ScoreDistribution = Record<'All' | 'No Survey' | 'Responded' | '1' | '2' | '3' | '4' | '5' | 'Bad' | 'Good', number>;

/** Survey counts per score (and Bad = 1 + 2, Good = 4 + 5, Responded = 1 to 5, i.e. everything but No Survey). Fair drops the takeout categories. */
export function buildScoreDistribution(tableData: AgentKPI[], viewMode: RoomViewMode): ScoreDistribution {
  const dist: ScoreDistribution = { All: 0, 'No Survey': 0, Responded: 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, Bad: 0, Good: 0 };
  tableData.forEach((a) => {
    if (!a.csatScScoreDistribution) return;
    (['No Survey', '1', '2', '3', '4', '5'] as const).forEach((scoreKey) => {
      const cases = a.csatScScoreDistribution[scoreKey];
      if (!cases) return;
      for (const c in cases) {
        if (viewMode === 'fair' && isCsatTakeoutCategory(c)) continue;
        const n = cases[c] || 0;
        dist[scoreKey] += n;
        dist.All += n;
        if (scoreKey !== 'No Survey') dist.Responded += n;
        if (scoreKey === '1' || scoreKey === '2') dist.Bad += n;
        if (scoreKey === '4' || scoreKey === '5') dist.Good += n;
      }
    });
  });
  return dist;
}

/** Response rate: answered surveys (score 1 to 5) over all rows including "No Survey". */
export function surveyResponseRate(dist: ScoreDistribution): { total: number; answered: number; rate: number } {
  const total = dist.All;
  const answered = dist['1'] + dist['2'] + dist['3'] + dist['4'] + dist['5'];
  return { total, answered, rate: total === 0 ? 0 : (answered / total) * 100 };
}

export const getScoresForSelectedCase = (selected: ScoreCase): string[] => {
  if (selected === 'All') return ['No Survey', '1', '2', '3', '4', '5'];
  if (selected === 'Responded') return ['1', '2', '3', '4', '5'];
  if (selected === 'Bad') return ['1', '2'];
  if (selected === 'Good') return ['4', '5'];
  return [selected];
};

export const scoreCaseLabel = (selected: ScoreCase): string => {
  switch (selected) {
    case 'No Survey': return 'No Survey';
    case 'All': return 'All Surveys';
    case 'Responded': return 'Memberi Survey (Score 1 sampai 5)';
    case 'Bad': return 'Bad Survey (Score 1 + 2)';
    case 'Good': return 'Good Survey (Score 4 + 5)';
    default: return `Score ${selected}`;
  }
};

export type ScoreRankRow = { rank: number; name: string; count: number; byScore: Record<string, number> };

/** For the chosen score group: categories ranked by count, with the split per score. */
export function buildScoreTopCases(tableData: AgentKPI[], selected: ScoreCase, viewMode: RoomViewMode): ScoreRankRow[] {
  const caseDist: Record<string, number> = {};
  const caseByScore: Record<string, Record<string, number>> = {};
  const scoresToProcess = getScoresForSelectedCase(selected);

  tableData.forEach((a) => {
    if (!a.csatScScoreDistribution) return;
    scoresToProcess.forEach((scoreKey) => {
      const cases = a.csatScScoreDistribution[scoreKey];
      if (!cases) return;
      for (const c in cases) {
        if (viewMode === 'fair' && isCsatTakeoutCategory(c)) continue;
        const n = cases[c] || 0;
        if (!caseDist[c]) caseDist[c] = 0;
        caseDist[c] += n;
        if (!caseByScore[c]) caseByScore[c] = {};
        caseByScore[c][scoreKey] = (caseByScore[c][scoreKey] || 0) + n;
      }
    });
  });
  return Object.entries(caseDist)
    .sort((a, b) => b[1] - a[1])
    .map((e, idx) => ({ rank: idx + 1, name: e[0], count: e[1], byScore: caseByScore[e[0]] || {} }));
}

/** For the chosen score group: agents (by display name) ranked by count, with the split per score. */
export function buildScoreTopAgents(tableData: AgentKPI[], selected: ScoreCase, viewMode: RoomViewMode): ScoreRankRow[] {
  const agentDist: Record<string, number> = {};
  const agentByScore: Record<string, Record<string, number>> = {};
  const scoresToProcess = getScoresForSelectedCase(selected);

  tableData.forEach((a) => {
    if (!a.csatScScoreDistribution) return;
    const displayName = a.name || a.csId;
    scoresToProcess.forEach((scoreKey) => {
      const cases = a.csatScScoreDistribution[scoreKey];
      if (!cases) return;
      let totalForScore = 0;
      for (const c in cases) {
        if (viewMode === 'fair' && isCsatTakeoutCategory(c)) continue;
        totalForScore += cases[c] || 0;
      }
      if (totalForScore > 0) {
        if (!agentDist[displayName]) agentDist[displayName] = 0;
        agentDist[displayName] += totalForScore;
        if (!agentByScore[displayName]) agentByScore[displayName] = {};
        agentByScore[displayName][scoreKey] = (agentByScore[displayName][scoreKey] || 0) + totalForScore;
      }
    });
  });
  return Object.entries(agentDist)
    .sort((a, b) => b[1] - a[1])
    .map((e, idx) => ({ rank: idx + 1, name: e[0], count: e[1], byScore: agentByScore[e[0]] || {} }));
}

const compare = (aVal: string | number, bVal: string | number, direction: 'asc' | 'desc') => {
  if (aVal < bVal) return direction === 'asc' ? -1 : 1;
  if (aVal > bVal) return direction === 'asc' ? 1 : -1;
  return 0;
};

/** "Agent" table order. Keeps the input order when no column is chosen; the default column is the CSAT SC score. */
export function sortRoomAgents(agents: AgentKPI[], sort: SortConfig, viewMode: RoomViewMode): AgentKPI[] {
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
        aVal = viewMode === 'full' ? a.csatScFull ?? -1 : a.csatScFair ?? -1;
        bVal = viewMode === 'full' ? b.csatScFull ?? -1 : b.csatScFair ?? -1;
        break;
    }
    return compare(aVal, bVal, sort.direction);
  });
}

const badScoreCount = (a: AgentKPI, viewMode: RoomViewMode) => (viewMode === 'full' ? a.csatScBadScoreFullCount : a.csatScBadScoreFairCount);

/** "Defect" table: only agents with bad scores, most first unless a column is chosen. */
export function sortRoomDefectAgents(agents: AgentKPI[], sort: SortConfig, viewMode: RoomViewMode): AgentKPI[] {
  const sortable = agents.filter((agent) => badScoreCount(agent, viewMode) > 0);

  if (!sort) return sortable.sort((a, b) => badScoreCount(b, viewMode) - badScoreCount(a, viewMode));

  const scoreCount = (agent: AgentKPI, score: number) =>
    agent.csatHistory.filter((h) => h.score === score && (viewMode === 'full' || !h.isTakeout)).length;
  const topCat = (agent: AgentKPI) => {
    const cats = viewMode === 'full' ? agent.csatScCategoriesFull : agent.csatScCategoriesFair;
    if (Object.keys(cats).length > 0) return Object.entries(cats).sort((x, y) => y[1] - x[1])[0][0];
    return '';
  };

  return sortable.sort((a, b) => {
    let aVal: string | number;
    let bVal: string | number;
    switch (sort.key) {
      case 'name': aVal = a.name || a.csId; bVal = b.name || b.csId; break;
      case 'bpo': aVal = a.bpo || ''; bVal = b.bpo || ''; break;
      case 'teamLeader': aVal = a.teamLeader || ''; bVal = b.teamLeader || ''; break;
      case 'score1': aVal = scoreCount(a, 1); bVal = scoreCount(b, 1); break;
      case 'score2': aVal = scoreCount(a, 2); bVal = scoreCount(b, 2); break;
      case 'score3': aVal = scoreCount(a, 3); bVal = scoreCount(b, 3); break;
      case 'score4': aVal = scoreCount(a, 4); bVal = scoreCount(b, 4); break;
      case 'score5': aVal = scoreCount(a, 5); bVal = scoreCount(b, 5); break;
      case 'category': aVal = topCat(a); bVal = topCat(b); break;
      default: aVal = badScoreCount(a, viewMode); bVal = badScoreCount(b, viewMode); break;
    }
    return compare(aVal, bVal, sort.direction);
  });
}

/** For one category / agent row of the "All" view: how many gave no survey, how many did, and the response rate. */
export function responseBreakdown(row: Pick<ScoreRankRow, 'count' | 'byScore'>): { noSurvey: number; responded: number; rate: number } {
  const noSurvey = row.byScore['No Survey'] || 0;
  const responded = row.count - noSurvey;
  return { noSurvey, responded, rate: row.count > 0 ? (responded / row.count) * 100 : 0 };
}

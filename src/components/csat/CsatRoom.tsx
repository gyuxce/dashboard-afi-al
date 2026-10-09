import React, { useMemo, useState } from 'react';
import { AgentKPI, CSATEntry, isCsatTakeoutCategory, isValidCsatScScore, normalizeDateStr } from '../../lib/dataProcessor';
import { formatNum, getKpiStatus, getMonthOffsetLabel, parseDateForSort, cn, indexByDate, uniqueCalendarDates, getByCalendarDate } from '../../lib/utils';
import { KpiValue, KpiCue } from '../ui/KpiCue';
import { Sparkline } from '../ui/Sparkline';
import { DayStrip } from '../ui/DayStrip';
import { Search, Star, Eye, AlertCircle, ChevronDown, BarChart2, CheckCircle, Filter, Layers, TrendingUp } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';

import { SortableHeader } from '../ui/SortableHeader';
import { EmptyState } from '../ui/EmptyState';
import { MobileScrollHint } from '../ui/ChartScrollArea';
import { KpiRankLists } from '../ui/KpiRankLists';
import { SegmentedControl } from '../ui/SegmentedControl';
import { CsatDetailModal } from "./CsatDetailModal";
import { chart } from '../../lib/themeColors';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, AreaChart, Area } from 'recharts';

/** Normalize any date string the sheet threw at us to a sortable YYYY-MM-DD key. */
const toDayKey = (dateStr: string): string => {
  const ts = parseDateForSort(dateStr);
  if (!ts) return dateStr;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "27 Jul-2 Agu" / "4-10 Agu" from two YYYY-MM-DD keys. */
const dateRangeLabel = (startKey: string, endKey: string): string | null => {
  const a = new Date(parseDateForSort(startKey) || NaN);
  const b = new Date(parseDateForSort(endKey) || NaN);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  const mo = (d: Date) => new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d);
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.getDate()}-${b.getDate()} ${mo(a)}`
    : `${a.getDate()} ${mo(a)}-${b.getDate()} ${mo(b)}`;
};

export const CsatRoom: React.FC<{ data: AgentKPI[], previousData?: AgentKPI[], previousData2?: AgentKPI[], previousData3?: AgentKPI[] }> = ({ data, previousData = [], previousData2 = [], previousData3 = [] }) => {
  const isComparisonEnabled = useStore(state => state.isComparisonEnabled);
  const comparisonMode = useStore(state => state.comparisonMode);
  const [search, setSearch] = useState('');
  const [filterTL] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'full' | 'fair'>('full');
  const [analysisMode, setAnalysisMode] = useState<'category' | 'score' | 'agent' | 'defect'>('agent');
  const [selectedScoreCase, setSelectedScoreCase] = useState<string>('All');
  const [scoreCasePage, setScoreCasePage] = useState<number>(1);
  const [selectedAgent, setSelectedAgent] = useState<{agent: AgentKPI, date?: string, type?: 'csat' | 'defects'} | null>(null);
  const [wowModalData, setWowModalData] = useState<{ title: React.ReactNode, subtitle?: React.ReactNode, surveys: CSATEntry[] } | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (csId: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(csId)) next.delete(csId);
      else next.add(csId);
      return next;
    });

  const handleCategoryClick = (categoryName: string, weekLabel: string, dataset: AgentKPI[]) => {
    const surveys: CSATEntry[] = [];
    dataset.forEach(a => {
      const filtered = a.csatHistory.filter(h => h.category.toLowerCase() === categoryName.toLowerCase() && (viewMode === 'full' || !h.isTakeout) && h.score > 0);
      surveys.push(...filtered);
    });
    if (surveys.length > 0) {
      setWowModalData({
        title: `Category Analysis: ${categoryName}`,
        subtitle: `Data filter: ${weekLabel} (${viewMode === 'full' ? 'Data penuh' : 'After Takeout'})`,
        surveys
      });
    }
  };

  const handleAgentClick = (agentId: string, agentName: string, weekLabel: string, dataset: AgentKPI[]) => {
    const agent = dataset.find(a => a.csId === agentId);
    if (agent && agent.csatHistory.length > 0) {
      setWowModalData({
        title: `Historical Audit Trail: ${agentName || agent.csId}`,
        subtitle: `CS ID: ${agent.csId} • TL: ${agent.teamLeader || '-'} • Data filter: ${weekLabel} (${viewMode === 'full' ? 'Data penuh' : 'After Takeout'})`,
        surveys: agent.csatHistory.filter(h => (viewMode === 'full' || !h.isTakeout) && h.score > 0)
      });
    }
  };
  
  const [agentSortConfig, setAgentSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [defectSortConfig, setDefectSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const handleAgentSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (agentSortConfig && agentSortConfig.key === key && agentSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setAgentSortConfig({ key, direction });
  };

  const handleDefectSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (defectSortConfig && defectSortConfig.key === key && defectSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setDefectSortConfig({ key, direction });
  };

  const tableData = useMemo(() => {
    return data.filter(a => {
      const matchSearch = a.csId.toLowerCase().includes(search.toLowerCase()) || (a.name || '').toLowerCase().includes(search.toLowerCase());
      const matchTL = filterTL ? a.teamLeader === filterTL : true;
      const count = viewMode === 'full' ? a.csatScFullCount : a.csatScFairCount;
      return matchSearch && matchTL && count > 0;
    });
  }, [data, search, filterTL, viewMode]);

  const uniqueDates = useMemo(() => {
    return uniqueCalendarDates(tableData.flatMap((a) => [
      a.dailyHistory?.schedule,
      a.dailyHistory?.csatScFull,
      a.dailyHistory?.csatScFair,
    ]));
  }, [tableData]);
  // Sparkline + day-strip read oldest→newest; uniqueDates is newest-first.
  const chronoDates = useMemo(() => [...uniqueDates].reverse(), [uniqueDates]);

  const csatTarget = viewMode === 'full' ? 75 : 92;
  const csatKpiType = viewMode === 'full' ? 'csatFull' as const : 'csatFair' as const;
  const agentCsatPct = (a: AgentKPI): number | null => {
    if (viewMode === 'full') {
      return a.csatScTotalValid > 0 ? (a.csatScGoodCount / a.csatScTotalValid) * 100 : null;
    }
    return a.csatScFairTotalValid > 0 ? (a.csatScFairGoodCount / a.csatScFairTotalValid) * 100 : null;
  };

  const topCategories = useMemo(() => {
    const agg: Record<string, number> = {};
    tableData.forEach(a => {
       const cats = viewMode === 'full' ? (a.csatScCategoriesFull || {}) : (a.csatScCategoriesFair || {});
       for (const cat in cats) {
          if (!agg[cat]) agg[cat] = 0;
          agg[cat] += cats[cat];
       }
    });
    return Object.entries(agg)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 10)
      .map((entry, idx) => ({ rank: idx+1, name: entry[0], count: entry[1] }));
  }, [tableData, viewMode]);

  const highlightRanks = useMemo(() => {
    const categoryAgg: Record<string, number> = {};
    tableData.forEach(a => {
      const cats = viewMode === 'full' ? (a.csatScCategoriesFull || {}) : (a.csatScCategoriesFair || {});
      for (const cat in cats) {
        categoryAgg[cat] = (categoryAgg[cat] || 0) + cats[cat];
      }
    });

    const categories = Object.entries(categoryAgg)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const agentRows = tableData
      .map(a => {
        const pct =
          viewMode === 'full'
            ? a.csatScTotalValid > 0
              ? (a.csatScGoodCount / a.csatScTotalValid) * 100
              : null
            : a.csatScFairTotalValid > 0
              ? (a.csatScFairGoodCount / a.csatScFairTotalValid) * 100
              : null;
        const count = viewMode === 'full' ? a.csatScFullCount : a.csatScFairCount;
        return { agent: a, pct, count };
      })
      .filter((a): a is { agent: AgentKPI; pct: number; count: number } => a.pct !== null)
      .sort((a, b) => b.pct - a.pct);

    const dailyMap = new Map<string, { good: number; total: number }>();
    tableData.forEach(a => {
      const dailyArr = viewMode === 'full' ? a.dailyHistory?.csatScFull : a.dailyHistory?.csatScFair;
      dailyArr?.forEach(h => {
        const key = h.normDate || h.date;
        if (!key || !h.count) return;
        const current = dailyMap.get(key) || { good: 0, total: 0 };
        dailyMap.set(key, {
          good: current.good + h.score,
          total: current.total + h.count,
        });
      });
    });

    const daysByScore = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({
        date,
        pct: stats.total > 0 ? (stats.good / stats.total) * 100 : 0,
        count: stats.total,
      }))
      .filter(d => d.count > 0)
      .sort((a, b) => a.pct - b.pct);

    return {
      topCategories: categories.slice(0, 3).map(c => ({
        label: c.name,
        value: formatNum(c.count, 0),
      })),
      bottomDays: daysByScore.slice(0, 3).map(d => ({
        label: d.date,
        subLabel: `${formatNum(d.count, 0)} rating`,
        value: `${formatNum(d.pct, 1)}%`,
      })),
      topAgents: agentRows.slice(0, 3).map(a => ({
        label: a.agent.name || a.agent.csId,
        subLabel: a.agent.teamLeader || a.agent.csId,
        value: `${formatNum(a.pct, 1)}%`,
      })),
      bottomAgents:
        agentRows.length > 3
          ? agentRows.slice(Math.max(3, agentRows.length - 3)).reverse().map(a => ({
              label: a.agent.name || a.agent.csId,
              subLabel: a.agent.teamLeader || a.agent.csId,
              value: `${formatNum(a.pct, 1)}%`,
            }))
          : [],
    };
  }, [tableData, viewMode]);

  const prevTopCategories = useMemo(() => {
    const prevTableData = previousData.filter(a => {
      const matchSearch = a.csId.toLowerCase().includes(search.toLowerCase()) || (a.name || '').toLowerCase().includes(search.toLowerCase());
      const matchTL = filterTL ? a.teamLeader === filterTL : true;
      const count = viewMode === 'full' ? a.csatScFullCount : a.csatScFairCount;
      return matchSearch && matchTL && count > 0;
    });

    const agg: Record<string, number> = {};
    prevTableData.forEach(a => {
       const cats = viewMode === 'full' ? (a.csatScCategoriesFull || {}) : (a.csatScCategoriesFair || {});
       for (const cat in cats) {
          if (!agg[cat]) agg[cat] = 0;
          agg[cat] += cats[cat];
       }
    });
    return agg;
  }, [previousData, search, filterTL, viewMode]);

  const agentRankings = useMemo(() => {
    const agents = tableData.map(a => {
       const count = viewMode === 'full' ? (a.csatScBadScoreFullCount || 0) : (a.csatScBadScoreFairCount || 0);
       return { name: a.name || a.csId, csId: a.csId, bpo: a.bpo, tl: a.teamLeader, badScoreCount: count };
    });
    
    const critical = [...agents].sort((a, b) => b.badScoreCount - a.badScoreCount).filter(a => a.badScoreCount > 0).slice(0, 10);
    const stable = [...agents].sort((a, b) => {
       if (a.badScoreCount === b.badScoreCount) return a.name.localeCompare(b.name);
       return a.badScoreCount - b.badScoreCount;
    }).slice(0, 10);
    
    return { critical, stable };
  }, [tableData, viewMode]);

  const scoreDistribution = useMemo(() => {
    const dist = {
      'All': 0, 'No Survey': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0,
      'Bad': 0, 'Good': 0,
    };
    tableData.forEach(a => {
      if (a.csatScScoreDistribution) {
        ['No Survey', '1', '2', '3', '4', '5'].forEach(scoreKey => {
           if (a.csatScScoreDistribution[scoreKey]) {
              const cases = a.csatScScoreDistribution[scoreKey];
              for (const c in cases) {
                 if (viewMode === 'fair' && isCsatTakeoutCategory(c)) continue;
                 const n = cases[c] || 0;
                 dist[scoreKey as keyof typeof dist] += n;
                 dist['All'] += n;
                 if (scoreKey === '1' || scoreKey === '2') dist['Bad'] += n;
                 if (scoreKey === '4' || scoreKey === '5') dist['Good'] += n;
              }
           }
        });
      }
    });
    return dist;
  }, [tableData, viewMode]);

  const getScoresForSelectedCase = (selected: string): string[] => {
    if (selected === 'All') return ['No Survey', '1', '2', '3', '4', '5'];
    if (selected === 'Bad') return ['1', '2'];
    if (selected === 'Good') return ['4', '5'];
    return [selected];
  };

  const scoreAnalysisLabel = useMemo(() => {
    switch (selectedScoreCase) {
      case 'No Survey': return 'No Survey';
      case 'All': return 'All Surveys';
      case 'Bad': return 'Bad Survey (Score 1 + 2)';
      case 'Good': return 'Good Survey (Score 4 + 5)';
      default: return `Score ${selectedScoreCase}`;
    }
  }, [selectedScoreCase]);

  const isAccumulatedScoreCase = selectedScoreCase === 'Bad' || selectedScoreCase === 'Good';
  const accumulatedScoreKeys = selectedScoreCase === 'Bad'
    ? (['1', '2'] as const)
    : selectedScoreCase === 'Good'
      ? (['4', '5'] as const)
      : null;

  const totalScoreRows = useMemo(() => {
    return scoreDistribution['All'];
  }, [scoreDistribution]);

  const answeredScoreRows = useMemo(() => {
    return scoreDistribution['1'] + scoreDistribution['2'] + scoreDistribution['3'] + scoreDistribution['4'] + scoreDistribution['5'];
  }, [scoreDistribution]);

  const surveyResponseRate = useMemo(() => {
    if (totalScoreRows === 0) return 0;
    return (answeredScoreRows / totalScoreRows) * 100;
  }, [answeredScoreRows, totalScoreRows]);

  const sortedAgentData = useMemo(() => {
    let sortable = [...tableData];
    if (agentSortConfig) {
      sortable.sort((a, b) => {
        let aVal: any = 0;
        let bVal: any = 0;
        
        switch (agentSortConfig.key) {
          case 'name':
            aVal = a.name || a.csId;
            bVal = b.name || b.csId;
            break;
          case 'bpo':
            aVal = a.bpo || '';
            bVal = b.bpo || '';
            break;
          case 'teamLeader':
            aVal = a.teamLeader || '';
            bVal = b.teamLeader || '';
            break;
          case 'average':
          default:
            aVal = viewMode === 'full' ? (a.csatScFull ?? -1) : (a.csatScFair ?? -1);
            bVal = viewMode === 'full' ? (b.csatScFull ?? -1) : (b.csatScFair ?? -1);
            break;
        }

        if (aVal < bVal) return agentSortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return agentSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [tableData, agentSortConfig, viewMode]);

  const sortedDefectData = useMemo(() => {
    let sortable = tableData.filter(agent => {
      const count = viewMode === 'full' ? agent.csatScBadScoreFullCount : agent.csatScBadScoreFairCount;
      return count > 0;
    });

    if (defectSortConfig) {
      sortable.sort((a, b) => {
        let aVal: any = 0;
        let bVal: any = 0;

        const getScoreCount = (agent: AgentKPI, score: number) => {
          return agent.csatHistory.filter(h => h.score === score && (viewMode === 'full' || !h.isTakeout)).length;
        };

        const getTopCat = (agent: AgentKPI) => {
          const cats = viewMode === 'full' ? agent.csatScCategoriesFull : agent.csatScCategoriesFair;
          if (Object.keys(cats).length > 0) {
            return Object.entries(cats).sort((x, y) => y[1] - x[1])[0][0];
          }
          return '';
        };
        
        switch (defectSortConfig.key) {
          case 'name':
            aVal = a.name || a.csId;
            bVal = b.name || b.csId;
            break;
          case 'bpo':
            aVal = a.bpo || '';
            bVal = b.bpo || '';
            break;
          case 'teamLeader':
            aVal = a.teamLeader || '';
            bVal = b.teamLeader || '';
            break;
          case 'score1':
            aVal = getScoreCount(a, 1);
            bVal = getScoreCount(b, 1);
            break;
          case 'score2':
            aVal = getScoreCount(a, 2);
            bVal = getScoreCount(b, 2);
            break;
          case 'score3':
            aVal = getScoreCount(a, 3);
            bVal = getScoreCount(b, 3);
            break;
          case 'score4':
            aVal = getScoreCount(a, 4);
            bVal = getScoreCount(b, 4);
            break;
          case 'score5':
            aVal = getScoreCount(a, 5);
            bVal = getScoreCount(b, 5);
            break;
          case 'category':
            aVal = getTopCat(a);
            bVal = getTopCat(b);
            break;
          default:
            aVal = viewMode === 'full' ? a.csatScBadScoreFullCount : a.csatScBadScoreFairCount;
            bVal = viewMode === 'full' ? b.csatScBadScoreFullCount : b.csatScBadScoreFairCount;
            break;
        }

        if (aVal < bVal) return defectSortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return defectSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort
      sortable.sort((a,b) => {
         const acount = viewMode === 'full' ? a.csatScBadScoreFullCount : a.csatScBadScoreFairCount;
         const bcount = viewMode === 'full' ? b.csatScBadScoreFullCount : b.csatScBadScoreFairCount;
         return bcount - acount;
      });
    }
    return sortable;
  }, [tableData, defectSortConfig, viewMode]);

  const scoreAnalysisTopCases = useMemo(() => {
    const caseDist: Record<string, number> = {};
    const caseByScore: Record<string, Record<string, number>> = {};
    const scoresToProcess = getScoresForSelectedCase(selectedScoreCase);

    tableData.forEach(a => {
       if (a.csatScScoreDistribution) {
          scoresToProcess.forEach(scoreKey => {
            if (a.csatScScoreDistribution[scoreKey]) {
                const cases = a.csatScScoreDistribution[scoreKey];
                for (const c in cases) {
                   if (viewMode === 'fair' && isCsatTakeoutCategory(c)) continue;
                   const n = cases[c] || 0;
                   if (!caseDist[c]) caseDist[c] = 0;
                   caseDist[c] += n;
                   if (!caseByScore[c]) caseByScore[c] = {};
                   caseByScore[c][scoreKey] = (caseByScore[c][scoreKey] || 0) + n;
                }
            }
          });
       }
    });
    return Object.entries(caseDist)
      .sort((a,b) => b[1] - a[1])
      .map((e, idx) => ({
        rank: idx+1,
        name: e[0],
        count: e[1],
        byScore: caseByScore[e[0]] || {},
      }));
  }, [tableData, selectedScoreCase, viewMode]);

  const scoreAnalysisTopAgents = useMemo(() => {
    const agentDist: Record<string, number> = {};
    const agentByScore: Record<string, Record<string, number>> = {};
    const scoresToProcess = getScoresForSelectedCase(selectedScoreCase);

    tableData.forEach(a => {
       if (a.csatScScoreDistribution) {
          const displayName = a.name || a.csId;
          scoresToProcess.forEach(scoreKey => {
            if (a.csatScScoreDistribution[scoreKey]) {
                const cases = a.csatScScoreDistribution[scoreKey];
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
            }
          });
       }
    });
    return Object.entries(agentDist)
      .sort((a,b) => b[1] - a[1])
      .map((e, idx) => ({
        rank: idx+1,
        name: e[0],
        count: e[1],
        byScore: agentByScore[e[0]] || {},
      }));
  }, [tableData, selectedScoreCase, viewMode]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between xl:gap-8 gap-4 mb-4">
        <div className="flex flex-col xl:flex-row xl:items-center gap-4 w-full overflow-hidden">
          <h1 className="text-lg font-bold text-text-primary whitespace-nowrap shrink-0">CSAT Room (Survey)</h1>
          <div className="flex flex-col md:flex-row gap-2 xl:gap-4 w-full overflow-hidden">
             <SegmentedControl
               value={viewMode}
               onChange={setViewMode}
               options={[
                 { value: 'full', label: 'Full Score', icon: CheckCircle },
                 { value: 'fair', label: 'After Takeout', icon: Filter },
               ]}
             />
             <SegmentedControl
               value={analysisMode}
               onChange={(mode) => {
                 setAnalysisMode(mode);
                 if (mode === 'score') {
                   setSelectedScoreCase('All');
                   setScoreCasePage(1);
                 }
               }}
               options={[
                 { value: 'agent', label: 'Agent', icon: BarChart2 },
                 { value: 'defect', label: 'Defect', icon: AlertCircle },
                 { value: 'category', label: 'Kategori', icon: Layers },
                 { value: 'score', label: 'Skor', icon: TrendingUp },
               ]}
             />
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input 
              type="text" 
              placeholder="Cari CS ID..."
              aria-label="Cari CS ID..." 
              className="pl-8 pr-3 py-1.5 border border-border rounded-lg text-xs focus:border-primary focus:outline-none w-full md:w-56"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <KpiRankLists
        summaryLabel="Highlight KPI"
        cards={[
          { title: 'Top 3 Kategori Survey', items: highlightRanks.topCategories, tone: 'good' },
          { title: 'Bottom 3 Hari', items: highlightRanks.bottomDays, tone: 'bad' },
          { title: 'Top 3 Agent (CSAT %)', items: highlightRanks.topAgents, tone: 'good' },
          { title: 'Bottom 3 Agent (CSAT %)', items: highlightRanks.bottomAgents, tone: 'bad' },
        ]}
      />

      {isComparisonEnabled && (
        <>
          <WoWChartPanel
            data={data}
            previousData={previousData}
            previousData2={previousData2}
            previousData3={previousData3}
          />
          <RespondentChartPanel
            data={data} 
            previousData={previousData} 
            previousData2={previousData2} 
            previousData3={previousData3} 
            viewMode={viewMode}
          />
        </>
      )}

      {analysisMode === 'score' ? (
        <div className="bg-card border border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border bg-surface-muted flex flex-col md:flex-row md:items-center justify-between gap-4">
             <div>
               <h2 className="text-sm font-bold text-text-primary">Distribusi skor global</h2>
               <p className="text-xs text-text-muted mt-1 ">{totalScoreRows} total tickets processed</p>
             </div>
             
             <div className="flex flex-col md:flex-row bg-card border border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden w-full md:w-auto">
                <div className="flex flex-col justify-center px-4 md:px-6 py-3 border-b md:border-b-0 md:border-r border-border"
                     style={{ borderLeftWidth: '4px', borderLeftColor: 'rgb(var(--kpi-csat))' }}>
                   <div className="flex items-center justify-between md:justify-start gap-4 mb-2">
                     <span className="text-[11px] font-medium tracking-wide text-text-secondary">Total rating responden</span>
                     <span className="text-xl font-bold ml-auto" style={{ color: 'rgb(var(--kpi-csat))' }}>{formatNum(answeredScoreRows, 0)}</span>
                   </div>
                   <div className="flex flex-wrap gap-2 md:gap-4 text-[11px] font-bold items-center">
                     <span className="text-success flex items-center gap-1">5<Star className="w-3 h-3 fill-current"/>: {formatNum(scoreDistribution['5'] || 0, 0)}</span>
                     <span className="text-success flex items-center gap-1">4<Star className="w-3 h-3 fill-current"/>: {formatNum(scoreDistribution['4'] || 0, 0)}</span>
                     <span className="text-text-muted flex items-center gap-1">3<Star className="w-3 h-3 fill-current"/>: {formatNum(scoreDistribution['3'] || 0, 0)}</span>
                     <span className="text-warning flex items-center gap-1">2<Star className="w-3 h-3 fill-current"/>: {formatNum(scoreDistribution['2'] || 0, 0)}</span>
                     <span className="text-danger flex items-center gap-1">1<Star className="w-3 h-3 fill-current"/>: {formatNum(scoreDistribution['1'] || 0, 0)}</span>
                   </div>
                </div>
                <div className="flex flex-col items-center justify-center px-6 py-3 bg-surface-muted/30">
                   <span className="text-[10px] text-text-muted font-bold tracking-wider uppercase mb-1">Response Rate</span>
                   <span className="text-lg font-semibold text-primary">{formatNum(surveyResponseRate, 1)}%</span>
                   <span className="text-[10px] text-text-muted font-medium mt-0.5">({formatNum(answeredScoreRows, 0)} / {formatNum(totalScoreRows, 0)} Ratings)</span>
                </div>
             </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9 gap-3">
               {([
                 { key: 'All', label: 'Semua survey', tone: 'neutral' },
                 { key: 'No Survey', label: 'No Survey', tone: 'neutral' },
                 { key: 'Bad', label: 'Bad Survey', sub: 'Score 1 + 2', tone: 'bad' },
                 { key: '1', label: 'Score 1', tone: 'bad' },
                 { key: '2', label: 'Score 2', tone: 'bad' },
                 { key: '3', label: 'Score 3', tone: 'mid' },
                 { key: '4', label: 'Score 4', tone: 'good' },
                 { key: '5', label: 'Score 5', tone: 'good' },
                 { key: 'Good', label: 'Good Survey', sub: 'Score 4 + 5', tone: 'good' },
               ] as const).map(card => {
                 const count = scoreDistribution[card.key];
                 const pct = totalScoreRows > 0 ? (count / totalScoreRows) * 100 : 0;
                 const isSelected = selectedScoreCase === card.key;
                 const countClass =
                   card.tone === 'good' ? 'text-success' :
                   card.tone === 'bad' ? 'text-danger' :
                   card.tone === 'mid' ? 'text-warning' :
                   'text-text-primary';
                 const selectedBorder =
                   card.tone === 'bad' ? 'border-danger ring-2 ring-danger/20 bg-danger/5' :
                   card.tone === 'good' ? 'border-success ring-2 ring-success/20 bg-success/5' :
                   'border-primary ring-2 ring-primary/20 bg-primary-soft/10';

                 return (
                   <button
                     key={card.key}
                     onClick={() => { setSelectedScoreCase(card.key); setScoreCasePage(1); }}
                     className={`flex flex-col items-center p-4 rounded-xl border transition-all ${isSelected ? `${selectedBorder} shadow-[0_1px_3px_rgba(0,0,0,0.04)]` : 'border-border hover:border-text-muted/30 bg-card hover:bg-surface-muted'}`}
                   >
                     <div className="text-xs font-bold text-text-secondary tracking-wide mb-1 text-center">
                        {card.label}
                     </div>
                     {'sub' in card && card.sub ? (
                       <div className="text-[10px] font-medium text-text-muted mb-1">{card.sub}</div>
                     ) : (
                       <div className="h-[15px] mb-1" />
                     )}
                     <div className={`text-2xl font-semibold mb-1 ${countClass}`}>{formatNum(count, 0)}</div>
                     <div className="text-xs font-medium text-text-muted">{formatNum(pct, 1)}%</div>
                     {card.key === 'Bad' && (
                       <div className="mt-2 text-[10px] font-semibold text-danger/80">
                         1: {formatNum(scoreDistribution['1'], 0)} · 2: {formatNum(scoreDistribution['2'], 0)}
                       </div>
                     )}
                     {card.key === 'Good' && (
                       <div className="mt-2 text-[10px] font-semibold text-success/80">
                         4: {formatNum(scoreDistribution['4'], 0)} · 5: {formatNum(scoreDistribution['5'], 0)}
                       </div>
                     )}
                   </button>
                 );
               })}
            </div>
          </div>

          <div className="border-t border-border mt-2 bg-surface">
             <div className="p-4 border-b border-border bg-surface-muted">
               <h2 className="text-sm font-bold text-text-primary">Analisis detail: {scoreAnalysisLabel}</h2>
               <p className="text-xs text-text-muted mt-1">
                 {isAccumulatedScoreCase
                   ? `Akumulasi top category & agent dari ${scoreAnalysisLabel}. Breakdown per score tetap ditampilkan.`
                   : 'Pilih kartu skor di atas untuk melihat kasus dan agent terkait'}
               </p>
             </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                 <div className="overflow-x-auto border border-border rounded-xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                   <div className="p-3 bg-surface-muted border-b border-border font-bold text-xs text-text-secondary">Top kasus</div>
                   <MobileScrollHint className="px-3 pt-2" />
                    <table className="kpi-data-table w-full text-left">
                     <thead className="bg-surface text-text-secondary border-b border-border">
                       <tr>
                         <th className="p-2 font-bold w-12 text-center  min-w-[60px] max-w-[60px]">Peringkat</th>
                         <th className="p-2 font-bold ">Kasus / kategori</th>
                         {accumulatedScoreKeys?.map((sk) => (
                           <th key={sk} className="p-2 font-bold w-16 text-center">Score {sk}</th>
                         ))}
                         <th className="p-2 font-bold w-24 text-center">{isAccumulatedScoreCase ? 'Total' : 'Freq'}</th>
                       </tr>
                     </thead>
                     <tbody className="">
                       {scoreAnalysisTopCases.slice((scoreCasePage - 1) * 20, scoreCasePage * 20).map((cat) => {
                         const isTakeoutCategory = isCsatTakeoutCategory(cat.name);
                         return (
                         <tr key={cat.name} className="border-b border-border hover:bg-surface-muted transition-colors group">
                           <td className="p-2 text-center text-text-muted font-medium">{cat.rank}</td>
                           <td className={`p-2 font-medium max-w-[200px] truncate ${isTakeoutCategory ? 'text-danger' : 'text-text-primary'}`} title={cat.name}>{cat.name}</td>
                           {accumulatedScoreKeys?.map((sk) => (
                             <td key={sk} className="p-2 text-center font-medium text-[11px] text-text-secondary">
                               {formatNum(cat.byScore[sk] || 0, 0)}
                             </td>
                           ))}
                           <td className="p-2 text-center font-bold text-[11px] text-text-secondary">{formatNum(cat.count, 0)}</td>
                         </tr>
                       )})}
                       {scoreAnalysisTopCases.length === 0 && (
                         <tr>
                           <td colSpan={3 + (accumulatedScoreKeys?.length || 0)} className="p-8 text-center text-text-muted text-sm border-b border-border">
                             Tidak ada kasus.
                           </td>
                         </tr>
                       )}
                     </tbody>
                   </table>
                 </div>

                 <div className="overflow-x-auto border border-border rounded-xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                   <div className="p-3 bg-surface-muted border-b border-border font-bold text-xs text-text-secondary">Top agent</div>
                   <MobileScrollHint className="px-3 pt-2" />
                   <table className="kpi-data-table w-full text-left">
                     <thead className="bg-surface text-text-secondary border-b border-border">
                       <tr>
                         <th className="p-2 font-bold w-12 text-center  min-w-[60px] max-w-[60px]">Peringkat</th>
                         <th className="p-2 font-bold ">Agent Name</th>
                         {accumulatedScoreKeys?.map((sk) => (
                           <th key={sk} className="p-2 font-bold w-16 text-center">Score {sk}</th>
                         ))}
                         <th className="p-2 font-bold w-24 text-center">{isAccumulatedScoreCase ? 'Total' : 'Freq'}</th>
                       </tr>
                     </thead>
                     <tbody className="">
                       {scoreAnalysisTopAgents.slice((scoreCasePage - 1) * 20, scoreCasePage * 20).map((agt) => (
                         <tr key={agt.name} className="border-b border-border hover:bg-surface-muted transition-colors group">
                           <td className="p-2 text-center text-text-muted font-medium">{agt.rank}</td>
                           <td className="p-2 font-medium text-text-primary max-w-[200px] truncate" title={agt.name}>{agt.name}</td>
                           {accumulatedScoreKeys?.map((sk) => (
                             <td key={sk} className="p-2 text-center font-medium text-[11px] text-text-secondary">
                               {formatNum(agt.byScore[sk] || 0, 0)}
                             </td>
                           ))}
                           <td className="p-2 text-center font-bold text-[11px] text-text-secondary">{formatNum(agt.count, 0)}</td>
                         </tr>
                       ))}
                       {scoreAnalysisTopAgents.length === 0 && (
                         <tr>
                           <td colSpan={3 + (accumulatedScoreKeys?.length || 0)} className="p-8 text-center text-text-muted text-sm border-b border-border">
                             No agents found.
                           </td>
                         </tr>
                       )}
                     </tbody>
                   </table>
                 </div>
             </div>
             
             {/* Pagination */}
             {(scoreAnalysisTopCases.length > 20 || scoreAnalysisTopAgents.length > 20) && (
               <div className="px-4 py-3 border-t border-border bg-surface flex items-center justify-between">
                 <span className="text-xs text-text-muted">
                   Showing Page {scoreCasePage} of {Math.max(Math.ceil(scoreAnalysisTopCases.length / 20), Math.ceil(scoreAnalysisTopAgents.length / 20))}
                 </span>
                 <div className="flex gap-2">
                   <button 
                     onClick={() => setScoreCasePage(p => Math.max(1, p - 1))}
                     disabled={scoreCasePage === 1}
                     className="px-3 py-1 bg-card border border-border rounded-xl text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-muted transition-colors"
                   >
                     Previous
                   </button>
                   <button 
                     onClick={() => setScoreCasePage(p => p + 1)}
                     disabled={scoreCasePage >= Math.max(Math.ceil(scoreAnalysisTopCases.length / 20), Math.ceil(scoreAnalysisTopAgents.length / 20))}
                     className="px-3 py-1 bg-card border border-border rounded-xl text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-muted transition-colors"
                   >
                     Next
                   </button>
                 </div>
               </div>
             )}
          </div>
        </div>
      ) : analysisMode === 'category' ? (
        <div className="flex flex-col gap-6">
          {/* Categories Panel */}
          <div className="bg-card border border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-surface-muted flex flex-col md:flex-row md:items-center justify-between gap-3">
               <div>
                 <h2 className="text-base font-bold text-text-primary">Top Categories (Score 1 & 2)</h2>
                 <p className="text-xs text-text-muted mt-1 ">Identifies categories and top contributors for bad scores</p>
               </div>
               <span className="text-[11px] text-text-secondary font-bold px-3 py-1.5 bg-card border border-border rounded-lg tracking-wide">
                 {viewMode === 'full' ? 'From Data penuh' : 'After Takeout'}
               </span>
            </div>

            <div className={isComparisonEnabled ? "p-3" : "p-3"}>
              {isComparisonEnabled ? (
                <WoWAnalysisPanel 
                  type="category"
                  data={data} 
                  previousData={previousData} 
                  previousData2={previousData2} 
                  previousData3={previousData3} 
                  viewMode={viewMode}
                  search={search}
                  filterTL={filterTL}
                  onCategoryClick={handleCategoryClick}
                  onAgentClick={handleAgentClick}
                />
              ) : (
                <div className="overflow-x-auto border border-border rounded-xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                 <div className="p-3 bg-surface-muted border-b border-border font-bold text-xs text-text-secondary">Top 10 kategori</div>
                 <MobileScrollHint className="px-3 pt-2" />
                <table className="kpi-data-table w-full text-left">
                 <thead className="bg-surface text-text-secondary border-b border-border">
                   <tr>
                     <th className="p-2 font-bold w-12 text-center min-w-[60px] max-w-[60px]">Peringkat</th>
                     <th className="p-2 font-bold ">Category Name</th>
                     <th className="p-2 font-bold w-16 text-center">Freq</th>
                     {isComparisonEnabled && <th className="p-2 font-bold w-16 text-center">{comparisonMode === 'mom' ? 'MoM' : 'WoW'}</th>}
                   </tr>
                 </thead>
                 <tbody className="">
                   {topCategories.map((cat) => {
                      const isTakeoutCategory = [
                          "tidak bisa transaksi namun memiliki limit",
                          "pengajuan limit kredit ditolak",
                          "pertanyaan belum bisa diidentifikasi"
                      ].includes(cat.name.toLowerCase());
                      
                      const prevCount = prevTopCategories[cat.name] || 0;
                      const diff = cat.count - prevCount;
                      const isUp = diff > 0;

                      return (
                        <tr key={cat.name} className="border-b border-border hover:bg-surface-muted transition-colors group cursor-pointer" onClick={() => handleCategoryClick(cat.name, viewMode === 'full' ? 'From Data penuh' : 'After Takeout', data)}>
                          <td className="p-2 text-center text-text-muted font-medium">{cat.rank}</td>
                          <td className={`p-2 font-medium max-w-[200px] truncate ${isTakeoutCategory ? 'text-danger' : 'text-text-primary'}`} title={cat.name}>{cat.name}</td>
                          <td className="p-2 text-center font-bold text-[11px] text-text-secondary">{formatNum(cat.count, 0)}</td>
                          {isComparisonEnabled && (
                            <td className="p-2 text-center font-bold text-[10px]">
                              {diff !== 0 ? (
                                <span className={isUp ? 'text-red-500' : 'text-green-500'}>
                                  {isUp ? '▲' : '▼'} {Math.abs(diff)}
                                </span>
                              ) : (
                                <span className="text-text-tertiary">▬ 0</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                   })}
                   {topCategories.length === 0 && (
                     <tr>
                       <td colSpan={3} className="p-8 text-center text-text-muted text-sm border-b border-border">
                         No categories found for the selected criteria.
                       </td>
                     </tr>
                   )}
                 </tbody>
               </table>
              </div>
              )}
            </div>
          </div>

          {/* Agents Panel */}
          <div className="bg-card border border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-surface-muted flex flex-col md:flex-row md:items-center justify-between gap-3">
               <div>
                 <h2 className="text-base font-bold text-text-primary">Agent Bottom Score 1-2</h2>
                 <p className="text-xs text-text-muted mt-1 ">Identifies agents with the highest bad scores</p>
               </div>
               <span className="text-[11px] text-text-secondary font-bold px-3 py-1.5 bg-card border border-border rounded-lg tracking-wide">
                 {viewMode === 'full' ? 'From Data penuh' : 'After Takeout'}
               </span>
            </div>

            <div className={isComparisonEnabled ? "p-2" : "p-3"}>
              {isComparisonEnabled ? (
                <WoWAnalysisPanel 
                  type="agent"
                  data={data} 
                  previousData={previousData} 
                  previousData2={previousData2} 
                  previousData3={previousData3} 
                  viewMode={viewMode}
                  search={search}
                  filterTL={filterTL}
                  onCategoryClick={handleCategoryClick}
                  onAgentClick={handleAgentClick}
                />
              ) : (
                <div className="overflow-x-auto border border-border rounded-xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
               <div className="p-3 bg-surface-muted border-b border-border font-bold text-xs text-text-secondary">Agent kritis</div>
               <MobileScrollHint className="px-3 pt-2" />
               <table className="kpi-data-table w-full text-left">
                 <thead className="bg-surface text-text-secondary border-b border-border">
                   <tr>
                     <th className="p-2 font-bold w-12 text-center min-w-[60px] max-w-[60px]">Peringkat</th>
                     <th className="p-2 font-bold ">Agent Name</th>
                     <th className="p-2 font-bold w-24 text-center">Freq</th>
                   </tr>
                 </thead>
                 <tbody className="">
                   {agentRankings.critical.map((agent, i) => (
                     <tr key={agent.csId} className="border-b border-border hover:bg-surface-muted transition-colors group">
                       <td className="p-2 text-center text-text-muted font-medium">{i+1}</td>
                       <td className="p-2 font-medium text-text-primary max-w-[200px] truncate" title={agent.name}>{agent.name}</td>
                       <td className="p-2 text-center font-bold text-[11px] text-text-secondary">{agent.badScoreCount}</td>
                     </tr>
                   ))}
                   {agentRankings.critical.length === 0 && (
                     <tr>
                       <td colSpan={3} className="p-8 text-center text-text-muted text-sm border-b border-border">
                         Tidak ada agent kritis.
                       </td>
                     </tr>
                   )}
                 </tbody>
                </table>
              </div>
              )}
            </div>
          </div>
        </div>
      ) : analysisMode === 'agent' ? (
        <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted">
            Klik baris untuk rincian harian · {viewMode === 'full' ? 'skor penuh' : 'setelah takeout'}, target {csatTarget}%
          </span>
        </div>
        <div className="relative w-full overflow-auto bg-card border text-sm border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl flex-1 max-h-[calc(100vh-200px)]">
          <table className="kpi-data-table w-full text-left border-collapse">
            <thead className="bg-surface text-text-secondary sticky top-0 z-30">
              <tr>
                <th className="p-2 font-bold text-center border-b border-border bg-surface w-[48px]">No</th>
                <SortableHeader label="Nama / CS ID" sortKey="name" config={agentSortConfig} onSort={handleAgentSort} className="border-b border-border bg-surface min-w-[200px]" />
                <SortableHeader label="BPO · TL" sortKey="teamLeader" config={agentSortConfig} onSort={handleAgentSort} className="border-b border-border bg-surface min-w-[130px]" />
                <th className="p-2 font-bold text-text-muted border-b border-border bg-surface min-w-[150px]">Tren 20 hari</th>
                <SortableHeader label={`Rata-rata · t ${csatTarget}%`} sortKey="average" config={agentSortConfig} onSort={handleAgentSort} className="text-right text-text-primary border-b border-border bg-surface w-[130px]" />
                <th className="p-2 font-bold text-right text-text-muted border-b border-border bg-surface w-[72px]">vs&nbsp;{csatTarget}</th>
                <th className="p-2 border-b border-border bg-surface w-[40px]" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {sortedAgentData.map((agent, index) => {
                const displayName = agent.name || agent.csId;
                const totalCount = viewMode === 'full' ? agent.csatScFullCount : agent.csatScFairCount;
                const dailyByDate = indexByDate(
                  viewMode === 'full' ? agent.dailyHistory?.csatScFull : agent.dailyHistory?.csatScFair,
                );
                const scheduleByDate = indexByDate(agent.dailyHistory?.schedule);
                // Official formula: good_count / total_valid × 100 (score 3 excluded;
                // stored per day as score=good, count=total_valid).
                const dailyVals = chronoDates.map((date) => {
                  const d = getByCalendarDate(dailyByDate, date);
                  return d && d.count > 0 ? (d.score / d.count) * 100 : null;
                });
                const pct = agentCsatPct(agent);
                const status = getKpiStatus(pct, csatKpiType);
                const vsTarget = pct !== null ? pct - csatTarget : null;
                const isOpen = expandedRows.has(agent.csId);

                return (
                  <React.Fragment key={agent.csId}>
                    <tr
                      className="border-b border-border transition-colors group hover:bg-surface-muted cursor-pointer"
                      onClick={() => toggleRow(agent.csId)}
                    >
                      <td className="p-2 text-center text-text-muted font-medium w-[48px]">{index + 1}</td>
                      <td className="p-2 min-w-[200px]">
                        <div className="font-semibold text-text-primary truncate" title={agent.csId}>{displayName}</div>
                        <div className="text-[9px] text-text-muted truncate">{agent.csId}</div>
                      </td>
                      <td className="p-2 text-text-secondary min-w-[130px] truncate">
                        <span className="uppercase">{agent.bpo || '-'}</span>
                        <span className="text-text-muted"> · {agent.teamLeader || '-'}</span>
                      </td>
                      <td className="p-2 min-w-[150px]">
                        <div className={status === 'miss' ? 'text-danger' : status === 'watch' ? 'text-warning' : 'text-text-muted'}>
                          <Sparkline values={dailyVals} height={22} />
                        </div>
                      </td>
                      <td className="p-2 text-right w-[130px]">
                        {pct !== null ? (
                          <div className="flex flex-col items-end">
                            <KpiValue value={pct} type={csatKpiType} text={`${formatNum(pct)}%`} className="justify-end" />
                            <span className="text-[9px] text-text-muted">{totalCount} valid</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-text-disabled">-</span>
                        )}
                      </td>
                      <td className="p-2 text-right w-[72px] text-[11px] tabular-nums">
                        {vsTarget !== null ? (
                          <span className={`inline-flex items-center justify-end gap-1 font-medium ${status === 'miss' ? 'text-danger' : status === 'watch' ? 'text-warning' : 'text-text-muted'}`}>
                            <KpiCue status={status} />
                            {vsTarget >= 0 ? '+' : '−'}{Math.abs(vsTarget).toFixed(1)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-2 text-center w-[40px]">
                        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-surface/40 border-b border-border">
                        <td colSpan={7} className="px-4 pb-4 pt-1">
                          <div className="flex items-center justify-between pt-3 pb-2">
                            <span className="text-[9px] text-text-muted uppercase tracking-wide">
                              CSAT per hari &mdash; hanya di bawah target yang berwarna &middot; klik sel untuk rincian
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedAgent({ agent, type: 'csat' }); }}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-text-muted hover:text-primary transition-colors"
                            >
                              <Eye className="w-3 h-3" /> Lihat semua rating
                            </button>
                          </div>
                          <DayStrip
                            kpiType={csatKpiType}
                            format={(v) => `${formatNum(v, 2)}%`}
                            chipWidth={56}
                            onSelect={(date) => setSelectedAgent({ agent, date, type: 'csat' })}
                            items={chronoDates.map((date, di) => {
                              const st = getByCalendarDate(scheduleByDate, date)?.status?.toUpperCase() || '';
                              return { date, value: dailyVals[di], off: st === 'OFF' || st === 'C' };
                            })}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {tableData.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 z-10">
                    <EmptyState
                      title="Tidak ada data CSAT survey"
                      description="Coba ubah pencarian, filter TL, view mode, atau rentang tanggal."
                      variant="filter"
                      className="border-0 bg-transparent py-6"
                      showDataActions
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      ) : analysisMode === 'defect' ? (
        <>
        <MobileScrollHint label="Geser → untuk lihat semua kolom" />
        <div className="relative w-full overflow-auto bg-card border text-sm border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl transition-all flex-1 max-h-[calc(100vh-200px)]">
            <table className="kpi-data-table w-full text-left whitespace-nowrap border-collapse">
            <thead className="bg-surface text-text-secondary sticky top-0 z-30">
              <tr>
                <th className="p-2 font-bold text-center border-b border-border md:sticky md:left-0 z-40 bg-surface min-w-[60px] max-w-[60px]">No</th>
                <SortableHeader label="Nama / CS ID" sortKey="name" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border md:sticky md:left-[60px] z-40 bg-surface min-w-[250px] max-w-[250px]" />
                <SortableHeader label="BPO" sortKey="bpo" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border md:sticky md:left-[310px] z-40 bg-surface min-w-[80px] max-w-[80px]" />
                <SortableHeader label="TL" sortKey="teamLeader" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border md:sticky md:left-[390px] z-40 bg-surface min-w-[120px] max-w-[120px]" />
                <SortableHeader label="Score 1" sortKey="score1" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border text-center bg-surface" />
                <SortableHeader label="Score 2" sortKey="score2" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border text-center bg-surface" />
                <SortableHeader label="Score 3" sortKey="score3" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border text-center bg-surface" />
                <SortableHeader label="Score 4" sortKey="score4" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border text-center bg-surface" />
                <SortableHeader label="Score 5" sortKey="score5" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border text-center bg-surface" />
                <SortableHeader label="Kategori tersering" sortKey="category" config={defectSortConfig} onSort={handleDefectSort} className="border-b border-border bg-surface w-full" />
                <th className="p-2 font-bold text-center text-text-primary bg-surface md:sticky md:right-0 z-40 border-b border-border border-l border-border/50 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)]">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="">
              {sortedDefectData.map((agent, index) => {
                const displayName = agent.name || agent.csId;
                
                const score1Count = agent.csatHistory.filter(h => h.score === 1 && (viewMode === 'full' || !h.isTakeout)).length;
                const score2Count = agent.csatHistory.filter(h => h.score === 2 && (viewMode === 'full' || !h.isTakeout)).length;
                const score3Count = agent.csatHistory.filter(h => h.score === 3 && (viewMode === 'full' || !h.isTakeout)).length;
                const score4Count = agent.csatHistory.filter(h => h.score === 4 && (viewMode === 'full' || !h.isTakeout)).length;
                const score5Count = agent.csatHistory.filter(h => h.score === 5 && (viewMode === 'full' || !h.isTakeout)).length;
                
                const cats = viewMode === 'full' ? agent.csatScCategoriesFull : agent.csatScCategoriesFair;
                let topCat = '-';
                if (Object.keys(cats).length > 0) {
                    topCat = Object.entries(cats).sort((a, b) => (b[1] as number) - (a[1] as number))[0][0];
                }

                return (
                <tr key={agent.csId} className="border-b border-border transition-colors group hover:bg-surface-muted">
                  <td className="p-2 text-center text-text-muted font-medium md:sticky md:left-0 z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[60px] max-w-[60px]">{index + 1}</td>
                  <td className="p-2 font-medium md:sticky md:left-[60px] z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[250px] max-w-[250px] truncate">
                    <span className="text-kpi-neutral-text font-semibold" title={agent.csId}>
                      {displayName}
                    </span>
                  </td>
                  <td className="p-2 font-medium text-text-primary uppercase md:sticky md:left-[310px] z-20 bg-card group-hover:bg-surface-muted min-w-[80px] max-w-[80px] truncate">
                    {agent.bpo || '-'}
                  </td>
                  <td className="p-2 font-medium text-text-primary md:sticky md:left-[390px] z-20 bg-card group-hover:bg-surface-muted transition-colors min-w-[120px] max-w-[120px] truncate">{agent.teamLeader || '-'}</td>
                  
                  <td className="p-2 text-center z-10">
                     <span className={`px-2 py-1 rounded font-bold text-[11px] ${score1Count > 0 ? 'bg-danger/10 text-danger' : 'text-text-disabled'}`}>
                       {score1Count}
                     </span>
                  </td>
                  <td className="p-2 text-center z-10">
                     <span className={`px-2 py-1 rounded font-bold text-[11px] ${score2Count > 0 ? 'bg-warning/10 text-warning-[.8]' : 'text-text-disabled'}`}>
                       {score2Count}
                     </span>
                  </td>
                  <td className="p-2 text-center z-10">
                     <span className={`px-2 py-1 rounded font-bold text-[11px] ${score3Count > 0 ? 'bg-warning/10 text-warning' : 'text-text-disabled'}`}>
                       {score3Count}
                     </span>
                  </td>
                  <td className="p-2 text-center z-10">
                     <span className={`px-2 py-1 rounded font-bold text-[11px] ${score4Count > 0 ? 'bg-success/10 text-success' : 'text-text-disabled'}`}>
                       {score4Count}
                     </span>
                  </td>
                  <td className="p-2 text-center z-10">
                     <span className={`px-2 py-1 rounded font-bold text-[11px] ${score5Count > 0 ? 'bg-success/10 text-success' : 'text-text-disabled'}`}>
                       {score5Count}
                     </span>
                  </td>
                  <td className="p-2 font-medium text-text-primary z-10 truncate max-w-[300px]">
                    {topCat}
                  </td>
                  
                  <td className="p-2 text-center flex items-center justify-center z-10 md:sticky md:right-0 bg-card group-hover:bg-surface-muted border-l border-border/50">
                    <button 
                      onClick={() => setSelectedAgent({ agent, type: 'defects' })}
                      className="flex items-center gap-1 text-[10px] text-text-muted hover:text-primary transition-colors px-2 py-1 rounded hover:bg-surface-muted relative cursor-pointer"
                      title="View Defect Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="font-bold">Detail</span>
                    </button>
                  </td>
                </tr>
              )})}
              {tableData.filter(agent => (viewMode === 'full' ? agent.csatScBadScoreFullCount : agent.csatScBadScoreFairCount) > 0).length === 0 && (
                <tr>
                  <td colSpan={11} className="p-4 z-10">
                    <EmptyState
                      title="Tidak ada defect CSAT"
                      description="Tidak ada score buruk pada filter dan view mode saat ini."
                      variant="data"
                      className="border-0 bg-transparent py-6"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      ) : null}
      
      {selectedAgent && (
        <CsatDetailModal
          title={<>Historical Audit Trail: {selectedAgent.agent.name || selectedAgent.agent.csId}</>}
          subtitle={<>CS ID: <span className="font-semibold text-text-primary">{selectedAgent.agent.csId}</span> &nbsp;&bull;&nbsp; TL: <span className="font-semibold text-text-primary">{selectedAgent.agent.teamLeader || '-'}</span></>}
          surveys={selectedAgent.date
            ? selectedAgent.agent.csatHistory.filter((h) => {
                const nd = h.normDate || normalizeDateStr(h.date || '') || h.date;
                return nd === selectedAgent.date || h.date === selectedAgent.date;
              })
            : selectedAgent.agent.csatHistory}
          agentType={selectedAgent.type}
          onClose={() => setSelectedAgent(null)}
          expandedDates={expandedDates}
          toggleExpandDate={(date) => {
            const newExpanded = new Set(expandedDates);
            if (newExpanded.has(date)) newExpanded.delete(date);
            else newExpanded.add(date);
            setExpandedDates(newExpanded);
          }}
          viewMode={viewMode}
        />
      )}
      
      {wowModalData && (
        <CsatDetailModal
          title={wowModalData.title}
          subtitle={wowModalData.subtitle}
          surveys={wowModalData.surveys}
          modalType={typeof wowModalData.title === 'string' && wowModalData.title.includes('Category Analysis') ? 'category' : 'agent'}
          onClose={() => setWowModalData(null)}
          expandedDates={expandedDates}
          toggleExpandDate={(date) => {
            const newExpanded = new Set(expandedDates);
            if (newExpanded.has(date)) newExpanded.delete(date);
            else newExpanded.add(date);
            setExpandedDates(newExpanded);
          }}
          viewMode={viewMode}
        />
      )}
    </div>
  );
};

const WoWChartPanel = ({ data, previousData, previousData2, previousData3 }: any) => {
  const { startDate, endDate, comparisonMode } = useStore(useShallow((s) => ({
    startDate: s.startDate,
    endDate: s.endDate,
    comparisonMode: s.comparisonMode,
  })));
  const [trendMode, setTrendMode] = useState<'weekly' | 'daily'>('daily');

  const getWeekLabel = (offset: number) => {
    if (!startDate || !endDate) return `Week -${offset}`;
    const diff = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    const end = new Date(endDate);
    if (comparisonMode === 'mom') {
      return getMonthOffsetLabel(startDate, offset);
    }
    end.setDate(end.getDate() - (offset * diff));
    const month = new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(end);
    const weekNum = Math.ceil(end.getDate() / 7);
    return `W${weekNum} ${month}`;
  };

  const calcStats = (dataset: AgentKPI[]) => {
    let sumFull = 0, countFull = 0;
    let sumTakeout = 0, countTakeout = 0;
    
    (dataset || []).forEach(d => {
      sumFull += d.csatScGoodCount || 0;
      countFull += d.csatScTotalValid || 0;
      sumTakeout += d.csatScFairGoodCount || 0;
      countTakeout += d.csatScFairTotalValid || 0;
    });

    return {
      full: countFull > 0 ? Number(((sumFull / countFull) * 100).toFixed(2)) : 0,
      takeout: countTakeout > 0 ? Number(((sumTakeout / countTakeout) * 100).toFixed(2)) : 0,
    };
  };

  const w0 = calcStats(data);
  const w1 = calcStats(previousData);
  const w2 = calcStats(previousData2);
  const w3 = calcStats(previousData3);

  const chartData = [
    { name: getWeekLabel(3), 'SC Full': w3.full, 'SC After Takeout': w3.takeout },
    { name: getWeekLabel(2), 'SC Full': w2.full, 'SC After Takeout': w2.takeout },
    { name: getWeekLabel(1), 'SC Full': w1.full, 'SC After Takeout': w1.takeout },
    { name: getWeekLabel(0), 'SC Full': w0.full, 'SC After Takeout': w0.takeout },
  ].filter(d => d.name !== 'WNaN Invalid Date');
  // Drop periods with no survey data (un-populated month) — a 0 there is noise.
  const visibleChartData = (comparisonMode === 'mom' ? chartData.slice(1) : chartData)
    .filter(d => d['SC Full'] > 0 || d['SC After Takeout'] > 0);

  const dailyData = React.useMemo(() => {
    const dates = new Map<string, { goodFull: number, totalFull: number, goodTakeout: number, totalTakeout: number }>();
    (data || []).forEach(a => {
      a.dailyHistory?.csatScFull?.forEach(h => {
        if (!dates.has(h.date)) dates.set(h.date, { goodFull: 0, totalFull: 0, goodTakeout: 0, totalTakeout: 0 });
        if (h.count > 0) {
          dates.get(h.date)!.goodFull += h.score;
          dates.get(h.date)!.totalFull += h.count;
        }
      });
      a.dailyHistory?.csatScFair?.forEach(h => {
        if (!dates.has(h.date)) dates.set(h.date, { goodFull: 0, totalFull: 0, goodTakeout: 0, totalTakeout: 0 });
        if (h.count > 0) {
          dates.get(h.date)!.goodTakeout += h.score;
          dates.get(h.date)!.totalTakeout += h.count;
        }
      });
    });

    return Array.from(dates.entries())
      .map(([date, stats]) => ({
        date: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(parseDateForSort(date))),
        'SC Full': stats.totalFull > 0 ? Number(((stats.goodFull / stats.totalFull) * 100).toFixed(2)) : 0,
        'SC After Takeout': stats.totalTakeout > 0 ? Number(((stats.goodTakeout / stats.totalTakeout) * 100).toFixed(2)) : 0,
        rawDate: date,
      }))
      .sort((a, b) => parseDateForSort(a.rawDate) - parseDateForSort(b.rawDate));
  }, [data]);

  const weeklyData = React.useMemo(() => {
    const weeks = new Map<string, {
      label: string,
      startDate: string,
      endDate: string,
      minKey: string,
      maxKey: string,
      goodFull: number,
      totalFull: number,
      goodTakeout: number,
      totalTakeout: number,
    }>();

    const getWeekBucket = (date: string) => {
      const parsedTimestamp = parseDateForSort(date);
      if (!parsedTimestamp) {
        return { key: date, label: date, startDate: date, endDate: date };
      }
      const parsed = new Date(parsedTimestamp);

      const start = new Date(parsed);
      const day = start.getDay();
      start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const toDateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
      const formatDate = (value: Date) => new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
      }).format(value);
      const label = start.getMonth() === end.getMonth()
        ? `${start.getDate()}-${end.getDate()} ${new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(start)}`
        : `${formatDate(start)}-${formatDate(end)}`;

      return {
        key: toDateKey(start),
        label,
        startDate: toDateKey(start),
        endDate: toDateKey(end),
      };
    };

    const ensureWeek = (date: string) => {
      const bucket = getWeekBucket(date);
      if (!weeks.has(bucket.key)) {
        weeks.set(bucket.key, {
          label: bucket.label,
          startDate: bucket.startDate,
          endDate: bucket.endDate,
          minKey: '',
          maxKey: '',
          goodFull: 0,
          totalFull: 0,
          goodTakeout: 0,
          totalTakeout: 0,
        });
      }
      const w = weeks.get(bucket.key)!;
      const k = toDayKey(date);
      if (!w.minKey || k < w.minKey) w.minKey = k;
      if (k > w.maxKey) w.maxKey = k;
      return w;
    };

    // Feed the weekly view from the active period AND the loaded comparison
    // periods. A week that straddles the period start (e.g. Mon 28 Jul with
    // the period starting 1 Aug) then fills its 28–31 Jul days from the prior
    // period instead of rendering a lopsided 3-day bar. Periods are disjoint
    // by construction, so concatenating and summing is safe.
    const source = [
      ...(data || []),
      ...(previousData || []),
      ...(previousData2 || []),
      ...(previousData3 || []),
    ];

    source.forEach(a => {
      a.dailyHistory?.csatScFull?.forEach(h => {
        if (h.count > 0) {
          const week = ensureWeek(h.date);
          week.goodFull += h.score;
          week.totalFull += h.count;
        }
      });
      a.dailyHistory?.csatScFair?.forEach(h => {
        if (h.count > 0) {
          const week = ensureWeek(h.date);
          week.goodTakeout += h.score;
          week.totalTakeout += h.count;
        }
      });
    });

    // Keep only weeks that actually touch the active period — the prior
    // periods are here to complete boundary weeks, not to add their own bars.
    const inActivePeriod = (w: { startDate: string; endDate: string }) =>
      !startDate || !endDate || (w.startDate <= endDate && w.endDate >= startDate);

    return Array.from(weeks.values())
      .filter(inActivePeriod)
      .map(stats => {
        // Label by the days that actually landed in the bucket, so a
        // boundary week that only has 1–3 Aug reads "1-3 Agu", not
        // "27 Jul-2 Agu" (label must match the data behind the bar).
        const label = (stats.minKey && stats.maxKey && dateRangeLabel(stats.minKey, stats.maxKey)) || stats.label;
        return {
          date: label,
          'SC Full': stats.totalFull > 0 ? Number(((stats.goodFull / stats.totalFull) * 100).toFixed(2)) : 0,
          'SC After Takeout': stats.totalTakeout > 0 ? Number(((stats.goodTakeout / stats.totalTakeout) * 100).toFixed(2)) : 0,
          rawDate: stats.startDate,
        };
      })
      .sort((a, b) => parseDateForSort(a.rawDate) - parseDateForSort(b.rawDate));
  }, [data, previousData, previousData2, previousData3, startDate, endDate]);

  const trendData = trendMode === 'weekly' ? weeklyData : dailyData;

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-4 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Period comparison — bars */}
        <div className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-text-primary">{comparisonMode === 'mom' ? 'Tren 3 bulan' : 'Tren 4 minggu'}</h3>
            <span className="inline-flex items-center gap-3 text-[9px] text-text-muted">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2.5 rounded-sm" style={{ background: chart.muted }} />Full · t 75</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2.5 rounded-sm" style={{ background: chart.kpiCsat }} />After Takeout · t 92</span>
            </span>
          </div>
          <div className="h-96 w-full rounded-xl border border-border/50 bg-surface/20 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visibleChartData} margin={{ top: 22, right: 6, left: -14, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--color-surface-muted)', opacity: 0.4 }} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => formatNum(Number(v), 2)} />
                <Bar dataKey="SC Full" fill={chart.muted} radius={[4, 4, 0, 0]} maxBarSize={40}>
                  <LabelList dataKey="SC Full" position="top" style={{ fontSize: 9, fontWeight: 700, fill: 'var(--color-text-muted)' }} formatter={(v: any) => (Number(v) > 0 ? formatNum(Number(v), 2) : '')} />
                </Bar>
                <Bar dataKey="SC After Takeout" fill={chart.kpiCsat} radius={[4, 4, 0, 0]} maxBarSize={40}>
                  <LabelList dataKey="SC After Takeout" position="top" style={{ fontSize: 10, fontWeight: 700, fill: 'var(--color-text-primary)' }} formatter={(v: any) => (Number(v) > 0 ? formatNum(Number(v), 2) : '')} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Current period — daily / weekly bars */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold text-text-primary">
              {trendMode === 'weekly' ? 'Rata-rata mingguan' : 'Tren harian'} ({comparisonMode === 'mom' ? 'bulan ini' : 'minggu ini'})
            </h3>
            <div className="inline-flex items-center rounded-lg border border-border bg-surface-muted p-0.5">
              {(['weekly', 'daily'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTrendMode(mode)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors',
                    trendMode === mode ? 'bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {mode === 'weekly' ? 'Weekly' : 'Daily'}
                </button>
              ))}
            </div>
          </div>
          <div className="h-96 w-full rounded-xl border border-border/50 bg-surface/20 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 22, right: 6, left: -14, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} minTickGap={8} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--color-surface-muted)', opacity: 0.4 }} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => formatNum(Number(v), 2)} />
                <Bar dataKey="SC Full" fill={chart.muted} radius={[3, 3, 0, 0]} maxBarSize={26}>
                  <LabelList dataKey="SC Full" position="top" style={{ fontSize: 9, fontWeight: 700, fill: 'var(--color-text-muted)' }} formatter={(v: any) => (Number(v) > 0 ? formatNum(Number(v), 2) : '')} />
                </Bar>
                <Bar dataKey="SC After Takeout" fill={chart.kpiCsat} radius={[3, 3, 0, 0]} maxBarSize={26}>
                  <LabelList dataKey="SC After Takeout" position="top" style={{ fontSize: 10, fontWeight: 700, fill: 'var(--color-text-primary)' }} formatter={(v: any) => (Number(v) > 0 ? formatNum(Number(v), 2) : '')} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};

const WoWAnalysisPanel = ({ data, previousData, previousData2, previousData3, viewMode, search, filterTL, type = 'all', onCategoryClick, onAgentClick }: any) => {
  const { startDate, endDate, comparisonMode } = useStore(useShallow((s) => ({
    startDate: s.startDate,
    endDate: s.endDate,
    comparisonMode: s.comparisonMode,
  })));

  const getWeekLabel = (offset: number) => {
    if (!startDate || !endDate) return `Week -${offset}`;
    const diff = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    const end = new Date(endDate);
    if (comparisonMode === 'mom') {
      return getMonthOffsetLabel(startDate, offset);
    }
    end.setDate(end.getDate() - (offset * diff));
    const month = new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(end);
    const weekNum = Math.ceil(end.getDate() / 7);
    return `W${weekNum} ${month}`;
  };

  const selectedBpo = useStore(state => state.selectedBpo);
  const upperBpo = (selectedBpo || '').toUpperCase();
  const isSmallBpo = upperBpo === 'TCID' || upperBpo === 'TCID X TIN' || upperBpo === 'TIN X TCID';
  const topCatsLimit = isSmallBpo ? 5 : 10;
  const topAgentsLimit = isSmallBpo ? 2 : 5;

  const calcTopCats = (dataset: AgentKPI[]) => {
    const agg: Record<string, { label: string, count: number, good: number, total: number }> = {};
    dataset.filter(a => {
      const matchSearch = a.csId.toLowerCase().includes(search.toLowerCase()) || (a.name || '').toLowerCase().includes(search.toLowerCase());
      const matchTL = filterTL ? a.teamLeader === filterTL : true;
      const count = viewMode === 'full' ? a.csatScFullCount : a.csatScFairCount;
      return matchSearch && matchTL && count > 0;
    }).forEach(a => {
       a.csatHistory
         .filter(h => (viewMode === 'full' || !h.isTakeout) && isValidCsatScScore(h.score))
         .forEach(h => {
           const label = String(h.category || '').trim().replace(/\s+/g, ' ');
           const key = label.toLowerCase();
           if (!key) return;
           if (!agg[key]) agg[key] = { label, count: 0, good: 0, total: 0 };
           agg[key].total += 1;
           if (h.score === 1 || h.score === 2) agg[key].count += 1;
           if (h.score === 4 || h.score === 5) agg[key].good += 1;
         });
    });
    return Object.entries(agg)
      .sort((a,b) => b[1].count - a[1].count)
      .slice(0, topCatsLimit)
      .map(([, entry], idx) => ({
        rank: idx + 1,
        name: entry.label,
        count: entry.count,
        csatPct: entry.total > 0 ? (entry.good / entry.total) * 100 : null,
      }));
  };

  const calcTopAgents = (dataset: AgentKPI[]) => {
    return dataset.filter(a => {
      const matchSearch = a.csId.toLowerCase().includes(search.toLowerCase()) || (a.name || '').toLowerCase().includes(search.toLowerCase());
      const matchTL = filterTL ? a.teamLeader === filterTL : true;
      const count = viewMode === 'full' ? a.csatScFullCount : a.csatScFairCount;
      return matchSearch && matchTL && count > 0;
    }).map(a => {
       const count = viewMode === 'full' ? (a.csatScBadScoreFullCount || 0) : (a.csatScBadScoreFairCount || 0);
       const categoryCounts = viewMode === 'full' ? (a.csatScCategoriesFull || {}) : (a.csatScCategoriesFair || {});
       const topCategories = Object.entries(categoryCounts)
         .sort(([, countA], [, countB]) => countB - countA)
         .slice(0, 3)
         .map(([name, categoryCount]) => ({ name, count: categoryCount }));
       return { name: a.name || a.csId, csId: a.csId, badScoreCount: count, topCategories };
    }).sort((a, b) => b.badScoreCount - a.badScoreCount).filter(a => a.badScoreCount > 0).slice(0, topAgentsLimit);
  };

  const weeks = [
    ...(comparisonMode === 'mom' ? [] : [{ name: getWeekLabel(3), dataset: previousData3 }]),
    { name: getWeekLabel(2), dataset: previousData2 },
    { name: getWeekLabel(1), dataset: previousData },
    { name: getWeekLabel(0), dataset: data },
  ].filter(period => period.name !== 'WNaN Invalid Date').map(period => ({
    ...period,
    cats: type === 'all' || type === 'category' ? calcTopCats(period.dataset) : [],
    agents: type === 'all' || type === 'agent' ? calcTopAgents(period.dataset) : [],
  }));

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-4', comparisonMode === 'mom' ? 'xl:grid-cols-3' : 'xl:grid-cols-4')}>
      {weeks.map((week, wIdx) => (
        <div key={wIdx} className="flex flex-col gap-4">
          <div className="p-2 bg-primary/10 text-primary font-bold text-center rounded-xl border border-primary/20 text-[11px] tracking-wide">
            {week.name}
          </div>
          
          {(type === 'all' || type === 'category') && (
            <div className="overflow-hidden border border-border rounded-xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col">
              <div className="p-2 bg-surface-muted border-b border-border font-bold text-[10px] text-text-secondary text-center uppercase">
                Top {topCatsLimit} Categories
              </div>
            <table className="kpi-data-table w-full text-left">
              <thead className="bg-surface text-text-secondary border-b border-border">
                <tr>
                  <th className="p-1 font-bold w-6 text-center">#</th>
                  <th className="p-1 font-bold">Category</th>
                  <th className="p-1 font-bold w-8 text-center">Freq</th>
                  <th className="p-1 font-bold w-16 text-center whitespace-nowrap">Good CSAT %</th>
                </tr>
              </thead>
              <tbody>
                {week.cats.map((cat, i) => {
                  const isTakeoutCategory = isCsatTakeoutCategory(cat.name);
                  return (
                    <tr 
                      key={cat.name} 
                      className="border-b border-border hover:bg-surface-muted transition-colors cursor-pointer"
                      onClick={() => onCategoryClick && onCategoryClick(cat.name, week.name, week.dataset)}
                    >
                      <td className="p-1 text-center text-text-muted font-medium">{i+1}</td>
                      <td className={`p-1 font-medium max-w-[96px] truncate ${isTakeoutCategory ? 'text-danger' : 'text-text-primary'}`} title={cat.name}>{cat.name}</td>
                      <td className="p-1 text-center font-bold text-[9px] text-text-secondary">{formatNum(cat.count, 0)}</td>
                      <td className="p-1 text-center font-bold text-[9px] text-text-secondary">{cat.csatPct === null ? '-' : `${formatNum(cat.csatPct, 1)}%`}</td>
                    </tr>
                  );
                })}
                {week.cats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-2 text-center text-text-muted text-[9px] border-b border-border">
                      No categories
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {(type === 'all' || type === 'agent') && (
            <div className="overflow-hidden border border-border rounded-xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col">
              <div className="p-2 bg-surface-muted border-b border-border font-bold text-[10px] text-text-secondary text-center uppercase">
                Top {topAgentsLimit} Agents
              </div>
            <table className="kpi-data-table w-full text-left">
              <thead className="bg-surface text-text-secondary border-b border-border">
                <tr>
                  <th className="p-1 font-bold w-6 text-center">#</th>
                  <th className="p-1 font-bold">Agent Name</th>
                  <th className="p-1 font-bold">Top Categories</th>
                  <th className="p-1 font-bold w-8 text-center">Freq</th>
                </tr>
              </thead>
              <tbody>
                {week.agents.map((agent, i) => {
                  const isRepeat = wIdx === weeks.length - 1 && wIdx > 0 && weeks[wIdx - 1].agents.some(prevAgent => prevAgent.csId === agent.csId);
                  return (
                    <tr 
                      key={agent.csId} 
                      className="border-b border-border hover:bg-surface-muted transition-colors cursor-pointer"
                      onClick={() => onAgentClick && onAgentClick(agent.csId, agent.name, week.name, week.dataset)}
                    >
                      <td className="p-1 text-center text-text-muted font-medium">{i+1}</td>
                      <td className={`p-1 font-medium max-w-[96px] truncate ${isRepeat ? 'text-danger font-bold' : 'text-text-primary'}`} title={agent.name}>{agent.name}</td>
                      <td className="p-1.5 align-top">
                        <div className="space-y-1">
                          {agent.topCategories.length > 0 ? agent.topCategories.map(category => (
                            <div
                              key={category.name}
                              className="flex items-start justify-between gap-2 border-b border-border/50 pb-0.5 text-[9px] leading-tight last:border-b-0 last:pb-0"
                            >
                              <span className="min-w-0 whitespace-normal break-words text-text-secondary" title={category.name}>{category.name}</span>
                              <span className="shrink-0 font-bold text-text-primary" title={`${category.count} cases`}>{category.count}</span>
                            </div>
                          )) : <span className="text-text-muted">-</span>}
                        </div>
                      </td>
                      <td className="p-1 text-center font-bold text-[9px] text-text-secondary">{agent.badScoreCount}</td>
                    </tr>
                  );
                })}
                {week.agents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-2 text-center text-text-muted text-[9px] border-b border-border">
                      No critical agents
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}

        </div>
      ))}
    </div>
  );
};
const RespondentChartPanel = ({ data, previousData, previousData2, previousData3, viewMode }: any) => {
  const { startDate, endDate, comparisonMode } = useStore(useShallow((s) => ({
    startDate: s.startDate,
    endDate: s.endDate,
    comparisonMode: s.comparisonMode,
  })));
  const [trendMode, setTrendMode] = useState<'weekly' | 'daily'>('daily');

  const getWeekLabel = (offset: number) => {
    if (!startDate || !endDate) return `Week -${offset}`;
    const diff = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    const end = new Date(endDate);
    if (comparisonMode === 'mom') {
      return getMonthOffsetLabel(startDate, offset);
    }
    end.setDate(end.getDate() - (offset * diff));
    const month = new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(end);
    const weekNum = Math.ceil(end.getDate() / 7);
    return `W${weekNum} ${month}`;
  };

  const calcRespStats = (dataset: AgentKPI[]) => {
    let totalProcessed = 0;
    let totalRespondents = 0;
    let s5 = 0, s4 = 0, s3 = 0, s2 = 0, s1 = 0;
    (dataset || []).forEach(a => {
      const histories = a.csatHistory.filter(
        h => viewMode === 'full' || !h.isTakeout,
      );
      totalProcessed += histories.length;
      histories.forEach(h => {
        if (h.score >= 1 && h.score <= 5) {
          totalRespondents += 1;
          if (h.score === 5) s5++;
          if (h.score === 4) s4++;
          if (h.score === 3) s3++;
          if (h.score === 2) s2++;
          if (h.score === 1) s1++;
        }
      });
    });
    let rate = totalProcessed > 0 ? Number(((totalRespondents / totalProcessed) * 100).toFixed(1)) : 0;
    return { processed: totalProcessed, respondents: totalRespondents, rate, s5, s4, s3, s2, s1 };
  };

  const weeksData = React.useMemo(() => {
    const w0 = calcRespStats(data);
    const w1 = calcRespStats(previousData);
    const w2 = calcRespStats(previousData2);
    const w3 = calcRespStats(previousData3);

    const periods = [
      { name: getWeekLabel(3), ...w3 },
      { name: getWeekLabel(2), ...w2 },
      { name: getWeekLabel(1), ...w1 },
      { name: getWeekLabel(0), ...w0 },
    ];
    return (comparisonMode === 'mom' ? periods.slice(1) : periods)
      .filter(d => d.name !== 'WNaN Invalid Date')
      // Drop un-populated periods so their card + nonsense % don't show.
      .filter(d => d.processed > 0 || d.respondents > 0);
  }, [data, previousData, previousData2, previousData3, startDate, endDate, viewMode, comparisonMode]);

  const dailyRespData = React.useMemo(() => {
    const dates = new Map<string, { processed: number, respondents: number, s5: number, s4: number, s3: number, s2: number, s1: number }>();
    (data || []).forEach(a => {
      a.csatHistory
        .filter(h => viewMode === 'full' || !h.isTakeout)
        .forEach(h => {
        if (!dates.has(h.date)) dates.set(h.date, { processed: 0, respondents: 0, s5:0, s4:0, s3:0, s2:0, s1:0 });
        const dInfo = dates.get(h.date)!;
        dInfo.processed += 1;
        if (h.score >= 1 && h.score <= 5) {
          dInfo.respondents += 1;
          if (h.score === 5) dInfo.s5++;
          if (h.score === 4) dInfo.s4++;
          if (h.score === 3) dInfo.s3++;
          if (h.score === 2) dInfo.s2++;
          if (h.score === 1) dInfo.s1++;
        }
        });
    });
    
    return Array.from(dates.entries())
      .map(([date, stats]) => {
        const d = new Date(date);
        let validDate = date;
        if (!isNaN(d.getTime())) {
          validDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d);
        } else {
          const parts = date.split(' ');
          if (parts.length === 3) validDate = `${parts[0]} ${parts[1]}`;
        }
        return {
          date: validDate,
          Respondents: stats.respondents,
          s5: stats.s5, s4: stats.s4, s3: stats.s3, s2: stats.s2, s1: stats.s1,
          rawDate: date
        };
      })
      .sort((a, b) => parseDateForSort(a.rawDate) - parseDateForSort(b.rawDate));
  }, [data, viewMode]);

  const weeklyRespData = React.useMemo(() => {
    const weeks = new Map<string, {
      label: string,
      startDate: string,
      minKey: string,
      maxKey: string,
      processed: number,
      respondents: number,
      s5: number,
      s4: number,
      s3: number,
      s2: number,
      s1: number,
    }>();

    const getWeekBucket = (date: string) => {
      const parsedTimestamp = parseDateForSort(date);
      if (!parsedTimestamp) return { key: date, label: date, startDate: date };

      const start = new Date(parsedTimestamp);
      const day = start.getDay();
      start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const toDateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
      const formatDate = (value: Date) => new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
      }).format(value);
      const label = start.getMonth() === end.getMonth()
        ? `${start.getDate()}-${end.getDate()} ${new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(start)}`
        : `${formatDate(start)}-${formatDate(end)}`;

      return { key: toDateKey(start), label, startDate: toDateKey(start) };
    };

    (data || []).forEach(a => {
      a.csatHistory
        .filter(h => viewMode === 'full' || !h.isTakeout)
        .forEach(h => {
          const bucket = getWeekBucket(h.date);
          if (!weeks.has(bucket.key)) {
            weeks.set(bucket.key, {
              label: bucket.label,
              startDate: bucket.startDate,
              minKey: '',
              maxKey: '',
              processed: 0,
              respondents: 0,
              s5: 0,
              s4: 0,
              s3: 0,
              s2: 0,
              s1: 0,
            });
          }

          const week = weeks.get(bucket.key)!;
          const k = toDayKey(h.date);
          if (!week.minKey || k < week.minKey) week.minKey = k;
          if (k > week.maxKey) week.maxKey = k;
          week.processed += 1;
          if (h.score >= 1 && h.score <= 5) {
            week.respondents += 1;
            if (h.score === 5) week.s5++;
            if (h.score === 4) week.s4++;
            if (h.score === 3) week.s3++;
            if (h.score === 2) week.s2++;
            if (h.score === 1) week.s1++;
          }
        });
    });

    return Array.from(weeks.values())
      .map(week => ({
        // Label by the days actually in the bucket — a partial boundary
        // week reads its real range, not the full Mon–Sun span.
        date: (week.minKey && week.maxKey && dateRangeLabel(week.minKey, week.maxKey)) || week.label,
        Respondents: week.respondents,
        s5: week.s5,
        s4: week.s4,
        s3: week.s3,
        s2: week.s2,
        s1: week.s1,
        rawDate: week.startDate,
      }))
      .sort((a, b) => parseDateForSort(a.rawDate) - parseDateForSort(b.rawDate));
  }, [data, viewMode]);

  const trendData = trendMode === 'weekly' ? weeklyRespData : dailyRespData;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-xl shadow-lg p-3 text-xs">
          <p className="font-bold text-text-primary mb-2 border-b border-border pb-1">{label}</p>
          <p className="text-text-secondary font-semibold mb-2">Total Respondents: <span className="text-text-primary">{d.Respondents}</span></p>
          <div className="flex gap-3 font-medium">
            <span className="text-green-500">5★ {d.s5}</span>
            <span className="text-green-400">4★ {d.s4}</span>
            <span className="text-yellow-500">3★ {d.s3}</span>
            <span className="text-orange-500">2★ {d.s2}</span>
            <span className="text-red-500">1★ {d.s1}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-4 shadow-sm">
      <div className="flex items-center justify-center mb-4">
        <h3 className="text-sm font-bold text-text-primary text-center">
          Respondent Volume Trend ({viewMode === 'full' ? 'Data penuh' : 'After Takeout'})
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Left: Weekly Cards */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center justify-center mb-4">
            <h4 className="text-xs font-bold text-text-secondary text-center">{comparisonMode === 'mom' ? '3-Month Respondents' : '4-Week Respondents'}</h4>
          </div>
          <div className={cn('grid gap-4', comparisonMode === 'mom' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2')}>
            {weeksData.map((w, idx) => {
              const prevW = idx > 0 ? weeksData[idx - 1] : null;
              // Absolute change in respondent count — a % here is meaningless when
              // one period is a partial week / near-empty.
              const diff = prevW ? w.respondents - prevW.respondents : 0;
              const isUp = diff > 0;
              const isDown = diff < 0;

              return (
                <div key={idx} className="bg-surface/30 rounded-xl p-4 pb-3 border border-border/50 flex flex-col justify-between items-center relative overflow-hidden group hover:border-primary/30 transition-colors">
                  <div className="absolute top-0 w-full h-1 bg-primary/20 group-hover:bg-primary transition-colors"></div>
                  <span className="text-sm text-text-secondary font-bold mb-1 mt-1">{w.name}</span>
                  <span className="text-3xl xl:text-4xl font-bold text-text-primary mb-1">{formatNum(w.respondents, 0)}</span>
                  
                  {idx > 0 ? (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-text-muted">
                      {isUp ? '▲' : isDown ? '▼' : '▬'} {Math.abs(diff)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-text-muted font-bold">&nbsp;</div>
                  )}
                  
                  <div className="mt-auto pt-2 border-t border-border/50 w-full text-center flex flex-col gap-1">
                    <span className="text-[11px] text-text-secondary">Rate: <strong className="text-text-primary">{w.rate}%</strong></span>
                    <div 
                      className="flex items-end justify-center gap-2 mt-2 h-16 w-full px-2"
                      title={`5★: ${w.s5} | 4★: ${w.s4} | 3★: ${w.s3} | 2★: ${w.s2} | 1★: ${w.s1}`}
                    >
                      {[
                        { label: '1★', value: w.s1, color: 'bg-danger' },
                        { label: '2★', value: w.s2, color: 'bg-warning/80' },
                        { label: '3★', value: w.s3, color: 'bg-warning' },
                        { label: '4★', value: w.s4, color: 'bg-success/70' },
                        { label: '5★', value: w.s5, color: 'bg-success' }
                      ].map(bar => {
                        const maxVal = Math.max(w.s1, w.s2, w.s3, w.s4, w.s5) || 1;
                        const heightPct = (bar.value / maxVal) * 100;
                        return (
                          <div key={bar.label} className="flex flex-col items-center gap-0.5 group/bar flex-1 max-w-[28px] h-full relative">
                            <span className="text-[9px] font-bold text-text-primary leading-none">{bar.value}</span>
                            <span className="text-[8px] font-bold text-text-muted leading-none mt-0.5">{bar.label}</span>
                            <div className="w-full bg-surface-muted/50 rounded flex-1 flex items-end overflow-hidden border border-border/30 mt-0.5">
                              <div className={`w-full rounded-sm ${bar.color} transition-all duration-700`} style={{ height: `${heightPct}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Weekly/Daily Area Chart */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h4 className="text-xs font-bold text-text-secondary">
              {trendMode === 'weekly' ? 'Weekly' : 'Daily'} Respondents ({comparisonMode === 'mom' ? 'Current Month' : 'Current Week'})
            </h4>
            <div className="inline-flex items-center rounded-lg border border-border bg-surface-muted p-0.5">
              {(['weekly', 'daily'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTrendMode(mode)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors',
                    trendMode === mode ? 'bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {mode === 'weekly' ? 'Weekly' : 'Daily'}
                </button>
              ))}
            </div>
          </div>
          <div className="h-full min-h-[380px] w-full border border-border/50 rounded-xl p-6 bg-surface/20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorResp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chart.kpiCsat} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={chart.kpiCsat} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                {trendMode === 'daily' && <CartesianGrid strokeDasharray="3 3" vertical={false} />}
                <XAxis dataKey="date" tick={{fontSize: 11}} axisLine={false} tickLine={false} minTickGap={10} />
                <YAxis tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{stroke: 'rgba(0,0,0,0.1)', strokeWidth: 2}} />
                <Area type="monotone" dataKey="Respondents" stroke={chart.kpiCsat} strokeWidth={3} fillOpacity={1} fill="url(#colorResp)">
                  <LabelList dataKey="Respondents" position="top" style={{fontSize: '11px', fontWeight: 'bold', fill: chart.kpiCsat}} />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};
export default CsatRoom;

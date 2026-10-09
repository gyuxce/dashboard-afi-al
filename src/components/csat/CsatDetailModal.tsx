import React from 'react';
import { CSATEntry } from '../../lib/dataProcessor';
import { parseDateForSort, cn } from '../../lib/utils';
import { AlertCircle, X, ChevronUp, ChevronDown, Star, Copy } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="ml-1 p-0.5 rounded text-text-muted hover:bg-surface-muted hover:text-primary transition-colors" title="Copy">
      {copied ? <span className="text-[9px] text-success font-bold">Copied</span> : <Copy className="w-3 h-3" />}
    </button>
  );
};

interface CsatDetailModalProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  surveys: CSATEntry[];
  agentType?: 'csat' | 'defects';
  modalType?: 'agent' | 'category';
  onClose: () => void;
  expandedDates: Set<string>;
  toggleExpandDate: (date: string) => void;
  viewMode: 'full' | 'fair';
}

type DetailFilter = {
  type: 'category' | 'agent';
  value: string;
  scoreScope: 'all' | 'bad';
};

export const CsatDetailModal: React.FC<CsatDetailModalProps> = ({
  title, subtitle, surveys, agentType, modalType = 'agent', onClose, expandedDates, toggleExpandDate, viewMode
}) => {
  const filteredSurveys = surveys.filter(h => (viewMode === 'full' || !h.isTakeout) && h.score > 0);
  const [selectedDetailFilter, setSelectedDetailFilter] = React.useState<DetailFilter | null>(null);

  const toggleDetailFilter = (nextFilter: DetailFilter) => {
    setSelectedDetailFilter(prev =>
      prev?.type === nextFilter.type &&
      prev.value === nextFilter.value &&
      prev.scoreScope === nextFilter.scoreScope
        ? null
        : nextFilter
    );
  };

  const tableSurveys = React.useMemo(() => {
    if (!selectedDetailFilter) return filteredSurveys;
    return filteredSurveys.filter(s => {
      if (selectedDetailFilter.scoreScope === 'bad' && s.score !== 1 && s.score !== 2) return false;
      if (selectedDetailFilter.type === 'category') return s.category === selectedDetailFilter.value;
      if (selectedDetailFilter.type === 'agent') return s.agentName === selectedDetailFilter.value || s.csId === selectedDetailFilter.value;
      return true;
    });
  }, [filteredSurveys, selectedDetailFilter]);

  const scoreCounts = React.useMemo(() => {
    const counts: Record<number, number> = {};
    return filteredSurveys.reduce((acc, survey) => {
      acc[survey.score] = (acc[survey.score] || 0) + 1;
      return acc;
    }, counts);
  }, [filteredSurveys]);

  const surveysByDate = React.useMemo(() => {
    const grouped = new Map<string, { surveys: CSATEntry[]; scoreCounts: Record<number, number> }>();
    tableSurveys.forEach((survey) => {
      const existing = grouped.get(survey.date) || { surveys: [], scoreCounts: {} };
      existing.surveys.push(survey);
      existing.scoreCounts[survey.score] = (existing.scoreCounts[survey.score] || 0) + 1;
      grouped.set(survey.date, existing);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => parseDateForSort(a[0]) - parseDateForSort(b[0]))
      .map(([date, value]) => ({ date, ...value }));
  }, [tableSurveys]);

  const topCategoriesAll = React.useMemo(() => {
    const agg: Record<string, { total: number, s5: number, s4: number, s3: number, s2: number, s1: number }> = {};
    filteredSurveys.forEach(h => {
      const cat = h.category || 'Uncategorized';
      if (!agg[cat]) agg[cat] = { total: 0, s5: 0, s4: 0, s3: 0, s2: 0, s1: 0 };
      agg[cat].total++;
      if (h.score === 5) agg[cat].s5++;
      if (h.score === 4) agg[cat].s4++;
      if (h.score === 3) agg[cat].s3++;
      if (h.score === 2) agg[cat].s2++;
      if (h.score === 1) agg[cat].s1++;
    });
    return Object.entries(agg)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([name, stats]) => ({ name, ...stats }));
  }, [filteredSurveys]);

  const topCategoriesBad = React.useMemo(() => {
    const agg: Record<string, { total: number, s5: number, s4: number, s3: number, s2: number, s1: number }> = {};
    filteredSurveys.forEach(h => {
      const cat = h.category || 'Uncategorized';
      if (!agg[cat]) agg[cat] = { total: 0, s5: 0, s4: 0, s3: 0, s2: 0, s1: 0 };
      agg[cat].total++;
      if (h.score === 5) agg[cat].s5++;
      if (h.score === 4) agg[cat].s4++;
      if (h.score === 3) agg[cat].s3++;
      if (h.score === 2) agg[cat].s2++;
      if (h.score === 1) agg[cat].s1++;
    });
    return Object.entries(agg)
      .filter(([_, stats]) => (stats.s1 + stats.s2) > 0)
      .sort((a, b) => (b[1].s1 + b[1].s2) - (a[1].s1 + a[1].s2))
      .slice(0, 5)
      .map(([name, stats]) => ({ name, ...stats }));
  }, [filteredSurveys]);

  const topAgentsAll = React.useMemo(() => {
    const agg: Record<string, { total: number, name: string, s5: number, s4: number, s3: number, s2: number, s1: number }> = {};
    filteredSurveys.forEach(h => {
      const csId = h.csId || 'Unknown';
      if (!agg[csId]) agg[csId] = { total: 0, name: h.agentName || csId, s5: 0, s4: 0, s3: 0, s2: 0, s1: 0 };
      agg[csId].total++;
      if (h.score === 5) agg[csId].s5++;
      if (h.score === 4) agg[csId].s4++;
      if (h.score === 3) agg[csId].s3++;
      if (h.score === 2) agg[csId].s2++;
      if (h.score === 1) agg[csId].s1++;
    });
    return Object.entries(agg)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([csId, stats]) => ({ csId, ...stats }));
  }, [filteredSurveys]);

  const topAgentsBad = React.useMemo(() => {
    const agg: Record<string, { total: number, name: string, s5: number, s4: number, s3: number, s2: number, s1: number }> = {};
    filteredSurveys.forEach(h => {
      const csId = h.csId || 'Unknown';
      if (!agg[csId]) agg[csId] = { total: 0, name: h.agentName || csId, s5: 0, s4: 0, s3: 0, s2: 0, s1: 0 };
      agg[csId].total++;
      if (h.score === 5) agg[csId].s5++;
      if (h.score === 4) agg[csId].s4++;
      if (h.score === 3) agg[csId].s3++;
      if (h.score === 2) agg[csId].s2++;
      if (h.score === 1) agg[csId].s1++;
    });
    return Object.entries(agg)
      .filter(([_, stats]) => (stats.s1 + stats.s2) > 0)
      .sort((a, b) => (b[1].s1 + b[1].s2) - (a[1].s1 + a[1].s2))
      .slice(0, 5)
      .map(([csId, stats]) => ({ csId, ...stats }));
  }, [filteredSurveys]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center overflow-y-auto p-2 sm:items-center sm:p-4">
      <div className="bg-card w-full max-w-[98vw] xl:max-w-7xl rounded-xl shadow-2xl flex flex-col max-h-[94vh] sm:max-h-[90vh] border border-border overflow-hidden">
        <div className="flex shrink-0 flex-col md:flex-row md:items-start justify-between p-3 sm:p-4 border-b border-border bg-surface-muted rounded-t-xl relative gap-4 pr-11 sm:pr-12 md:pr-5 overflow-x-hidden">
          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <h3 className="font-bold text-base sm:text-lg text-text-primary flex flex-wrap items-center gap-2">
                <AlertCircle className={`w-5 h-5 ${agentType === 'defects' ? 'text-danger' : 'text-primary'}`} />
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-text-muted mt-1 sm:ml-7">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="absolute top-3 right-3 md:relative md:top-auto md:right-auto p-2 text-text-muted hover:text-text-primary hover:bg-surface-muted rounded-full transition-colors self-start shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 bg-card space-y-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <div className="flex min-w-0 flex-col rounded-lg border border-border bg-surface/40 px-2 py-1.5">
              <span className="truncate text-[8px] font-medium tracking-wide text-text-muted">Total</span>
              <span className="text-sm font-semibold text-text-primary">{filteredSurveys.length}</span>
            </div>
            <div className="flex min-w-0 flex-col rounded-lg border border-success/20 bg-success/5 px-2 py-1.5">
              <span className="truncate text-[8px] font-medium tracking-wide text-success">Score 5</span>
              <span className="text-sm font-semibold text-success">{scoreCounts[5] || 0}</span>
            </div>
            <div className="flex min-w-0 flex-col rounded-lg border border-success/20 bg-success/5 px-2 py-1.5">
              <span className="truncate text-[8px] font-medium tracking-wide text-success/80">Score 4</span>
              <span className="text-sm font-semibold text-success/80">{scoreCounts[4] || 0}</span>
            </div>
            <div className="flex min-w-0 flex-col rounded-lg border border-warning/20 bg-warning/5 px-2 py-1.5">
              <span className="truncate text-[8px] font-medium tracking-wide text-warning">Score 3</span>
              <span className="text-sm font-semibold text-warning">{scoreCounts[3] || 0}</span>
            </div>
            <div className="flex min-w-0 flex-col rounded-lg border border-warning/30 bg-warning/5 px-2 py-1.5">
              <span className="truncate text-[8px] font-medium tracking-wide text-warning">Score 2</span>
              <span className="text-sm font-semibold text-warning">{scoreCounts[2] || 0}</span>
            </div>
            <div className="flex min-w-0 flex-col rounded-lg border border-danger/20 bg-danger/5 px-2 py-1.5">
              <span className="truncate text-[8px] font-medium tracking-wide text-danger">Score 1</span>
              <span className="text-sm font-semibold text-danger">{scoreCounts[1] || 0}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {/* Menu 1: All Scores */}
            {(modalType === 'category' ? topAgentsAll.length > 0 : topCategoriesAll.length > 0) && (
              <div className="min-w-0 rounded-lg border border-border bg-surface/30 p-3">
                <div className="mb-2 text-[10px] font-medium tracking-wide text-text-muted">
                  Top {modalType === 'category' ? topAgentsAll.length : topCategoriesAll.length} {modalType === 'category' ? 'Agents' : 'Categories'} (All Scores 1-5)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-1.5">
                  {(modalType === 'category' ? topAgentsAll : topCategoriesAll).map((item: any, idx) => {
                    const filterValue = item.name;
                    const filterType = modalType === 'category' ? 'agent' : 'category';
                    const isSelected =
                      selectedDetailFilter?.type === filterType &&
                      selectedDetailFilter.value === filterValue &&
                      selectedDetailFilter.scoreScope === 'all';
                    return (
                      <button
                        key={`${filterValue}-${idx}`}
                        onClick={() => toggleDetailFilter({ type: filterType, value: filterValue, scoreScope: 'all' })}
                        className={cn(
                          "flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors",
                          isSelected ? 'bg-primary/10 border border-primary/20' : 'border border-transparent hover:bg-surface-muted'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="w-4 shrink-0 font-bold text-text-muted">{idx + 1}.</span>
                          <span className="truncate font-semibold text-text-primary" title={filterValue}>{filterValue}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="font-bold text-text-secondary">{item.total}</span>
                          {[5, 4, 3, 2, 1].map((score) => {
                            const count = item[`s${score}`] || 0;
                            if (count === 0) return null;
                            return (
                              <span
                                key={score}
                                className={cn(
                                  "rounded px-1 py-0.5 text-[8px] font-bold text-white",
                                  score === 5 ? 'bg-success' : score === 4 ? 'bg-success/80' : score === 3 ? 'bg-warning' : score === 2 ? 'bg-orange-500' : 'bg-danger'
                                )}
                              >
                                {score}:{count}
                              </span>
                            );
                          })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Menu 2: Bad Scores */}
            {(modalType === 'category' ? topAgentsBad.length > 0 : topCategoriesBad.length > 0) && (
              <div className="min-w-0 rounded-lg border border-danger/30 bg-danger/5 p-3">
                <div className="mb-2 text-[10px] font-medium tracking-wide text-danger">
                  Top {modalType === 'category' ? topAgentsBad.length : topCategoriesBad.length} {modalType === 'category' ? 'Agents' : 'Categories'} (Score 1 & 2 Only)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-1.5">
                  {(modalType === 'category' ? topAgentsBad : topCategoriesBad).map((item: any, idx) => {
                    const filterValue = item.name;
                    const filterType = modalType === 'category' ? 'agent' : 'category';
                    const isSelected =
                      selectedDetailFilter?.type === filterType &&
                      selectedDetailFilter.value === filterValue &&
                      selectedDetailFilter.scoreScope === 'bad';
                    return (
                      <button
                        key={`${filterValue}-${idx}`}
                        onClick={() => toggleDetailFilter({ type: filterType, value: filterValue, scoreScope: 'bad' })}
                        className={cn(
                          "flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors",
                          isSelected ? 'bg-danger/10 border border-danger/20' : 'border border-transparent hover:bg-danger/10'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="w-4 shrink-0 font-bold text-text-muted">{idx + 1}.</span>
                          <span className="truncate font-semibold text-text-primary" title={filterValue}>{filterValue}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="font-bold text-text-secondary">{(item.s1 || 0) + (item.s2 || 0)}</span>
                          {item.s2 > 0 && <span className="rounded bg-orange-500 px-1 py-0.5 text-[8px] font-bold text-white">2:{item.s2}</span>}
                          {item.s1 > 0 && <span className="rounded bg-danger px-1 py-0.5 text-[8px] font-bold text-white">1:{item.s1}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {selectedDetailFilter && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm mb-4">
              <span className="font-medium text-text-primary">
                Menampilkan hasil khusus untuk {selectedDetailFilter.type === 'agent' ? 'Agent' : 'Kategori'}: <span className="font-bold text-primary">{selectedDetailFilter.value}</span>
                {selectedDetailFilter.scoreScope === 'bad' && <span className="ml-2 rounded bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">Score 1 & 2 saja</span>}
              </span>
              <button 
                onClick={() => setSelectedDetailFilter(null)}
                className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-md text-xs font-bold text-text-primary hover:bg-surface-muted transition-colors border border-border shadow-sm"
              >
                <X className="w-3.5 h-3.5" /> Clear Filter
              </button>
            </div>
          )}
          
          {surveysByDate.map(({ date, surveys: dateSurveys, scoreCounts: dateScoreCounts }) => {
            const isExpanded = expandedDates.has(date);
            
            return (
              <div key={date} className="border border-border rounded-lg overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleExpandDate(date)}
                  className="w-full flex items-center justify-between p-4 bg-surface hover:bg-surface-muted transition-colors text-left"
                >
                  <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <span className="font-bold text-text-primary text-sm md:text-base">{date}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                      {dateSurveys.length} survey{dateSurveys.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">
                      {[5, 4, 3, 2, 1].map(score => {
                        const count = dateScoreCounts[score] || 0;
                        if (count === 0) return null;
                        return (
                          <span key={score} className={cn("px-1.5 py-0.5 rounded text-[10px] md:text-[9px] font-bold text-white flex items-center gap-0.5", score === 5 ? 'bg-success' : score === 4 ? 'bg-success/80' : score === 3 ? 'bg-warning' : score === 2 ? 'bg-orange-500' : 'bg-danger')}>
                            <Star className="w-2.5 h-2.5 fill-current" /> {score} <span className="ml-0.5">({count})</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted shrink-0 ml-2" /> : <ChevronDown className="w-4 h-4 text-text-muted shrink-0 ml-2" />}
                </button>
                
                {isExpanded && (
                  <div className="border-t border-border overflow-x-auto bg-card">
                    <table className="w-full text-left text-[11px] whitespace-nowrap">
                      <thead className="bg-surface-muted text-text-secondary border-b border-border">
                        <tr>
                          <th className="p-3 font-bold">Score</th>
                          <th className="p-3 font-bold min-w-[180px] max-w-[300px]">Category Case</th>
                          <th className="p-3 font-bold">Ticket & Chat ID</th>
                          <th className="p-3 font-bold">UID</th>
                          <th className="p-3 font-bold min-w-[180px]">Agent / CS ID</th>
                          <th className="p-3 font-bold min-w-[250px] max-w-[350px]">Response / Komentar</th>
                          <th className="p-3 font-bold min-w-[150px]">Analisa TL (RCA)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dateSurveys.map((s, i) => (
                          <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-muted transition-colors">
                            <td className="p-3 align-top">
                              <span className={cn("px-2 py-1 rounded text-white font-bold inline-flex items-center gap-1", s.score === 5 ? 'bg-success' : s.score === 4 ? 'bg-success/80' : s.score === 3 ? 'bg-warning' : s.score === 2 ? 'bg-orange-500' : 'bg-danger')}>
                                {s.score} <Star className="w-3 h-3 fill-current" />
                              </span>
                            </td>
                            <td className="p-3 align-top font-medium text-text-primary min-w-[180px] max-w-[300px] whitespace-normal leading-relaxed">
                              {s.category}
                              {s.isTakeout && <div className="mt-1"><span className="text-[9px] bg-card border border-border px-1.5 py-0.5 rounded text-text-muted">Takeout</span></div>}
                            </td>
                            <td className="p-3 align-top">
                              <div className="flex flex-col gap-1">
                                <span className="text-text-primary font-medium tracking-tight flex items-center">
                                  T: <span className="font-mono ml-1">{s.ticketId || '-'}</span>
                                  {s.ticketId && <CopyButton text={s.ticketId} />}
                                </span>
                                <span className="text-text-muted flex items-center">
                                  C: <span className="font-mono ml-1">{s.chatId || '-'}</span>
                                  {s.chatId && <CopyButton text={s.chatId} />}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 align-top font-mono text-text-muted">
                              <div className="flex items-center">
                                {s.uid || '-'}
                                {s.uid && <CopyButton text={s.uid} />}
                              </div>
                            </td>
                            <td className="p-3 align-top font-medium text-text-primary min-w-[180px] whitespace-normal">
                              {s.agentName || s.csId}
                              <div className="text-[10px] text-text-muted font-normal mt-0.5">{s.csId}</div>
                            </td>
                            <td className="p-3 align-top whitespace-normal min-w-[200px] max-w-[300px] text-text-secondary leading-relaxed">
                              {s.response || '-'}
                            </td>
                            <td className="p-3 align-top whitespace-normal min-w-[150px] max-w-[250px] text-text-secondary leading-relaxed text-[10px]">
                              {s.rcaAgent && <div className="mb-1"><span className="font-semibold text-danger">Agent:</span> {s.rcaAgent}</div>}
                              {s.rcaCustomer && <div className="mb-1"><span className="font-semibold text-primary">Customer:</span> {s.rcaCustomer}</div>}
                              {s.rcaAkulaku && <div><span className="font-semibold text-warning">Process:</span> {s.rcaAkulaku}</div>}
                              {(!s.rcaAgent && !s.rcaCustomer && !s.rcaAkulaku) && '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {tableSurveys.length === 0 && (
             <EmptyState
               title="Tidak ada data detail"
               description="Coba ubah filter kategori/agent di modal ini."
               variant="filter"
               className="mt-4"
             />
          )}
        </div>
      </div>
    </div>
  );
};

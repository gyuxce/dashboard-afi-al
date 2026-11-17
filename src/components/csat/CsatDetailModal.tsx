import React from 'react';
import { CSATEntry, normalizeDateStr } from '../../lib/dataProcessor';
import { formatDateFull } from '../../lib/dayCalendar';
import { parseDateForSort, cn } from '../../lib/utils';
import { AlertCircle, X, ChevronUp, ChevronDown, Star, Copy, Check } from 'lucide-react';
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
      {copied ? <span className="text-[11px] text-success font-bold">Copied</span> : <Copy className="w-3 h-3" />}
    </button>
  );
};

/** Soft status pill per score: green = good (4-5), neutral = 3, amber = 2, red = 1. */
const scorePill = (score: number) =>
  score >= 4 ? 'bg-success-soft text-success-text' : score === 3 ? 'bg-surface-muted text-text-secondary' : score === 2 ? 'bg-warning-soft text-warning-text' : 'bg-danger-soft text-danger-text';

const dayLabel = (d: string) => formatDateFull(normalizeDateStr(d) || d);

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

  // Unique ticket IDs of what is listed, for pasting into an appeal (banding) in one go.
  const ticketList = React.useMemo(
    () => Array.from(new Set(tableSurveys.map((s) => (s.ticketId || '').trim()).filter(Boolean))),
    [tableSurveys],
  );
  const ticketCount = ticketList.length;
  const [ticketsCopied, setTicketsCopied] = React.useState(false);
  const copyTickets = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ticketList.join('\n'));
    setTicketsCopied(true);
    setTimeout(() => setTicketsCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-text-primary/50 backdrop-blur-sm z-[100] flex items-start justify-center overflow-y-auto p-2 sm:items-center sm:p-4">
      <div className="bg-card w-full max-w-[98vw] xl:max-w-7xl rounded-[24px] shadow-2xl flex flex-col max-h-[94vh] sm:max-h-[90vh] border border-border overflow-hidden">
        <div className="flex shrink-0 flex-col md:flex-row md:items-start justify-between p-4 sm:p-5 border-b border-border bg-card relative gap-4 pr-11 sm:pr-12 md:pr-5 overflow-x-hidden">
          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <h3 className="font-bold text-lg sm:text-xl text-text-primary flex flex-wrap items-center gap-2">
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
        
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 bg-surface/40 space-y-4">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Total</div>
              <div className="ui-stat-value text-3xl leading-none text-text-primary">{filteredSurveys.length}</div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[5, 4, 3, 2, 1].map((score) => (
                <div key={score} className="flex flex-col">
                  <span className="inline-flex items-center gap-1 text-[11px] text-text-muted"><Star className="h-3 w-3 fill-current" />{score}</span>
                  <span className={cn('text-lg font-semibold leading-tight tabular-nums', (scoreCounts[score] || 0) > 0 && score === 1 ? 'text-danger-text' : (scoreCounts[score] || 0) > 0 && score === 2 ? 'text-warning-text' : 'text-text-primary')}>{scoreCounts[score] || 0}</span>
                </div>
              ))}
            </div>
            {ticketCount > 0 && (
              <button
                type="button"
                onClick={copyTickets}
                className="ml-auto inline-flex items-center gap-1.5 self-center rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-primary hover:text-primary"
                title="Salin semua nomor tiket yang tampil, satu per baris"
              >
                {ticketsCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {ticketsCopied ? 'Tersalin' : `Salin ${ticketCount} tiket`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {/* Menu 1: All Scores */}
            {(modalType === 'category' ? topAgentsAll.length > 0 : topCategoriesAll.length > 0) && (
              <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
                  <span className="h-2 w-2 rounded-full bg-border-strong" aria-hidden />
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
                          isSelected ? 'bg-primary-soft border border-primary/20' : 'border border-transparent hover:bg-surface-muted'
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
                                className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-semibold", scorePill(score))}
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
              <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
                  <span className="h-2 w-2 rounded-full bg-danger" aria-hidden />
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
                          isSelected ? 'bg-danger-soft border border-danger/20' : 'border border-transparent hover:bg-surface-muted'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="w-4 shrink-0 font-bold text-text-muted">{idx + 1}.</span>
                          <span className="truncate font-semibold text-text-primary" title={filterValue}>{filterValue}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="font-bold text-text-secondary">{(item.s1 || 0) + (item.s2 || 0)}</span>
                          {item.s2 > 0 && <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-semibold", scorePill(2))}>2:{item.s2}</span>}
                          {item.s1 > 0 && <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-semibold", scorePill(1))}>1:{item.s1}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {selectedDetailFilter && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-primary-soft border border-primary/20 rounded-2xl text-sm mb-4">
              <span className="font-medium text-text-primary">
                Menampilkan hasil khusus untuk {selectedDetailFilter.type === 'agent' ? 'Agent' : 'Kategori'}: <span className="font-bold text-primary">{selectedDetailFilter.value}</span>
                {selectedDetailFilter.scoreScope === 'bad' && <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger-text">Score 1 & 2 saja</span>}
              </span>
              <button 
                onClick={() => setSelectedDetailFilter(null)}
                className="flex items-center gap-1.5 px-3 py-1 bg-card rounded-md text-xs font-bold text-text-primary hover:bg-surface-muted transition-colors border border-border shadow-sm"
              >
                <X className="w-3.5 h-3.5" /> Clear Filter
              </button>
            </div>
          )}
          
          {surveysByDate.map(({ date, surveys: dateSurveys, scoreCounts: dateScoreCounts }) => {
            const isExpanded = expandedDates.has(date) || surveysByDate.length === 1;
            
            return (
              <div key={date} className="border border-border rounded-2xl overflow-hidden bg-card">
                <button
                  onClick={() => toggleExpandDate(date)}
                  className="w-full flex items-center justify-between p-4 bg-card hover:bg-surface-muted/60 transition-colors text-left"
                >
                  <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <span className="font-bold text-text-primary text-sm md:text-base">{dayLabel(date)}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-muted text-text-secondary whitespace-nowrap">
                      {dateSurveys.length} survey{dateSurveys.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">
                      {[5, 4, 3, 2, 1].map(score => {
                        const count = dateScoreCounts[score] || 0;
                        if (count === 0) return null;
                        return (
                          <span key={score} className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-0.5", scorePill(score))}>
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
                              <span className={cn("px-2 py-1 rounded-full font-semibold inline-flex items-center gap-1", scorePill(s.score))}>
                                {s.score} <Star className="w-3 h-3 fill-current" />
                              </span>
                            </td>
                            <td className="p-3 align-top font-medium text-text-primary min-w-[180px] max-w-[300px] whitespace-normal leading-relaxed">
                              {s.category}
                              {s.isTakeout && <div className="mt-1"><span className="text-[11px] bg-card border border-border px-1.5 py-0.5 rounded text-text-muted">Takeout</span></div>}
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
                              <div className="text-[11px] text-text-muted font-normal mt-0.5">{s.csId}</div>
                            </td>
                            <td className="p-3 align-top whitespace-normal min-w-[200px] max-w-[300px] text-text-secondary leading-relaxed">
                              {s.response || '-'}
                            </td>
                            <td className="p-3 align-top whitespace-normal min-w-[150px] max-w-[250px] text-text-secondary leading-relaxed text-[11px]">
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

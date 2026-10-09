import React, { useMemo, useState } from 'react';
import { AgentKPI } from '../../lib/dataProcessor';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';
import {
  Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from 'recharts';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { MobileScrollHint } from '../ui/ChartScrollArea';
import { chart } from '../../lib/themeColors';

// RCA areas are categories, not good/bad KPIs — a monochrome ramp keeps the
// screen calm (no red "blame" hue) while still separating the three columns.
const COLORS = {
  agent: chart.secondary,
  customer: chart.muted,
  akulaku: chart.disabled,
};

type IssueCategoryRow = {
  issue: string;
  count: number;
  categories: { name: string; count: number }[];
};

export const CsatRcaMonitor: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const { selectedBpo, selectedTL } = useStore(useShallow((s) => ({
    selectedBpo: s.selectedBpo,
    selectedTL: s.selectedTL,
  })));
  const [agentSearch, setAgentSearch] = useState('');
  const [showIssueDetail, setShowIssueDetail] = useState(false);

  const hasRcaData = useMemo(() => {
    return data.some(a =>
      Object.keys(a.rcaAgentAreaCounts).length > 0 ||
      Object.keys(a.rcaCustomerAreaCounts).length > 0 ||
      Object.keys(a.rcaAkulakuProcessCounts).length > 0
    );
  }, [data]);

  const {
    agentDetailBar,
    customerDetailBar,
    akulakuDetailBar,
    agentIssueCategories,
    customerIssueCategories,
    akulakuIssueCategories,
    agentRanking,
    totalAgent,
    totalCustomer,
    totalAkulaku,
  } = useMemo(() => {
    const agentTotal: Record<string, number> = {};
    const customerTotal: Record<string, number> = {};
    const akulakuTotal: Record<string, number> = {};
    const agentCategoryMap: Record<string, Record<string, number>> = {};
    const customerCategoryMap: Record<string, Record<string, number>> = {};
    const akulakuCategoryMap: Record<string, Record<string, number>> = {};
    const agentCaseSummary: Record<string, { agentCases: number; customerCases: number; akulakuCases: number; name: string; tl: string }> = {};

    const addIssueCategory = (
      target: Record<string, Record<string, number>>,
      issue: string | undefined,
      category: string | undefined,
    ) => {
      const cleanIssue = String(issue || '').trim();
      if (!cleanIssue) return;
      const cleanCategory = String(category || 'Unknown Case').trim() || 'Unknown Case';
      if (!target[cleanIssue]) target[cleanIssue] = {};
      target[cleanIssue][cleanCategory] = (target[cleanIssue][cleanCategory] || 0) + 1;
    };

    data.forEach(a => {
      const name = a.name || a.csId;
      if (!agentCaseSummary[a.csId]) {
        agentCaseSummary[a.csId] = { agentCases: 0, customerCases: 0, akulakuCases: 0, name, tl: a.teamLeader };
      }
      Object.entries(a.rcaAgentAreaCounts as Record<string, number>).forEach(([k, v]) => {
        agentTotal[k] = (agentTotal[k] || 0) + v;
        agentCaseSummary[a.csId].agentCases += v;
      });
      Object.entries(a.rcaCustomerAreaCounts as Record<string, number>).forEach(([k, v]) => {
        customerTotal[k] = (customerTotal[k] || 0) + v;
        agentCaseSummary[a.csId].customerCases += v;
      });
      Object.entries(a.rcaAkulakuProcessCounts as Record<string, number>).forEach(([k, v]) => {
        akulakuTotal[k] = (akulakuTotal[k] || 0) + v;
        agentCaseSummary[a.csId].akulakuCases += v;
      });

      a.csatHistory?.forEach(entry => {
        addIssueCategory(agentCategoryMap, entry.rcaAgent, entry.category);
        addIssueCategory(customerCategoryMap, entry.rcaCustomer, entry.category);
        addIssueCategory(akulakuCategoryMap, entry.rcaAkulaku, entry.category);
      });
    });

    const tA = Object.values(agentTotal).reduce((a, b) => a + b, 0);
    const tC = Object.values(customerTotal).reduce((a, b) => a + b, 0);
    const tAk = Object.values(akulakuTotal).reduce((a, b) => a + b, 0);

    const toBar = (rec: Record<string, number>, color: string) =>
      Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([name, count]) => ({ name, count, fill: color }));

    const toIssueCategoryRows = (
      issueTotals: Record<string, number>,
      categoryMap: Record<string, Record<string, number>>,
    ): IssueCategoryRow[] =>
      Object.entries(issueTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([issue, count]) => ({
          issue,
          count,
          categories: Object.entries(categoryMap[issue] || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, categoryCount]) => ({ name, count: categoryCount })),
        }));

    const agentRanking = Object.values(agentCaseSummary)
      .map(a => ({ ...a, total: a.agentCases + a.customerCases + a.akulakuCases }))
      .filter(a => a.total > 0)
      .sort((a, b) => b.total - a.total);

    return {
      agentDetailBar: toBar(agentTotal, COLORS.agent),
      customerDetailBar: toBar(customerTotal, COLORS.customer),
      akulakuDetailBar: toBar(akulakuTotal, COLORS.akulaku),
      agentIssueCategories: toIssueCategoryRows(agentTotal, agentCategoryMap),
      customerIssueCategories: toIssueCategoryRows(customerTotal, customerCategoryMap),
      akulakuIssueCategories: toIssueCategoryRows(akulakuTotal, akulakuCategoryMap),
      agentRanking,
      totalAgent: tA,
      totalCustomer: tC,
      totalAkulaku: tAk,
    };
  }, [data]);

  const filteredAgentRanking = useMemo(() => {
    if (!agentSearch.trim()) return agentRanking;
    const q = agentSearch.toLowerCase();
    return agentRanking.filter(a => a.name.toLowerCase().includes(q) || a.tl.toLowerCase().includes(q));
  }, [agentRanking, agentSearch]);

  const activeFilterText = [
    selectedBpo && selectedBpo !== 'All BPO' ? `BPO: ${selectedBpo}` : '',
    selectedTL && selectedTL !== 'All TL' ? `TL: ${selectedTL}` : '',
  ].filter(Boolean).join(' | ');

  const grandTotal = totalAgent + totalCustomer + totalAkulaku;

  const areas = [
    { key: 'agent', label: 'Agent Area', count: totalAgent, issues: agentDetailBar },
    { key: 'customer', label: 'Customer Area', count: totalCustomer, issues: customerDetailBar },
    { key: 'akulaku', label: 'Akulaku Process', count: totalAkulaku, issues: akulakuDetailBar },
  ];

  /** One area rolled up into a scannable card: share + top issues. */
  const AreaCard: React.FC<{
    label: string;
    count: number;
    issues: { name: string; count: number }[];
  }> = ({ label, count, issues }) => {
    const share = grandTotal > 0 ? (count / grandTotal) * 100 : 0;
    const topIssues = issues.slice(0, 4);
    const maxIssue = topIssues[0]?.count || 1;
    return (
      <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
          <span className="text-[11px] tabular-nums text-text-muted">{share.toFixed(1)}%</span>
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-text-primary">{count}</div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-border-strong" style={{ width: `${share}%` }} />
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-text-muted">Top isu</div>
          {topIssues.length === 0 ? (
            <p className="text-[11px] text-text-muted">Belum ada kasus.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topIssues.map((issue) => (
                <li key={issue.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] text-text-secondary" title={issue.name}>{issue.name}</span>
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-text-primary">{issue.count}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-text-muted" style={{ width: `${(issue.count / maxIssue) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  const DetailBarChart = ({
    data: barData,
    color,
    title,
    issueCategories,
  }: {
    data: { name: string; count: number }[];
    color: string;
    title: string;
    issueCategories: IssueCategoryRow[];
  }) => {
    const dynamicHeight = Math.max(100, barData.length * 36);
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col">
        <h4 className="text-[11px] font-bold text-text-secondary mb-4 tracking-wide">{title}</h4>
        {barData.length === 0 ? (
          <EmptyState
            title="Belum ada data RCA"
            description="Tidak ada kasus RCA pada kategori ini untuk filter saat ini."
            variant="data"
            className="border-0 bg-transparent py-6"
          />
        ) : (
          <ResponsiveContainer width="100%" height={dynamicHeight}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }}
                formatter={(value: any) => [value, 'Kasus']}
              />
              <Bar dataKey="count" fill={color} radius={[0, 6, 6, 0]} maxBarSize={20}>
                <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: 'var(--color-text-primary)', fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        {issueCategories.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="text-[10px] font-medium text-text-muted tracking-wide mb-2">
              Kategori per isu
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <table className="kpi-data-table w-full table-fixed text-left">
                <thead className="bg-surface-muted text-text-muted">
                  <tr>
                    <th className="w-[38%] px-2.5 py-2 font-medium tracking-wide">Isu</th>
                    <th className="px-2.5 py-2 font-medium tracking-wide">Top kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {issueCategories.map(row => (
                    <tr key={row.issue} className="border-t border-border align-top">
                      <td className="px-2.5 py-2">
                        <div className="break-words font-bold leading-relaxed text-text-primary" title={row.issue}>
                          {row.issue}
                        </div>
                      </td>
                      <td className="px-2.5 py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.categories.length > 0 ? row.categories.map(category => (
                            <span
                              key={`${row.issue}-${category.name}`}
                              className="min-w-0 break-words rounded border border-border bg-surface px-1.5 py-0.5 font-semibold leading-relaxed text-text-secondary"
                              title={`${category.name}: ${category.count} kasus`}
                            >
                              {category.name} - {category.count}
                            </span>
                          )) : (
                            <span className="font-semibold text-text-muted">Category belum terisi</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-text-primary">Analisa akar masalah CSAT</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Berdasarkan kasus after-takeout | {activeFilterText || 'Semua data'}
        </p>
      </div>

      {/* Warning if no RCA data */}
      {!hasRcaData && (
        <div className="flex items-start gap-3 bg-warning/10 border border-warning/30 rounded-xl p-4">
          <AlertCircle className="text-warning mt-0.5 shrink-0" size={16} />
          <div>
            <p className="text-sm font-semibold text-text-primary">Kolom RCA Belum Terdeteksi</p>
            <p className="text-xs text-text-muted mt-1">
              Pastikan Google Sheet <strong>CSAT SC</strong> sudah memiliki kolom header persis:
              <code className="ml-1 bg-surface px-1 rounded text-[10px]">RCA Agent Area</code>,
              <code className="ml-1 bg-surface px-1 rounded text-[10px]">RCA Customer Area</code>,
              <code className="ml-1 bg-surface px-1 rounded text-[10px]">RCA Akulaku Process</code>. Setelah itu, refresh data.
            </p>
          </div>
        </div>
      )}

      {/* Breakdown cards — one per RCA area */}
      {grandTotal > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {areas.map((area) => (
              <AreaCard key={area.key} label={area.label} count={area.count} issues={area.issues} />
            ))}
          </div>
          <p className="text-center text-[10px] text-text-muted">
            Total kasus dianalisa: <strong className="text-text-primary">{grandTotal}</strong>
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <EmptyState
            title="Belum ada data RCA"
            description="Pastikan data CSAT SC memiliki kolom RCA dan kasus bad CSAT."
            variant="data"
            className="w-full border-0 bg-transparent py-6"
            showDataActions
          />
        </div>
      )}

      {/* Detail isu per area — collapsed by default */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowIssueDetail((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-expanded={showIssueDetail}
        >
          <div>
            <h3 className="text-sm font-bold text-text-primary">Detail isu per area</h3>
            <p className="text-[10px] text-text-muted mt-0.5">Top isu + kategori per area</p>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted">
            {showIssueDetail ? 'Sembunyikan' : 'Tampilkan'}
            {showIssueDetail ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
          </span>
        </button>
        {showIssueDetail ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border p-4">
            <DetailBarChart data={agentDetailBar} color={COLORS.agent} title="Top isu — Agent Area" issueCategories={agentIssueCategories} />
            <DetailBarChart data={customerDetailBar} color={COLORS.customer} title="Top isu — Customer Area" issueCategories={customerIssueCategories} />
            <DetailBarChart data={akulakuDetailBar} color={COLORS.akulaku} title="Top isu — Akulaku Process" issueCategories={akulakuIssueCategories} />
          </div>
        ) : null}
      </div>

      {/* Agent RCA ranking */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Profil RCA per agent</h3>
            <p className="text-[10px] text-text-muted mt-0.5">Ranking berdasarkan total kasus</p>
          </div>
          <input
            type="text"
            placeholder="Cari nama / TL..."
              aria-label="Cari nama / TL..."
            value={agentSearch}
            onChange={e => setAgentSearch(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary w-48 transition-colors"
          />
        </div>
        {filteredAgentRanking.length === 0 ? (
          <EmptyState
            title="Belum ada data RCA agent"
            description="Coba ubah pencarian agent/TL atau filter global."
            variant="filter"
            className="border-0 bg-transparent py-6"
            showDataActions
          />
        ) : (
          <>
          <MobileScrollHint label="Geser → untuk lihat semua kolom" />
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="kpi-data-table w-full text-left text-[11px]">
              <thead className="bg-surface/80 text-text-secondary border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 font-bold w-8 text-center">#</th>
                  <th className="px-3 py-2.5 font-bold">Nama agent</th>
                  <th className="px-3 py-2.5 font-bold">TL</th>
                  <th className="px-3 py-2.5 font-bold text-right">Agent Area</th>
                  <th className="px-3 py-2.5 font-bold text-right">Customer Area</th>
                  <th className="px-3 py-2.5 font-bold text-right">Akulaku Process</th>
                  <th className="px-3 py-2.5 font-bold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgentRanking.map((a, i) => {
                  const cell = (n: number) => (
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {n > 0 ? <span className="font-semibold text-text-primary">{n}</span> : <span className="text-text-disabled">–</span>}
                    </td>
                  );
                  return (
                    <tr key={a.name} className="border-b border-border/60 hover:bg-surface/60 transition-colors">
                      <td className="px-3 py-2.5 text-center text-text-muted font-semibold tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2.5 font-semibold text-text-primary max-w-[160px] truncate" title={a.name}>{a.name}</td>
                      <td className="px-3 py-2.5 text-text-muted max-w-[130px] truncate" title={a.tl}>{a.tl || '-'}</td>
                      {cell(a.agentCases)}
                      {cell(a.customerCases)}
                      {cell(a.akulakuCases)}
                      <td className="px-3 py-2.5 text-right">
                        <span className="font-bold text-text-primary text-[13px] tabular-nums">{a.total}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
};

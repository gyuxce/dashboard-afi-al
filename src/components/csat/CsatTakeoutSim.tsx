import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import type { AgentKPI } from '../../lib/dataProcessor';
import {
  NEGATIVE_USER_MIN,
  TAKEOUT_CANDIDATES,
  candidateImpacts,
  collectRatings,
  negativeUsers,
  simulateTakeout,
  type CandidateKey,
  type NegativeUserRule,
} from '../../lib/csatTakeoutSim';
import { formatDateFull } from '../../lib/dayCalendar';
import { formatNum, getKpiStatus, KPI_TARGETS } from '../../lib/utils';
import { useStore } from '../../store';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { SegmentedControl } from '../ui/SegmentedControl';
import { StatCard, type StatTone } from '../ui/StatCard';
import { ProgressBarMarker } from './ProgressBarMarker';

const RULE_OPTIONS: { value: NegativeUserRule; label: string }[] = [
  { value: 'off', label: 'Tidak dipakai' },
  { value: 'gte3', label: '3x atau lebih' },
  { value: 'gt3', label: 'Lebih dari 3x' },
];

const pct = (v: number) => `${formatNum(v, 2)}%`;
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${formatNum(Math.abs(v), 2)}`;

/** What-if view for CSAT SC takeout: nothing here changes the official Fair number used in the other tabs. */
export const CsatTakeoutSim: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const startDate = useStore((s) => s.startDate);
  const endDate = useStore((s) => s.endDate);
  const [picked, setPicked] = useState<CandidateKey[]>([]);
  const [rule, setRule] = useState<NegativeUserRule>('off');

  const ratings = useMemo(() => collectRatings(data), [data]);
  const impacts = useMemo(() => candidateImpacts(ratings), [ratings]);
  const result = useMemo(() => simulateTakeout(ratings, { categories: picked, negativeUsers: rule }), [ratings, picked, rule]);
  const listMin = rule === 'off' ? NEGATIVE_USER_MIN.gte3 : NEGATIVE_USER_MIN[rule];
  const userRows = useMemo(() => negativeUsers(ratings, listMin), [ratings, listMin]);
  const userDsat = userRows.reduce((n, u) => n + u.dsat, 0);

  const target = KPI_TARGETS.csatFair;
  const toggle = (key: CandidateKey) => setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const delta = result.simulated.csat - result.fair.csat;
  const simStatus = getKpiStatus(result.simulated.csat, 'csatFair');
  const simTone: StatTone = simStatus === 'miss' ? 'bad' : simStatus === 'watch' ? 'warn' : 'ink';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="CSAT"
        title="Simulasi Takeout"
        subtitle={`Hanya simulasi: angka resmi After Takeout di semua tab tetap 3 kategori. Periode ${startDate ? formatDateFull(startDate) : '-'} s/d ${endDate ? formatDateFull(endDate) : '-'}.`}
      />

      <Card className="flex flex-col gap-5">
        <div>
          <div className="ui-card-label">Kategori tambahan</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {TAKEOUT_CANDIDATES.map((c) => {
              const on = picked.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(c.key)}
                  className={`no-press rounded-full border px-4 py-2 text-[14px] font-medium transition-colors ${on ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card text-text-secondary hover:bg-surface-muted'}`}
                >
                  {c.label}
                  <span className="ml-2 text-[12px] font-normal text-text-muted">{c.note}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="ui-card-label">User negatif: DSAT berulang dari pelanggan yang sama dalam periode ini</div>
          <div className="mt-3">
            <SegmentedControl value={rule} onChange={setRule} options={RULE_OPTIONS} aria-label="Aturan user negatif" />
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[13px] text-text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Semua rating pelanggan itu (baik DSAT maupun puas) dikeluarkan. DSAT dihitung dari seluruh rating valid, termasuk kategori takeout resmi.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
        <StatCard label="CSAT SC Full" value={pct(result.full.csat)} sub={`${formatNum(result.full.valid, 0)} rating valid`} />
        <StatCard
          label="After Takeout resmi"
          value={pct(result.fair.csat)}
          sub={`3 kategori · ${formatNum(result.fair.valid, 0)} rating · target ${target}%`}
        />
        <StatCard
          label="After Takeout simulasi"
          value={pct(result.simulated.csat)}
          tone={simTone}
          sub={
            <>
              <span className="tabular-nums">{signed(delta)} poin</span> · {formatNum(result.removedRatings, 0)} rating keluar ({formatNum(result.removedDsat, 0)} DSAT)
            </>
          }
          footer={<ProgressBarMarker value={result.simulated.csat} target={target} />}
        />
      </div>

      <Card className="p-0! overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-[15px] font-semibold text-text-primary">Dampak tiap kategori (sendiri-sendiri)</h2>
          <p className="mt-0.5 text-[13px] text-text-muted">Dihitung di atas After Takeout resmi, masing-masing tanpa yang lain.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="kpi-data-table w-full text-left text-sm">
            <thead className="bg-surface text-text-secondary">
              <tr>
                <th className="p-3 font-semibold">Kategori</th>
                <th className="p-3 text-right font-semibold">Rating valid</th>
                <th className="p-3 text-right font-semibold">DSAT</th>
                <th className="p-3 text-right font-semibold">CSAT kategori</th>
                <th className="p-3 text-right font-semibold">After Takeout jika keluar</th>
                <th className="p-3 text-right font-semibold">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {impacts.map((i) => (
                <tr key={i.key} className="border-t border-border">
                  <td className="p-3 font-medium text-text-primary">{i.label}</td>
                  <td className="p-3 text-right tabular-nums">{formatNum(i.valid, 0)}</td>
                  <td className="p-3 text-right tabular-nums">{formatNum(i.dsat, 0)}</td>
                  <td className="p-3 text-right tabular-nums">{i.valid > 0 ? pct(i.csat) : '-'}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{pct(i.fairIfRemoved)}</td>
                  <td className="p-3 text-right tabular-nums text-text-secondary">{signed(i.fairIfRemoved - result.fair.csat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0! overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Daftar user negatif ({rule === 'gt3' ? 'lebih dari 3x' : '3x atau lebih'})
          </h2>
          <p className="mt-0.5 text-[13px] text-text-muted">
            {formatNum(userRows.length, 0)} pelanggan · {formatNum(userDsat, 0)} DSAT
            {result.full.dsat > 0 && ` dari ${formatNum(result.full.dsat, 0)} DSAT di periode ini`}. UID adalah ID pelanggan: jangan dibagikan di luar tim.
          </p>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="kpi-data-table w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface text-text-secondary">
              <tr>
                <th className="p-3 font-semibold">UID pelanggan</th>
                <th className="p-3 text-right font-semibold">DSAT</th>
                <th className="p-3 text-right font-semibold">Rating valid</th>
                <th className="p-3 text-right font-semibold">Agent berbeda</th>
                <th className="p-3 font-semibold">Kategori DSAT terbanyak</th>
              </tr>
            </thead>
            <tbody>
              {userRows.slice(0, 100).map((u) => (
                <tr key={u.uid} className="border-t border-border">
                  <td className="p-3 font-mono text-[13px] text-text-primary">{u.uid}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{u.dsat}</td>
                  <td className="p-3 text-right tabular-nums">{u.ratings}</td>
                  <td className="p-3 text-right tabular-nums">{u.agents}</td>
                  <td className="p-3 capitalize text-text-secondary">{u.topCategory || '-'}</td>
                </tr>
              ))}
              {userRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-text-muted">Tidak ada pelanggan yang memenuhi aturan ini di periode terpilih.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

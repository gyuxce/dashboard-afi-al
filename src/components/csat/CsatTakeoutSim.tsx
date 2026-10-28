import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { AgentKPI } from '../../lib/dataProcessor';
import { buildTakeoutSimulation } from '../../lib/csatTakeoutSim';
import { cn, formatNum } from '../../lib/utils';
import { EmptyState } from '../ui/EmptyState';
import { KpiValue } from '../ui/KpiCue';
import { SegmentedControl } from '../ui/SegmentedControl';

type View = 'category' | 'agent';

const MIN_VOLUME = 20;

const pct = (v: number | null) => (v === null ? '-' : formatNum(v, 2, '%'));

const signedPp = (v: number | null) => {
  if (v === null) return '-';
  const s = formatNum(Math.abs(v), 2);
  return `${v < 0 ? '−' : '+'}${s} pp`;
};

const deltaClass = (v: number | null) => (v !== null && v > 0.005 ? 'text-success' : 'text-text-muted');

const CATEGORY_COLS = 'grid-cols-[28px_minmax(0,1fr)_72px_136px_128px]';
const AGENT_COLS = 'grid-cols-[minmax(0,1fr)_64px_84px_92px_104px_88px_20px]';

export const CsatTakeoutSim: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const [extra, setExtra] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<View>('category');
  const [hideSmall, setHideSmall] = useState(true);
  const [openAgent, setOpenAgent] = useState<string | null>(null);

  const sim = useMemo(() => buildTakeoutSimulation(data, extra), [data, extra]);

  const toggle = (key: string) =>
    setExtra((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const categories = hideSmall
    ? sim.categories.filter((c) => c.valid >= MIN_VOLUME || c.selected)
    : sim.categories;
  const hiddenCount = sim.categories.length - categories.length;
  const simDelta =
    sim.simulated.pct !== null && sim.official.pct !== null ? sim.simulated.pct - sim.official.pct : null;

  return (
    <div className="flex flex-col gap-4 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          Simulasi Takeout
        </h2>
        <button
          type="button"
          onClick={() => setExtra(new Set())}
          disabled={extra.size === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset ke resmi
        </button>
      </div>
      <p className="max-w-3xl text-xs leading-relaxed text-text-muted">
        Centang kategori tambahan untuk melihat CSAT survei (CSAT SC) After Takeout kalau kategori itu dikeluarkan.
        Hanya simulasi di layar &mdash; angka resmi dan daftar takeout di dashboard tidak berubah.
      </p>

      {sim.categories.length === 0 ? (
        <EmptyState
          title="Belum ada data CSAT survei"
          description="Coba ubah filter atau rentang tanggal, atau sync data CSAT SC."
          variant="data"
          showDataActions
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-text-muted">Before Takeout</div>
              <div className="mt-1 text-3xl tabular-nums">
                <KpiValue value={sim.before.pct} type="csatFull" text={pct(sim.before.pct)} />
              </div>
              <div className="mt-1 text-[11px] text-text-muted">Semua kategori &middot; {sim.before.valid} rating valid</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-text-muted">After Takeout &mdash; resmi</div>
              <div className="mt-1 text-3xl tabular-nums">
                <KpiValue value={sim.official.pct} type="csatFair" text={pct(sim.official.pct)} />
              </div>
              <div className="mt-1 text-[11px] text-text-muted">3 kategori takeout &middot; {sim.official.valid} rating valid</div>
            </div>
            <div className="rounded-xl border-2 border-primary bg-card p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-primary">After Takeout &mdash; simulasi</div>
              <div className="mt-1 text-3xl tabular-nums">
                <KpiValue value={sim.simulated.pct} type="csatFair" text={pct(sim.simulated.pct)} />
              </div>
              <div className="mt-1 text-[11px] text-text-muted">
                <span className={cn('font-bold tabular-nums', deltaClass(simDelta))}>{signedPp(simDelta)}</span> dari resmi
                &middot; {sim.extraCount} kategori tambahan &middot; {sim.simulated.valid} rating valid
              </div>
            </div>
          </div>

          <SegmentedControl<View>
            aria-label="Tampilan simulasi takeout"
            value={view}
            onChange={setView}
            options={[
              { value: 'category', label: 'Per Kategori' },
              { value: 'agent', label: 'Per Agent' },
            ]}
          />

          {view === 'category' ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className={cn('grid items-center gap-3 border-b border-border bg-surface px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted', CATEGORY_COLS)}>
                    <span className="sr-only">Takeout</span>
                    <span className="col-start-2">Kategori</span>
                    <span className="text-right">Rating</span>
                    <span>CSAT kategori</span>
                    <span className="text-right">Kalau dicentang sendiri</span>
                  </div>
                  <div className="max-h-[560px] overflow-y-auto">
                    {categories.map((c) => (
                      <label
                        key={c.key || '__unknown__'}
                        className={cn(
                          'grid min-h-[48px] items-center gap-3 border-b border-border/60 px-4 py-2.5',
                          CATEGORY_COLS,
                          c.isOfficial ? 'cursor-not-allowed bg-surface/60' : 'cursor-pointer hover:bg-surface/60',
                          !c.isOfficial && c.selected && 'bg-primary/5',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={c.selected}
                          disabled={c.isOfficial}
                          onChange={() => toggle(c.key)}
                          aria-label={`Takeout ${c.label}`}
                        />
                        <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] font-medium text-text-primary">
                          <span className="truncate">{c.label}</span>
                          {c.isOfficial && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Resmi (dikunci)</span>
                          )}
                          {c.key === '' && (
                            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-muted">Bukan kategori asli</span>
                          )}
                        </span>
                        <span className="text-right text-[13px] tabular-nums text-text-primary">{c.valid}</span>
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 rounded-full bg-surface-muted">
                            <span className="block h-1.5 rounded-full bg-text-muted" style={{ width: `${Math.min(100, c.csat ?? 0)}%` }} />
                          </span>
                          <span className="w-12 text-right text-[12px] tabular-nums text-text-secondary">{pct(c.csat)}</span>
                        </span>
                        <span className={cn('text-right text-[13px] font-semibold tabular-nums', c.isOfficial ? 'text-text-muted' : deltaClass(c.aloneDelta))}>
                          {c.isOfficial ? '—' : signedPp(c.aloneDelta)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface/40 px-4 py-2 text-[11px] text-text-muted">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={hideSmall}
                    onChange={(e) => setHideSmall(e.target.checked)}
                  />
                  Sembunyikan kategori di bawah {MIN_VOLUME} rating
                </label>
                {hiddenCount > 0 && <span>{hiddenCount} kategori disembunyikan</span>}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className={cn('grid items-center gap-3 border-b border-border bg-surface px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted', AGENT_COLS)}>
                    <span>Agent</span>
                    <span className="text-right">Rating</span>
                    <span className="text-right">Before</span>
                    <span className="text-right">After resmi</span>
                    <span className="text-right">After simulasi</span>
                    <span className="text-right">Selisih</span>
                    <span />
                  </div>
                  <div className="max-h-[620px] overflow-y-auto">
                    {sim.agents.map((a) => {
                      const open = openAgent === a.csId;
                      return (
                        <div key={a.csId} className="border-b border-border/60">
                          <button
                            type="button"
                            onClick={() => setOpenAgent(open ? null : a.csId)}
                            aria-expanded={open}
                            className={cn('grid min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface/60', AGENT_COLS, open && 'bg-surface/60')}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-text-primary">{a.name}</span>
                              <span className="block truncate text-[11px] text-text-muted">{a.csId} &middot; {a.bpo || '-'}{a.teamLeader ? ` · ${a.teamLeader}` : ''}</span>
                            </span>
                            <span className="text-right text-[13px] tabular-nums text-text-primary">{a.valid}</span>
                            <span className="text-right text-[13px] tabular-nums text-text-muted">{pct(a.before)}</span>
                            <span className="text-right text-[13px] tabular-nums text-text-primary">{pct(a.official)}</span>
                            <span className="text-right text-[13px] font-bold tabular-nums text-text-primary">{pct(a.simulated)}</span>
                            <span className={cn('text-right text-[13px] font-semibold tabular-nums', deltaClass(a.delta))}>{signedPp(a.delta)}</span>
                            {open ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
                          </button>
                          {open && (
                            <div className="flex flex-col gap-2 bg-surface/40 px-4 pb-4 pt-1">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                                Kategori tambahan yang ditakeout (agent ini)
                              </div>
                              {a.extras.length === 0 ? (
                                <p className="text-xs text-text-muted">
                                  Belum ada kategori tambahan yang dicentang, atau agent ini tidak punya rating di kategori tersebut.
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {a.extras.map((x) => (
                                    <span key={x.key || '__unknown__'} className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-text-primary">
                                      <b>{x.label}</b> &middot; {x.valid} rating &middot; CSAT {pct(x.csat)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-text-muted">
            Rating valid = skor 1, 2, 4, 5. CSAT = rating &ge;4 dibagi rating valid. Mengikuti filter BPO / TL / agent dan rentang tanggal di atas.
          </p>
        </>
      )}
    </div>
  );
};

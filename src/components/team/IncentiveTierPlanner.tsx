import React, { useMemo, useState } from "react";
import { AgentKPI, toIsoDate } from "../../lib/dataProcessor";
import {
  getCsatStats,
  planTierUp,
  scoreFromInputs,
  countRemainingWorkDays,
  estimateRemainingQaTickets,
  DAILY_LIVECHAT_TARGET,
  LIVECHAT_PRODUCTIVITY_BONUS_PER_100,
  type IncentiveRow,
} from "../../lib/incentiveScoring";
import { cn, formatNum } from "../../lib/utils";

const formatRp = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

const toNumber = (value: string, fallback: number) => {
  const parsed = parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const NumberField = ({
  label,
  value,
  onChange,
  step = "any",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
}) => (
  <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
    {label}
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-semibold tabular-nums text-text-primary focus:border-primary focus:outline-none"
    />
  </label>
);

/**
 * "Naik Tier" panel for one agent: what each KPI would have to do to reach the
 * next tier, plus a what-if scenario. Uses the same formulas as the incentive row.
 */
export const IncentiveTierPlanner: React.FC<{
  agent: AgentKPI;
  row: IncentiveRow;
  periodEnd: string;
}> = ({ agent, row, periodEnd }) => {
  const { good, bad } = getCsatStats(agent);
  const target = row.productivityTarget ?? 0;
  const chat = row.productivityActual ?? 0;

  const remainingWorkDays = useMemo(
    () => countRemainingWorkDays(agent.dailyHistory?.schedule, toIsoDate(new Date()), periodEnd),
    [agent, periodEnd],
  );
  const estimatedQa = estimateRemainingQaTickets(agent.qaScoreCount, agent.manDays, remainingWorkDays);

  const [moreQaInput, setMoreQaInput] = useState(String(estimatedQa));
  const expectedMoreQa = Math.max(0, Math.round(toNumber(moreQaInput, estimatedQa)));

  const plan = useMemo(
    () =>
      planTierUp({
        qaSum: agent.qaScoreSum,
        qaCount: agent.qaScoreCount,
        csatGood: good,
        csatBad: bad,
        chat,
        target,
        expectedMoreQa,
        remainingWorkDays,
      }),
    [agent, good, bad, chat, target, expectedMoreQa, remainingWorkDays],
  );

  // What-if scenario, pre-filled with the current numbers.
  const currentQa = row.qaPct ?? 0;
  const [qaInput, setQaInput] = useState(formatNum(currentQa, 2));
  const [badInput, setBadInput] = useState("0");
  const [chatInput, setChatInput] = useState(String(chat));
  const scenario = useMemo(
    () =>
      scoreFromInputs({
        qaPct: toNumber(qaInput, currentQa),
        csatGood: good,
        csatBad: bad + Math.max(0, Math.round(toNumber(badInput, 0))),
        chat: toNumber(chatInput, chat),
        target,
      }),
    [qaInput, badInput, chatInput, currentQa, good, bad, chat, target],
  );

  if (!plan) {
    return (
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Naik Tier</h3>
        <p className="text-[11px] text-text-muted">Muncul setelah data QA, CSAT, dan produktivitas agent lengkap.</p>
      </div>
    );
  }

  const next = plan.nextTier;
  const scoreDelta = scenario.totalScore - plan.score;
  const incentiveDelta = scenario.totalIncentive - (row.totalIncentive ?? 0);

  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Naik Tier</h3>

      {next ? (
        <div className="space-y-3">
          <p className="text-[11px] text-text-secondary">
            Skor <strong className="text-text-primary">{formatNum(plan.score, 2)}</strong> ({plan.tier === "-" ? "belum ada tier" : plan.tier}).
            Butuh <strong className="text-text-primary">+{formatNum(plan.gap ?? 0, 2)} poin</strong> untuk{" "}
            <strong className="text-text-primary">{next.label}</strong> (≥ {next.min}, insentif {formatRp(next.incentive)}).
          </p>

          {plan.qaBottleneck && (
            <p className="rounded-lg border border-border bg-surface px-3 py-2 text-[11px] text-text-secondary">
              Dengan QA {formatNum(currentQa, 2)}% skor maksimum hanya{" "}
              <strong className="text-text-primary">{formatNum(plan.ceiling, 1)}</strong>, bahkan jika CSAT dan produktivitas
              penuh. {plan.qa
                ? <>Untuk {next.label}, QA perlu naik ke <strong className="text-text-primary">≥ {plan.qa.neededPct}%</strong> dulu.</>
                : <>{next.label} belum bisa dicapai periode ini.</>}
            </p>
          )}

          <div className="space-y-2">
            <p className="text-[10px] font-medium text-text-muted">Jika hanya satu komponen yang berubah</p>

            <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-text-muted">QC audit</span>
                {plan.qa ? (
                  <span className="text-right font-semibold text-text-primary">
                    rata-rata ≥ {plan.qa.neededPct}% <span className="font-normal text-text-muted">(sekarang {formatNum(currentQa, 2)}%)</span>
                  </span>
                ) : (
                  <span className="font-semibold text-text-muted">tidak cukup lewat QC saja</span>
                )}
              </div>
              {plan.qa && (
                <p className="mt-1 text-text-muted">
                  {plan.qa.requiredFutureAvg !== null
                    ? <>Sisa ~{expectedMoreQa} tiket QC harus rata-rata <strong className="text-text-primary">≥ {formatNum(plan.qa.requiredFutureAvg, 2)}%</strong>.</>
                    : expectedMoreQa > 0
                      ? "Sisa tiket perkiraan tidak cukup untuk mengejar angka ini."
                      : "Perkiraan sisa tiket QC belum ada."}
                </p>
              )}
              <div className="mt-2 w-32">
                <NumberField label="Perkiraan sisa tiket QC" value={moreQaInput} onChange={setMoreQaInput} step="1" />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-text-muted">CSAT</span>
                {plan.csat ? (
                  <span className="text-right font-semibold text-text-primary">
                    ≥ {formatNum(plan.csat.neededPct, 2)}% <span className="font-normal text-text-muted">(sekarang {formatNum(row.csatPct ?? 0, 2)}%)</span>
                  </span>
                ) : (
                  <span className="font-semibold text-text-muted">tidak cukup lewat CSAT saja</span>
                )}
              </div>
              {plan.csat && (
                <p className="mt-1 text-text-muted">
                  {plan.csat.additionalGood === 0
                    ? "Sudah memenuhi."
                    : plan.csat.additionalGood === null
                      ? "Tidak bisa dikejar selama masih ada bad rating."
                      : <>Butuh <strong className="text-text-primary">+{plan.csat.additionalGood} good rating</strong> tanpa bad rating baru.</>}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-text-muted">Produktivitas</span>
                {plan.productivity ? (
                  <span className="text-right font-semibold text-text-primary">
                    +{formatNum(plan.productivity.additionalChats, 0)} chat
                  </span>
                ) : (
                  <span className="font-semibold text-text-muted">tidak cukup lewat produktivitas saja</span>
                )}
              </div>
              {plan.productivity && (
                <p className="mt-1 text-text-muted">
                  {plan.productivity.additionalChats === 0
                    ? "Sudah memenuhi."
                    : plan.productivity.perDay !== null
                      ? <>≈ <strong className="text-text-primary">{formatNum(plan.productivity.perDay, 1)} chat/hari</strong> tambahan selama {remainingWorkDays} hari kerja tersisa.</>
                      : "Tidak ada hari kerja tersisa di periode ini."}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-text-secondary">
          Sudah <strong className="text-text-primary">T1</strong>, tier tertinggi. Setiap {DAILY_LIVECHAT_TARGET} chat di atas target menambah{" "}
          {formatRp(LIVECHAT_PRODUCTIVITY_BONUS_PER_100)} bonus.
        </p>
      )}

      <div className="mt-4 rounded-lg border border-border bg-surface p-3">
        <p className="mb-2 text-[10px] font-medium text-text-muted">Coba skenario</p>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="QA %" value={qaInput} onChange={setQaInput} />
          <NumberField label="Tambah bad rating" value={badInput} onChange={setBadInput} step="1" />
          <NumberField label="Total chat" value={chatInput} onChange={setChatInput} step="1" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] text-text-muted">Skor</p>
            <p className="text-sm font-bold tabular-nums text-text-primary">{formatNum(scenario.totalScore, 2)}</p>
            <p className="text-[10px] tabular-nums text-text-muted">{scoreDelta >= 0 ? "+" : ""}{formatNum(scoreDelta, 2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted">Tier</p>
            <p className="text-sm font-bold text-text-primary">{scenario.tier === "-" ? "–" : scenario.tier}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted">Insentif</p>
            <p className="text-sm font-bold tabular-nums text-text-primary">{formatRp(scenario.totalIncentive)}</p>
            <p className={cn("text-[10px] tabular-nums", incentiveDelta === 0 ? "text-text-muted" : "text-text-secondary")}>
              {incentiveDelta >= 0 ? "+" : "−"}{formatRp(Math.abs(incentiveDelta))}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-text-muted">Perkiraan saja, tidak mengubah data.</p>
      </div>
    </div>
  );
};

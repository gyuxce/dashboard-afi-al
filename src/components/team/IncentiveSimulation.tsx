import React, { useMemo, useRef } from "react";
import { Calculator, CheckCircle2, CircleAlert, FileText, KeyRound, LockKeyhole, User, Users, X } from "lucide-react";
import { AgentKPI } from "../../lib/dataProcessor";
import {
  DAILY_LIVECHAT_TARGET,
  TEAM_LEADER_GROSS_SALARY,
  bestLeaderBonusPerTeamLeader,
  buildIncentiveRow,
  getCsatStats,
  getTeamLeaderTier,
  type IncentiveRow,
  type IncentiveStatus,
} from "../../lib/incentiveScoring";
import { cn, formatNum } from "../../lib/utils";
import { isInactiveAgent } from "../../lib/inactiveAgents";
import { IncompleteDataNotice } from "../ui/IncompleteDataNotice";
import { useVirtualRows } from "../../hooks/useVirtualRows";

const TEAM_LEADER_ACCESS_PIN = "170845";

/** QA/CSAT: full precision, but a clean 100 shows as "100" not "100.00". Prod (per-chat count) is always a whole number. */
const formatKpiPct = (value: number | null, decimals: number): string => {
  if (value === null) return "–";
  const rounded = Number(value.toFixed(decimals));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals);
};

interface TeamLeaderIncentiveRow {
  teamLeader: string;
  agentCount: number;
  incompleteCount: number;
  finalQaPct: number | null;
  finalCsatPct: number | null;
  finalProductivityPct: number | null;
  averageQaPoints: number | null;
  averageCsatPoints: number | null;
  averageProductivityPoints: number | null;
  finalScore: number | null;
  tier: string;
  baseIncentive: number | null;
  productivityBonus: number;
  bestLeaderBonus: number;
  totalIncentive: number | null;
  grossSalary: number;
  grossThp: number | null;
  status: IncentiveStatus;
}

const formatCurrency = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatDateLabel = (date: string) => {
  if (!date) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
};


const statusLabel: Record<IncentiveStatus, string> = {
  eligible: "Eligible",
  ineligible: "Tidak eligible",
  incomplete: "Data belum lengkap",
};

const statusClass: Record<IncentiveStatus, string> = {
  eligible: "bg-success-soft text-success-text",
  ineligible: "bg-danger-soft text-danger-text",
  incomplete: "bg-warning-soft text-warning-text",
};

const SummaryCard = ({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "success" | "warning";
}) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <p className="text-[10px] font-medium tracking-wide text-text-muted">{label}</p>
    <p className={cn(
      "mt-1 text-xl font-bold",
      tone === "success" ? "text-success-text" : tone === "warning" ? "text-warning-text" : "text-text-primary",
    )}>{value}</p>
    <p className="mt-0.5 text-[11px] text-text-muted">{detail}</p>
  </div>
);

/** One row in the tier list — normalised from either an agent or a TL row. */
type ListItem = {
  id: string;
  name: string;
  meta: string;
  qcPts: number;
  csatPts: number;
  prodPts: number;
  qcPct: number | null;
  csatPct: number | null;
  prodPct: number | null;
  score: number | null;
  tier: string;
  status: IncentiveStatus;
  total: number | null;
};

/** Monochrome KPI progress bar for the detail drawer (colour-discipline: no KPI hue). */
const KpiBar = ({
  label,
  weight,
  pct,
  points,
  maxPoints,
  decimals = 1,
}: {
  label: string;
  weight: string;
  pct: number | null;
  points: number;
  maxPoints: number;
  decimals?: number;
}) => {
  const width = Math.min((points / maxPoints) * 100, 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-text-muted">{label} ({weight})</span>
        <span className="font-semibold tabular-nums text-text-primary">
          {pct !== null ? `${formatKpiPct(pct, decimals)}%` : "–"}
          <span className="ml-1 font-normal text-text-muted">· {formatNum(points, 1)}/{maxPoints}</span>
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-border">
        <div className="absolute inset-y-0 left-0 rounded-full bg-text-secondary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
};

/** Score + incentive breakdown for one agent / TL — used in the side drawer. */
const IncentiveDetail = ({
  item,
  mode,
  rawAgent,
  rawTl,
  onClose,
}: {
  item: ListItem;
  mode: "agent" | "tl";
  rawAgent?: IncentiveRow;
  rawTl?: TeamLeaderIncentiveRow;
  onClose: () => void;
}) => {
  const breakdown: { label: string; value: string; tone?: "success" | "muted" }[] =
    mode === "agent"
      ? [
          { label: "Tier", value: item.tier === "-" ? "Tidak eligible" : item.tier },
          { label: "Insentif tier", value: formatCurrency(rawAgent?.baseIncentive ?? null) },
          { label: "Bonus produktivitas", value: formatCurrency(rawAgent?.productivityBonus ?? null), tone: "success" },
          { label: "Total insentif", value: formatCurrency(rawAgent?.totalIncentive ?? null) },
        ]
      : [
          { label: "Tier TL", value: item.tier === "-" ? "Tidak eligible" : item.tier },
          { label: "Insentif tier", value: formatCurrency(rawTl?.baseIncentive ?? null) },
          { label: "Bagian bonus TL", value: formatCurrency(rawTl?.bestLeaderBonus ?? null), tone: "success" },
          { label: "Total insentif", value: formatCurrency(rawTl?.totalIncentive ?? null) },
          { label: "Gaji gross", value: formatCurrency(rawTl?.grossSalary ?? null), tone: "muted" },
          { label: "THP gross", value: formatCurrency(rawTl?.grossThp ?? null) },
        ];

  return (
    <>
      <div className="mb-4 flex items-start justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text-primary">Rincian Insentif</h2>
          <p className="mt-0.5 truncate text-xs text-text-secondary">
            {item.name}
            {mode === "agent" && rawAgent?.csId ? ` · ${rawAgent.csId}` : ""}
            {mode === "agent" && rawAgent?.teamLeader ? ` · TL ${rawAgent.teamLeader}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-secondary">
              Skor {item.score !== null ? formatNum(item.score, 1) : "–"}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", statusClass[item.status])}>
              {statusLabel[item.status]}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Skor KPI</h3>
        <KpiBar label="QC audit" weight="55%" pct={item.qcPct} points={item.qcPts} maxPoints={55} decimals={2} />
        <KpiBar label="CSAT (QC tagging)" weight="25%" pct={item.csatPct} points={item.csatPts} maxPoints={25} decimals={2} />
        <KpiBar
          label="Produktivitas"
          weight="20%"
          pct={item.prodPct !== null ? Math.min(item.prodPct, 100) : null}
          points={item.prodPts}
          maxPoints={20}
          decimals={0}
        />
        <p className="text-[10px] text-text-muted">
          Total skor {item.score !== null ? formatNum(item.score, 2) : "–"} / 100. Kuis &amp; training wajib, tidak menambah skor.
        </p>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Insentif</h3>
        <div className="space-y-2">
          {breakdown.map((r) => (
            <div key={r.label} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-[11px]">
              <span className="text-text-muted">{r.label}</span>
              <span className={cn(
                "font-bold tabular-nums",
                r.tone === "success" ? "text-success-text" : r.tone === "muted" ? "text-text-secondary" : "text-text-primary",
              )}>{r.value}</span>
            </div>
          ))}
        </div>
        {mode === "tl" && (
          <p className="mt-3 text-[11px] text-text-secondary">
            <strong className="text-text-primary">Cara baca:</strong> persentase QC/CSAT/Prod adalah ringkasan tim; skor akhir dihitung dari rata-rata poin agent. THP gross belum dipotong pajak/BPJS dan belum termasuk lembur, hari libur, atau shift malam.
          </p>
        )}
      </div>
    </>
  );
};

export const IncentiveSimulation: React.FC<{
  data: AgentKPI[];
  period: { start: string; end: string };
}> = ({ data, period: simulationPeriod }) => {
  const [viewMode, setViewMode] = React.useState<"agent" | "tl">("agent");
  const [isTlUnlocked, setIsTlUnlocked] = React.useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = React.useState(false);
  const [pinInput, setPinInput] = React.useState("");
  const [pinError, setPinError] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  const openTlView = () => {
    if (isTlUnlocked) {
      setSelectedId(null);
      setViewMode("tl");
      return;
    }
    setPinInput("");
    setPinError("");
    setIsPinDialogOpen(true);
  };

  const unlockTlView = (event: React.FormEvent) => {
    event.preventDefault();
    if (pinInput !== TEAM_LEADER_ACCESS_PIN) {
      setPinError("PIN tidak sesuai.");
      return;
    }
    setIsTlUnlocked(true);
    setIsPinDialogOpen(false);
    setPinInput("");
    setPinError("");
    setSelectedId(null);
    setViewMode("tl");
  };

  // App already ran processKPIs for the simulation month + applied roster/global filters.
  const safeData = Array.isArray(data) ? data : [];
  const safePeriod = simulationPeriod || { start: '', end: '' };

  // Reconciliation hint: scored QA tickets whose Checking Date falls outside the
  // period although their Tanggal Case is inside it.
  const outsidePeriodChecks = useMemo(() => {
    if (!safePeriod.start || !safePeriod.end) return 0;
    let count = 0;
    for (const agent of safeData) {
      for (const entry of agent.qaHistory || []) {
        const checked = entry.checkingNormDate;
        if (entry.hasScore && checked && (checked < safePeriod.start || checked > safePeriod.end)) count += 1;
      }
    }
    return count;
  }, [safeData, safePeriod.start, safePeriod.end]);

  const filteredAgents = useMemo(
    () => safeData.filter((agent) => !isInactiveAgent(agent, safePeriod.end || '')),
    [safeData, safePeriod.end],
  );

  const simulationRoster = filteredAgents;

  const rows = useMemo(() => filteredAgents
      .map(buildIncentiveRow)
      .sort((a, b) => {
        if (a.totalScore === null && b.totalScore === null) return a.name.localeCompare(b.name);
        if (a.totalScore === null) return 1;
        if (b.totalScore === null) return -1;
        return b.totalScore - a.totalScore;
      }), [filteredAgents]);

  const teamLeaderRows = useMemo(() => {
    const grouped = new Map<string, AgentKPI[]>();
    filteredAgents.forEach((agent) => {
      const teamLeader = String(agent.teamLeader || "-").trim() || "-";
      const current = grouped.get(teamLeader) || [];
      current.push(agent);
      grouped.set(teamLeader, current);
    });

    const leaderRows = Array.from(grouped.entries())
      .map(([teamLeader, teamAgents]): TeamLeaderIncentiveRow => {
        const agentRows = teamAgents.map(buildIncentiveRow);
        const csatStats = teamAgents.reduce(
          (totals, agent) => {
            const stats = getCsatStats(agent);
            return {
              good: totals.good + stats.good,
              bad: totals.bad + stats.bad,
            };
          },
          { good: 0, bad: 0 },
        );
        const totalDuty = teamAgents.reduce((sum, agent) => sum + agent.manDays, 0);
        const totalChat = teamAgents.reduce((sum, agent) => sum + agent.productivityTotal, 0);
        // TL QA uses the simple average of each agent's QA percentage.
        // Agent-level bucket points are intentionally not used here.
        const finalQaPct = agentRows.length > 0 && agentRows.every((row) => row.qaPct !== null)
          ? agentRows.reduce((sum, row) => sum + (row.qaPct || 0), 0) / agentRows.length
          : null;
        const csatTotal = csatStats.good + csatStats.bad;
        const finalCsatPct = csatTotal > 0
          ? (csatStats.good / csatTotal) * 100
          : null;
        const productivityTarget = totalDuty > 0 ? totalDuty * DAILY_LIVECHAT_TARGET : null;
        const finalProductivityPct = productivityTarget !== null
          ? (totalChat / productivityTarget) * 100
          : null;
        const incompleteCount = agentRows.filter((row) => row.status === "incomplete").length;
        const hasCompleteData = incompleteCount === 0
          && agentRows.length > 0
          && finalQaPct !== null
          && finalCsatPct !== null
          && finalProductivityPct !== null;
        const averageQaPoints = hasCompleteData
          ? ((finalQaPct || 0) / 100) * 55
          : null;
        const averageCsatPoints = hasCompleteData
          ? agentRows.reduce((sum, row) => sum + (row.csatPoints || 0), 0) / agentRows.length
          : null;
        const averageProductivityPoints = hasCompleteData
          ? agentRows.reduce((sum, row) => sum + (row.productivityPoints || 0), 0) / agentRows.length
          : null;
        const finalScore = hasCompleteData
          ? (averageQaPoints || 0) + (averageCsatPoints || 0) + (averageProductivityPoints || 0)
          : null;

        if (finalScore === null) {
          return {
            teamLeader,
            agentCount: agentRows.length,
            incompleteCount,
            finalQaPct,
            finalCsatPct,
            finalProductivityPct,
            averageQaPoints,
            averageCsatPoints,
            averageProductivityPoints,
            finalScore,
            tier: "-",
            baseIncentive: null,
            productivityBonus: 0,
            bestLeaderBonus: 0,
            totalIncentive: null,
            grossSalary: TEAM_LEADER_GROSS_SALARY,
            grossThp: null,
            status: "incomplete",
          };
        }

        const tier = getTeamLeaderTier(finalScore);
        const isEligible = tier.label !== "-";

        return {
          teamLeader,
          agentCount: agentRows.length,
          incompleteCount,
          finalQaPct,
          finalCsatPct,
          finalProductivityPct,
          averageQaPoints,
          averageCsatPoints,
          averageProductivityPoints,
          finalScore,
          tier: tier.label,
          baseIncentive: tier.incentive,
          productivityBonus: 0,
          bestLeaderBonus: 0,
          totalIncentive: isEligible ? tier.incentive : 0,
          grossSalary: TEAM_LEADER_GROSS_SALARY,
          grossThp: TEAM_LEADER_GROSS_SALARY + (isEligible ? tier.incentive : 0),
          status: isEligible ? "eligible" : "ineligible",
        };
      })
      .sort((a, b) => (b.finalScore || -1) - (a.finalScore || -1));

    const teamLeaderCount = new Set(
      simulationRoster.map((agent) => String(agent.teamLeader || "-").trim() || "-"),
    ).size;
    // Pool bonus TL terbaik (Rp500.000) dibagi RATA ke seluruh TL, bukan hanya
    // yang eligible. Contoh 5 TL: masing-masing dapat Rp100.000.
    const bestBonusPerTeamLeader = bestLeaderBonusPerTeamLeader(teamLeaderCount);

    return leaderRows.map((row) => {
      // TL dengan data belum lengkap (totalIncentive null) tidak bisa dihitung
      // THP-nya, jadi bagiannya dibiarkan kosong.
      const bestLeaderBonus = row.totalIncentive === null ? 0 : bestBonusPerTeamLeader;
      const totalIncentive = row.totalIncentive === null
        ? null
        : (row.totalIncentive || 0) + bestLeaderBonus;
      return {
        ...row,
        bestLeaderBonus,
        totalIncentive,
        grossThp: totalIncentive === null ? null : row.grossSalary + totalIncentive,
      };
    });
  }, [filteredAgents, simulationRoster]);

  // One normalised shape for the tier list, whichever view is active.
  const activeItems = useMemo<ListItem[]>(() => {
    if (viewMode === "agent") {
      return rows.map((row) => ({
        id: row.csId,
        name: row.name,
        meta: row.csId,
        qcPts: row.qaPoints ?? 0,
        csatPts: row.csatPoints ?? 0,
        prodPts: row.productivityPoints ?? 0,
        qcPct: row.qaPct,
        csatPct: row.csatPct,
        prodPct: row.productivityPct,
        score: row.totalScore,
        tier: row.tier,
        status: row.status,
        total: row.totalIncentive,
      }));
    }
    return teamLeaderRows.map((row) => ({
      id: row.teamLeader,
      name: row.teamLeader,
      meta: `${row.agentCount} agent`,
      qcPts: row.averageQaPoints ?? 0,
      csatPts: row.averageCsatPoints ?? 0,
      prodPts: row.averageProductivityPoints ?? 0,
      qcPct: row.finalQaPct,
      csatPct: row.finalCsatPct,
      prodPct: row.finalProductivityPct,
      score: row.finalScore,
      tier: row.tier,
      status: row.status,
      total: row.totalIncentive,
    }));
  }, [viewMode, rows, teamLeaderRows]);

  const listScrollRef = useRef<HTMLDivElement>(null);
  const listVirtual = useVirtualRows({
    count: activeItems.length,
    rowHeight: 56,
    scrollRef: listScrollRef,
  });

  const selectedItem = selectedId ? activeItems.find((i) => i.id === selectedId) ?? null : null;
  const selectedRawAgent = viewMode === "agent" && selectedId
    ? rows.find((r) => r.csId === selectedId)
    : undefined;
  const selectedRawTl = viewMode === "tl" && selectedId
    ? teamLeaderRows.find((r) => r.teamLeader === selectedId)
    : undefined;

  const eligibleRows = rows.filter((row) => row.status === "eligible");
  const ineligibleRows = rows.filter((row) => row.status === "ineligible");
  const incompleteRows = rows.filter((row) => row.status === "incomplete");
  const dataIssues: string[] = [];
  if (incompleteRows.length > 0) {
    dataIssues.push(
      `${incompleteRows.length} agent berstatus "Data belum lengkap" (QA / CSAT / produktivitas belum ada) — tidak dapat tier insentif.`,
    );
  }
  const totalIncentive = eligibleRows.reduce(
    (sum, row) => sum + (row.totalIncentive || 0),
    0,
  );
  const hasData = safeData.length > 0 || filteredAgents.length > 0;
  // Roster resolved but the incentive period itself has no QA/CSAT/productivity
  // rows (e.g. an un-populated month) — every agent is "Data belum lengkap".
  const incentivePeriodEmpty = rows.length > 0 && rows.every((r) => r.status === "incomplete")
    && filteredAgents.every((a) => a.manDays === 0 && a.qaScoreCount === 0 && a.productivityBase === 0);
  const teamLeaderAgentCount = teamLeaderRows.reduce((sum, row) => sum + row.agentCount, 0);
  const teamLeaderIneligibleCount = teamLeaderRows.reduce(
    (sum, row) => sum + (row.status === "ineligible" ? 1 : 0),
    0,
  );
  const teamLeaderTotalIncentive = teamLeaderRows.reduce((sum, row) => sum + (row.totalIncentive || 0), 0);
  const teamLeaderTotalGrossThp = teamLeaderRows.reduce(
    (sum, row) => sum + (row.grossThp || 0),
    0,
  );

  const gridCols = "grid-cols-[minmax(0,1fr)_104px_112px_104px]";

  return (
    <div className="flex flex-col gap-4 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          <Calculator className="h-5 w-5 text-primary" />
          Simulasi Insentif
        </h2>
        <span className="text-[11px] tabular-nums text-text-muted">
          Periode: {formatDateLabel(safePeriod.start)} &ndash; {formatDateLabel(safePeriod.end)}
        </span>
      </div>
      <p className="-mt-2 text-[11px] text-text-muted">
        QA &amp; CSAT dihitung dari <span className="font-medium text-text-secondary">Tanggal Case</span>
        {outsidePeriodChecks > 0
          ? ` — ${outsidePeriodChecks} tiket dicek di luar periode ini (tetap dihitung di periode kasusnya).`
          : '.'}
      </p>

      {!hasData ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-text-muted" />
          <p className="mt-3 text-sm font-semibold text-text-primary">Data simulasi belum tersedia</p>
          <p className="mt-1 text-xs text-text-muted">Sync data melalui File Center.</p>
        </div>
      ) : incentivePeriodEmpty ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-text-muted" />
          <p className="mt-3 text-sm font-semibold text-text-primary">
            Data periode insentif ({formatDateLabel(safePeriod.start)} &ndash; {formatDateLabel(safePeriod.end)}) belum tersedia
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Roster {rows.length} agent terbaca, tapi tab QA / CSAT SC / Productivity / SLA / Schedule bulan itu masih kosong di spreadsheet. Isi datanya lalu Sync ulang.
          </p>
        </div>
      ) : (
        <>
          <IncompleteDataNotice
            title="Simulasi di bawah ini belum final — data tidak lengkap."
            issues={dataIssues}
          />
          <div className="inline-flex w-max items-center gap-1 rounded-lg bg-surface-muted p-1">
            <button
              type="button"
              onClick={() => { setSelectedId(null); setViewMode("agent"); }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold transition-colors",
                viewMode === "agent" ? "bg-card text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary",
              )}
            >
              <User className="h-3.5 w-3.5" /> Agents
            </button>
            <button
              type="button"
              onClick={openTlView}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold transition-colors",
                viewMode === "tl" ? "bg-card text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary",
              )}
            >
              {isTlUnlocked ? <Users className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />} Team Leaders
            </button>
          </div>

          {isPinDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
              <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
                      <KeyRound className="h-4 w-4 text-primary" />
                      Akses Simulasi Team Leader
                    </h3>
                    <p className="mt-1 text-[11px] text-text-muted">Masukkan PIN untuk membuka simulasi khusus Team Leader.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPinDialogOpen(false)}
                    className="rounded-md p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
                    aria-label="Tutup"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <form onSubmit={unlockTlView} className="mt-4 space-y-3">
                  <input
                    type="password"
                    value={pinInput}
                    onChange={(event) => setPinInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoFocus
                    placeholder="PIN akses"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  {pinError && <p className="text-[11px] font-semibold text-danger">{pinError}</p>}
                  <button type="submit" className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90">
                    Buka Simulasi TL
                  </button>
                </form>
              </div>
            </div>
          )}

          <div className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2",
            viewMode === "tl" ? "xl:grid-cols-5" : "xl:grid-cols-4",
          )}>
            {viewMode === "agent" ? (
              <>
                <SummaryCard label="Agent disimulasikan" value={rows.length} detail="Mengikuti filter global" />
                <SummaryCard label="Eligible" value={eligibleRows.length} detail="Mendapat tier insentif" tone="success" />
                <SummaryCard label="Tidak eligible" value={ineligibleRows.length} detail="Skor total di bawah 80" tone="warning" />
                <SummaryCard label="Total estimasi" value={formatCurrency(totalIncentive)} detail="Tier + bonus produktivitas" tone="success" />
              </>
            ) : (
              <>
                <SummaryCard label="TL disimulasikan" value={teamLeaderRows.length} detail="Mengikuti filter global" />
                <SummaryCard label="Total agent" value={teamLeaderAgentCount} detail="Agent di bawah TL" />
                <SummaryCard label="Tidak eligible" value={teamLeaderIneligibleCount} detail="Skor total di bawah 80" tone="warning" />
                <SummaryCard label="Total estimasi" value={formatCurrency(teamLeaderTotalIncentive)} detail="Tier TL + bagian bonus TL" tone="success" />
                <SummaryCard label="Total THP gross" value={formatCurrency(teamLeaderTotalGrossThp)} detail="Gaji gross + insentif TL" tone="success" />
              </>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                {viewMode === "agent" ? "Simulasi per Agent" : "Simulasi per Team Leader"}
              </h3>
              <p className="mt-0.5 text-[11px] text-text-muted">
                {viewMode === "agent"
                  ? "Klik baris untuk rincian skor & insentif. Produktivitas di atas target menambah bonus."
                  : "Klik baris untuk rincian. Skor TL memakai rata-rata KPI agent; QA dari rata-rata persentase QA agent."}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              {/* tier list */}
              <div
                ref={listScrollRef}
                className="max-h-[calc(100vh-240px)] overflow-y-auto rounded-xl border border-border bg-card"
              >
                <div className={cn("sticky top-0 z-10 grid gap-3 border-b border-border bg-surface px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-text-muted", gridCols)}>
                  <span>{viewMode === "agent" ? "Agent" : "Team Leader"}</span>
                  <span>Kontribusi poin</span>
                  <span>QC · CSAT · Prod</span>
                  <span className="text-right">Insentif</span>
                </div>

                {activeItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-text-muted">
                    {viewMode === "agent"
                      ? "Tidak ada agent pada filter yang dipilih."
                      : "Tidak ada Team Leader pada filter yang dipilih."}
                  </div>
                ) : (
                  <>
                    <div style={{ height: listVirtual.paddingTop }} aria-hidden />
                    {listVirtual.virtualIndexes.map((idx) => {
                      const item = activeItems[idx];
                      if (!item) return null;
                      const isSel = selectedId === item.id;
                      const rest = Math.max(0, 100 - item.qcPts - item.csatPts - item.prodPts);
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={cn(
                            "grid w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors",
                            gridCols,
                            isSel ? "bg-surface-muted" : "hover:bg-surface-muted/60",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-text-primary" title={item.name}>{item.name}</span>
                            <span className="block truncate text-[10px] text-text-muted">{item.meta}</span>
                          </span>
                          <span
                            className="flex h-2 overflow-hidden rounded-full bg-surface-muted"
                            title={`QC ${item.qcPts.toFixed(1)} · CSAT ${item.csatPts.toFixed(1)} · Prod ${item.prodPts.toFixed(1)}`}
                          >
                            <span className="bg-text-secondary" style={{ width: `${item.qcPts}%` }} />
                            <span className="bg-text-muted" style={{ width: `${item.csatPts}%` }} />
                            <span className="bg-border-strong" style={{ width: `${item.prodPts}%` }} />
                            <span className="bg-border" style={{ width: `${rest}%` }} />
                          </span>
                          <span className="truncate text-[11px] tabular-nums text-text-secondary">
                            {formatKpiPct(item.qcPct, 2)}
                            <span className="text-text-disabled"> · </span>
                            {formatKpiPct(item.csatPct, 2)}
                            <span className="text-text-disabled"> · </span>
                            {item.prodPct !== null ? formatNum(Math.min(item.prodPct, 999), 0) + "%" : "–"}
                          </span>
                          <span className="text-right">
                            <span className="block text-[12px] font-bold tabular-nums text-text-primary">{formatCurrency(item.total)}</span>
                            <span className={cn("mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold", statusClass[item.status])}>
                              {item.tier === "-" ? statusLabel[item.status] : item.tier}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <div style={{ height: listVirtual.paddingBottom }} aria-hidden />
                  </>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-[10px] text-text-muted">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2.5 rounded-sm bg-text-secondary" />QC (55)</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2.5 rounded-sm bg-text-muted" />CSAT (25)</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2.5 rounded-sm bg-border-strong" />Prod (20)</span>
                </div>
              </div>

              {/* detail — inline on large screens */}
              <div className="hidden lg:block">
                <div className="sticky top-4 max-h-[calc(100vh-240px)] overflow-y-auto rounded-xl border border-border bg-card p-4">
                  {selectedItem ? (
                    <IncentiveDetail
                      item={selectedItem}
                      mode={viewMode}
                      rawAgent={selectedRawAgent}
                      rawTl={selectedRawTl}
                      onClose={() => setSelectedId(null)}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-text-muted">
                      <Calculator className="mb-3 h-8 w-8 stroke-1" />
                      <p className="text-xs">Pilih baris untuk lihat rincian skor &amp; insentif.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* detail — slide-in drawer on small screens */}
            {selectedItem && (
              <div
                className="fixed inset-0 z-[100] flex justify-end bg-black/50 backdrop-blur-sm lg:hidden"
                onClick={() => setSelectedId(null)}
              >
                <div
                  className="h-full w-full max-w-[380px] overflow-y-auto border-l border-border bg-card p-4 animate-in slide-in-from-right duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <IncentiveDetail
                    item={selectedItem}
                    mode={viewMode}
                    rawAgent={selectedRawAgent}
                    rawTl={selectedRawTl}
                    onClose={() => setSelectedId(null)}
                  />
                </div>
              </div>
            )}
          </div>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Kurva Poin QC Livechat
              </h3>
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-surface-muted text-text-muted">
                    <tr><th className="px-3 py-2">Nilai QC</th><th className="px-3 py-2">Poin</th></tr>
                  </thead>
                  <tbody>
                    {[
                      ["98% ke atas", "55"],
                      ["95 - 97%", "48,4"],
                      ["90 - 94%", "38,5"],
                      ["85 - 89%", "24,75"],
                      ["80 - 84%", "11"],
                      ["Di bawah 80%", "0"],
                    ].map(([range, points]) => (
                      <tr key={range} className="border-t border-border">
                        <td className="px-3 py-2 text-text-secondary">{range}</td>
                        <td className="px-3 py-2 font-semibold text-text-primary">{points} / 55</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <Calculator className="h-4 w-4 text-primary" />
                Tier Insentif
              </h3>
              <div className="mt-3 space-y-2 text-[11px]">
                {(viewMode === "tl"
                  ? [
                    ["T1", "90 ke atas", "Rp2.000.000"],
                    ["T2", "85 - 89,99", "Rp1.250.000"],
                    ["T3", "80 - 84,99", "Rp750.000"],
                    ["-", "Di bawah 80", "Tidak eligible"],
                  ]
                  : [
                    ["T1", "96 ke atas", "Rp2.000.000"],
                    ["T2", "88 - 95,99", "Rp1.250.000"],
                    ["T3", "80 - 87,99", "Rp750.000"],
                    ["-", "Di bawah 80", "Tidak eligible"],
                  ]
                ).map(([tier, range, amount]) => (
                  <div key={tier} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
                    <span className="font-bold text-primary">{tier}</span>
                    <span className="text-text-secondary">{range}</span>
                    <span className="font-bold text-text-primary">{amount}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <CircleAlert className="h-4 w-4 text-warning" />
                Aturan Tambahan
              </h3>
              <div className="mt-3 space-y-2 text-[11px] text-text-secondary">
                {viewMode === "agent" ? (
                  <p className="rounded-lg bg-surface-muted p-3">Bonus Livechat: setiap 100 chat di atas target = <strong className="text-text-primary">Rp40.000</strong>.</p>
                ) : (
                  <>
                    <p className="rounded-lg bg-surface-muted p-3">Skor TL dihitung dari rata-rata KPI agent. Nilai QA memakai rata-rata persentase QA agent, bukan bucket poin agent.</p>
                    <p className="rounded-lg bg-success-soft p-3 text-success-text">Pool bonus TL terbaik sebesar <strong>Rp500.000</strong> dibagi rata kepada seluruh TL. Contoh 5 TL: masing-masing mendapat <strong>Rp100.000</strong>.</p>
                    <p className="rounded-lg bg-surface-muted p-3">Gaji gross TL per bulan <strong className="text-text-primary">Rp4.328.000</strong>. THP gross = gaji gross + insentif TL.</p>
                    <p className="rounded-lg bg-warning-soft p-3 text-warning-text">THP gross belum dikurangi pajak/BPJS dan belum termasuk lembur, hari libur, atau shift malam.</p>
                  </>
                )}
                <p className="rounded-lg bg-surface-muted p-3">Kuis dan training wajib diselesaikan, tetapi tidak menambah skor insentif.</p>
                <p className="rounded-lg bg-warning-soft p-3 text-warning-text">QA, CSAT, atau produktivitas yang belum tersedia akan berstatus <strong>Data belum lengkap</strong>.</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default IncentiveSimulation;

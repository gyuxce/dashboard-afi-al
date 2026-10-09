import React, { useMemo, useState, useRef } from "react";
import { useShallow } from 'zustand/react/shallow';
import { useStore } from "../../store";
import { AgentKPI, getCsatBadRatingCount } from "../../lib/dataProcessor";
import { ArrowRight, Trophy, Users, User, X } from "lucide-react";
import { formatNum, cn } from "../../lib/utils";
import { EmptyState } from '../ui/EmptyState';
import { calculateAgentCompositeScore, calculateCompositeScore } from "../../lib/kpiScoring";
import {
  aggregateTeamLeaderStats,
  getStandardPeriodDuty,
} from "../../lib/teamLeaderRows";
import { isInactiveAgent } from "../../lib/inactiveAgents";
import { IncompleteDataNotice } from '../ui/IncompleteDataNotice';
import { useVirtualRows } from '../../hooks/useVirtualRows';

const DAILY_PRODUCTIVITY_TARGET = 100;
const QUIZ_TARGET = 92;

interface LeaderboardRow {
  csId?: string;
  name: string;
  tl?: string;
  agent_count?: number;
  score: number;
  qa: number | null;
  qa_pct: number | null;
  qa_points: number | null;
  prod: number | null;
  prod_pct: number | null;
  prod_daily_target: number;
  prod_total_duty: number;
  prod_target_chat: number;
  prod_total_chat: number;
  prod_points: number | null;
  prod_final_points: number | null;
  prod_difference: number | null;
  csat: number | null;
  csat_pct: number | null;
  csat_good: number;
  csat_bad: number;
  csat_points: number | null;
  training_total: number | null;
  training_completion: number | null;
  training_pct: number;
  training_points: number;
  quiz_target: number;
  quiz_score: number;
  quiz_pct: number;
  quiz_points: number;
}

const getProductivityColumns = (totalChat: number, totalDuty: number) => {
  const targetChat = totalDuty * DAILY_PRODUCTIVITY_TARGET;
  const achievement = targetChat > 0 ? (totalChat / targetChat) * 100 : null;
  const points = achievement !== null ? (achievement / 100) * 20 : null;
  const finalPoints = points !== null ? Math.min(points, 20) : null;

  return {
    achievement,
    targetChat,
    points,
    finalPoints,
    // Chats above (or below) the period target — the number people actually
    // care about. The old "wasted points past the 20 cap" was ~always 0.
    difference: achievement !== null ? Math.round(totalChat - targetChat) : null,
  };
};

const getLeaderboardComposite = (agent: AgentKPI) => {
  const baseComposite = calculateAgentCompositeScore(agent);
  const csatGood = agent.csat4Count + agent.csat5Count;
  // Leaderboard bad ratings come from QC CSAT/DSAT tagging, not Official CSAT.
  const csatBad = getCsatBadRatingCount(agent);
  const csatTotal = csatGood + csatBad;
  const csatPct = csatTotal > 0 ? (csatGood / csatTotal) * 100 : null;

  return {
    composite: {
      ...baseComposite,
      csatOriginal: csatPct,
      csatPct,
      score: calculateCompositeScore({
        qaPct: baseComposite.qaPct,
        productivityPct: baseComposite.productivityPct,
        csatPct,
      }).score,
    },
    csatGood,
    csatBad,
    csatPct,
  };
};

interface AgentKpiRowProps {
  label: string;
  weight: string;
  value: number | null;
  maxValue: number;
  formatFn?: (v: number) => string;
  suffix?: string;
  isMaxCapped?: boolean;
}

const AgentKpiRow = ({
  label, weight, value, maxValue, formatFn, suffix, isMaxCapped
}: AgentKpiRowProps) => {
  const fmt = formatFn || ((v: number) => v.toFixed(1) + (suffix || '%'));
  const safeValue = value !== null ? value : 0;

  const percentage = Math.min((safeValue / maxValue) * 100, 100);

  let colorClass = "bg-danger";
  let textColorClass = "text-danger-text";
  if (value !== null) {
    if (value >= 95) { colorClass = "bg-success"; textColorClass = "text-success-text"; }
    else if (value >= 85) { colorClass = "bg-warning"; textColorClass = "text-warning-text"; }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-muted">
            {label} ({weight})
          </span>
        </div>
        <div className={`text-sm font-semibold ${textColorClass}`}>
          {value !== null ? fmt(value) : '-'}
          {isMaxCapped && (
            <span className="text-success-text text-xs ml-1 font-bold">Max</span>
          )}
        </div>
      </div>

      <div className="relative h-2 bg-border rounded-full overflow-hidden">
        <div
          className={`absolute top-0 h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

/** Score + climb-the-rank breakdown for one agent/TL — used in the side drawer. */
const AgentDetail = ({
  agent,
  rank,
  isBottom,
  isRank1,
  scoreGap,
  safeScore,
  targetDesc,
  onClose,
}: {
  agent: LeaderboardRow;
  rank: number;
  isBottom: boolean;
  isRank1: boolean;
  scoreGap: number;
  safeScore: number;
  targetDesc: string;
  onClose: () => void;
}) => {
  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-text-primary">Analisis KPI</h2>
          <p className="text-text-secondary text-xs mt-0.5">
            {agent.name}{agent.csId ? ` · ${agent.csId}` : ''}{agent.tl ? ` · TL ${agent.tl}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs text-text-muted bg-surface-muted px-2 py-0.5 rounded-full border border-border">
              Rank #{rank}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${agent.score >= 95 ? 'bg-success-soft text-success-text' : 'bg-surface-muted text-text-secondary'}`}>
              Skor {agent.score.toFixed(1)}
            </span>
            {isBottom && (
              <span className="text-[10px] bg-warning-soft text-warning-text px-2 py-0.5 rounded-full font-semibold">
                3 terbawah
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors p-1 rounded hover:bg-surface-muted"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-medium text-text-muted tracking-wide uppercase">Skor KPI</h3>

        <AgentKpiRow label="QA Score" weight="50%" value={agent.qa_pct} maxValue={100} isMaxCapped={false} />
        <AgentKpiRow
          label="Produktivitas"
          weight="20%"
          value={agent.prod !== null ? Math.min(agent.prod, 100) : null}
          maxValue={100}
          isMaxCapped={agent.prod !== null && agent.prod >= 100}
        />
        <AgentKpiRow
          label="CSAT Rating"
          weight="20%"
          value={agent.csat_pct}
          maxValue={100}
          isMaxCapped={false}
          formatFn={(v) => v.toFixed(2)}
          suffix="%"
        />

        <div className="space-y-1.5 mt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Training (5%)</span>
            <span className="text-sm font-semibold text-success-text">100%</span>
          </div>
          <div className="relative w-full bg-border-strong rounded-full h-1.5 overflow-hidden">
            <div className="absolute top-0 h-full rounded-full bg-success" style={{ width: '100%' }} />
          </div>
          <p className="text-[10px] text-text-muted">Auto 100% — pastikan modul training selesai tepat waktu</p>
        </div>
        <div className="space-y-1.5 mt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Quiz (5%)</span>
            <span className="text-sm font-semibold text-success-text">100%</span>
          </div>
          <div className="relative w-full bg-border-strong rounded-full h-1.5 overflow-hidden">
            <div className="absolute top-0 h-full rounded-full bg-success" style={{ width: '100%' }} />
          </div>
          <p className="text-[10px] text-text-muted">Auto 100% — pastikan kuis dikerjakan sebelum deadline</p>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-border space-y-3">
        <h3 className="text-[11px] font-semibold text-text-secondary tracking-wide uppercase">Prioritas Peningkatan</h3>

        {isRank1 ? (
          <div className="p-3 bg-primary-soft/20 border border-primary-soft/50 rounded-lg text-center">
            <p className="text-sm font-bold text-primary">Sudah #1 pada periode ini.</p>
            <p className="text-xs text-text-secondary mt-1">Pertahankan performa ini.</p>
          </div>
        ) : (() => {
          const qaNeeded = scoreGap / 0.5;
          const prodNeeded = scoreGap / 0.2;
          const csatNeeded = scoreGap / 0.2;

          const currQa = agent.qa_pct || 0;
          const currProd = agent.prod || 0;
          const currCsat = agent.csat_pct || 0;

          const canQa = (currQa + qaNeeded) <= 100;
          const canProd = currProd < 100 && (currProd + prodNeeded) <= 100;
          const canCsat = (currCsat + csatNeeded) <= 100;

          if (currQa >= 100 && currProd >= 100 && currCsat >= 100) {
            return (
              <div className="p-3 bg-success-soft/20 border border-success-soft/50 rounded-lg text-center">
                <p className="text-sm font-bold text-success-text">Semua KPI sudah maksimal (100%).</p>
                <p className="text-xs text-text-secondary mt-1">Tidak ada yang perlu ditingkatkan lagi.</p>
              </div>
            );
          }

          const options = [
            { type: 'qa', needed: qaNeeded, can: canQa },
            { type: 'prod', needed: prodNeeded, can: canProd },
            { type: 'csat', needed: csatNeeded, can: canCsat },
          ].filter((o) => o.can).sort((a, b) => a.needed - b.needed);
          const easiest = options.length > 0 ? options[0].type : 'none';

          return (
            <>
              <div className="mb-1">
                <p className="text-xs font-bold text-text-primary">{targetDesc}</p>
                {scoreGap < 0.2 ? (
                  <p className="text-xs text-text-secondary mt-0.5">Hampir! Sedikit lagi naik rank.</p>
                ) : (
                  <p className="text-xs text-text-secondary mt-0.5">Butuh skor &ge; {safeScore.toFixed(1)} · gap {scoreGap.toFixed(1)} poin</p>
                )}
              </div>

              <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${easiest === 'qa' ? 'bg-primary-soft/10 border-primary/20' : 'bg-surface-muted border-border'}`}>
                <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${canQa ? (easiest === 'qa' ? 'bg-primary' : 'bg-warning') : 'bg-text-muted'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary">QA Score</span>
                    {easiest === 'qa' && <span className="text-[9px] text-primary bg-primary-soft px-1 rounded font-medium">prioritas</span>}
                  </div>
                  <div className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                    {canQa
                      ? <>Naik <span className="font-bold">+{qaNeeded.toFixed(1)}%</span> ({currQa.toFixed(1)}% → {(currQa + qaNeeded).toFixed(1)}%) — cukup untuk target</>
                      : <>Butuh +{qaNeeded.toFixed(1)}% (melebihi 100%, sangat sulit)</>}
                  </div>
                </div>
              </div>

              <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${easiest === 'prod' ? 'bg-primary-soft/10 border-primary/20' : 'bg-surface-muted border-border'}`}>
                <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${canProd ? (easiest === 'prod' ? 'bg-primary' : 'bg-warning') : 'bg-text-muted'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary">Produktivitas</span>
                    {easiest === 'prod' && <span className="text-[9px] text-primary bg-primary-soft px-1 rounded font-medium">prioritas</span>}
                  </div>
                  <div className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                    {currProd >= 100
                      ? <>Sudah maksimal (100%, di-cap)</>
                      : canProd
                        ? <>Naik <span className="font-bold">+{prodNeeded.toFixed(1)}%</span> ({currProd.toFixed(1)}% → {(currProd + prodNeeded).toFixed(1)}%) — cukup untuk target</>
                        : <>Butuh effort besar / akan kena cap 100%</>}
                  </div>
                </div>
              </div>

              <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${easiest === 'csat' ? 'bg-primary-soft/10 border-primary/20' : 'bg-surface-muted border-border'}`}>
                <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${canCsat ? (easiest === 'csat' ? 'bg-primary' : 'bg-warning') : 'bg-text-muted'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary">CSAT Rating</span>
                    {easiest === 'csat' && <span className="text-[9px] text-primary bg-primary-soft px-1 rounded font-medium">prioritas</span>}
                  </div>
                  <div className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                    {canCsat
                      ? <>Naik <span className="font-bold">+{csatNeeded.toFixed(2)}%</span> ({currCsat.toFixed(2)}% → {(currCsat + csatNeeded).toFixed(2)}%) — cukup untuk target</>
                      : <>Butuh +{csatNeeded.toFixed(2)}% (melebihi 100%, sangat sulit)</>}
                  </div>
                </div>
              </div>

              <div className="mt-2 p-2.5 bg-primary-soft/20 rounded-lg border border-primary-soft/50">
                <p className="text-[11px] font-semibold text-primary">Cara paling mudah:</p>
                {easiest === 'none' ? (
                  <p className="text-[11px] font-medium text-primary mt-1">Sulit dengan satu KPI saja — tingkatkan semua KPI bertahap.</p>
                ) : (
                  <p className="text-[11px] font-medium text-primary mt-1">
                    Naikkan {easiest === 'qa' ? 'QA' : easiest === 'prod' ? 'Prod' : 'CSAT'}{' '}
                    <span className="font-bold">+{easiest === 'qa' ? qaNeeded.toFixed(1) : easiest === 'prod' ? prodNeeded.toFixed(1) : csatNeeded.toFixed(2)}%</span> saja sudah cukup.
                  </p>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </>
  );
};

export const Leaderboard: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const [toggleMode, setToggleMode] = useState<"tl" | "agent">("agent");
  const [selectedAgent, setSelectedAgent] = useState<LeaderboardRow | null>(null);

  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedAgent(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const {
    productivityData,
    csatScData,
    slaData,
    scheduleData,
    qaData,
    startDate,
    endDate,
  } = useStore(useShallow((s) => ({
    productivityData: s.productivityData,
    csatScData: s.csatScData,
    slaData: s.slaData,
    scheduleData: s.scheduleData,
    qaData: s.qaData,
    startDate: s.startDate,
    endDate: s.endDate,
  })));
  const openTab = useStore((s) => s.openTab);

  const handleOpenFiles = () => {
    openTab("files");
  };

  const hasData =
    productivityData.length > 0 ||
    csatScData.length > 0 ||
    slaData.length > 0 ||
    scheduleData.length > 0 ||
    qaData.length > 0;

  const { agentRows, tlRows, excludedInactive, excludedIncomplete } = useMemo(() => {
    if (!hasData) return { agentRows: [], tlRows: [], excludedInactive: 0, excludedIncomplete: 0 };

    // Reuse App-processed KPI rows (already scoped by global BPO/TL/Agent filters).
    const inactiveAgents = data.filter((agent) => isInactiveAgent(agent, endDate));
    const scopedRawData = data.filter((agent) => !isInactiveAgent(agent, endDate));

    // Prepare Agent List
    const aList: LeaderboardRow[] = [];
    let incompleteCount = 0;

    scopedRawData.forEach((agent) => {
      const { composite, csatGood, csatBad, csatPct } =
        getLeaderboardComposite(agent);
      const productivity = getProductivityColumns(
        agent.productivityTotal,
        agent.manDays,
      );

      if (composite.score !== null) {
        aList.push({
          csId: agent.csId,
          name: agent.name || agent.csId,
          tl: agent.teamLeader || "-",
          score: composite.score,
          qa: composite.qaOriginal,
          qa_pct: composite.qaPct,
          qa_points:
            composite.qaPct !== null ? (composite.qaPct / 100) * 50 : null,
          prod: composite.productivityOriginal,
          prod_pct: composite.productivityPct,
          prod_daily_target: DAILY_PRODUCTIVITY_TARGET,
          prod_total_duty: agent.manDays,
          prod_target_chat: productivity.targetChat,
          prod_total_chat: agent.productivityTotal,
          prod_points: productivity.points,
          prod_final_points: productivity.finalPoints,
          prod_difference: productivity.difference,
          csat: composite.csatOriginal,
          csat_pct: composite.csatPct,
          csat_good: csatGood,
          csat_bad: csatBad,
          csat_points: csatPct !== null ? (csatPct / 100) * 20 : null,
          training_total: null,
          training_completion: null,
          training_pct: 100,
          training_points: 5,
          quiz_target: QUIZ_TARGET,
          quiz_score: 100,
          quiz_pct: 100,
          quiz_points: 5,
        });
      } else {
        incompleteCount++;
      }
    });

    // TL tab keeps the short roster labels (Gagas, Yuge, Fandi). TLs are scored
    // on their team's per-agent average output against one shared Target Call
    // (standard period duty x 100), exactly like the official sheet.
    const standardDuty = getStandardPeriodDuty(
      scopedRawData.map((agent) => agent.manDays),
    );
    const teamsByTl = new Map<string, AgentKPI[]>();
    scopedRawData.forEach((agent) => {
      const tlName = (agent.teamLeader || "").trim();
      if (!tlName) return;
      const team = teamsByTl.get(tlName);
      if (team) team.push(agent);
      else teamsByTl.set(tlName, [agent]);
    });

    const tList: LeaderboardRow[] = [];
    teamsByTl.forEach((team, tlName) => {
      const stats = aggregateTeamLeaderStats(
        team.map((agent) => {
          const { csatGood, csatBad } = getLeaderboardComposite(agent);
          return {
            manDays: agent.manDays,
            productivityTotal: agent.productivityTotal,
            qaScoreSum: agent.qaScoreSum,
            qaScoreCount: agent.qaScoreCount,
            csatGood,
            csatBad,
          };
        }),
        standardDuty,
      );
      if (!stats) return;

      const productivity = getProductivityColumns(stats.avgChat, stats.duty);
      const prodPct =
        productivity.achievement !== null
          ? Math.min(productivity.achievement, 100)
          : null;

      const score = calculateCompositeScore({
        qaPct: stats.qaPct,
        productivityPct: prodPct,
        csatPct: stats.csatPct,
      }).score;
      if (score === null) return;

      tList.push({
        name: tlName,
        agent_count: stats.agentCount,
        score,
        qa: stats.qaPct,
        qa_pct: stats.qaPct,
        qa_points: stats.qaPct !== null ? (stats.qaPct / 100) * 50 : null,
        prod: productivity.achievement,
        prod_pct: productivity.achievement,
        prod_daily_target: DAILY_PRODUCTIVITY_TARGET,
        prod_total_duty: stats.duty,
        prod_target_chat: productivity.targetChat,
        prod_total_chat: stats.avgChat,
        prod_points: productivity.points,
        prod_final_points: productivity.finalPoints,
        prod_difference: productivity.difference,
        csat: stats.csatPct,
        csat_pct: stats.csatPct,
        csat_good: stats.csatGood,
        csat_bad: stats.csatBad,
        csat_points: stats.csatPct !== null ? (stats.csatPct / 100) * 20 : null,
        training_total: null,
        training_completion: null,
        training_pct: 100,
        training_points: 5,
        quiz_target: QUIZ_TARGET,
        quiz_score: 100,
        quiz_pct: 100,
        quiz_points: 5,
      });
    });

    aList.sort((a, b) => b.score - a.score);
    tList.sort((a, b) => b.score - a.score);

    return { agentRows: aList, tlRows: tList, excludedInactive: inactiveAgents.length, excludedIncomplete: incompleteCount };
  }, [
    data,
    endDate,
    hasData,
  ]);

  // Hooks must run on every render — keep them above the early return so the
  // no-data → data transition does not change the hook count (Rules of Hooks).
  const activeData = toggleMode === "tl" ? tlRows : agentRows;
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listVirtual = useVirtualRows({
    count: activeData.length,
    rowHeight: 60,
    scrollRef: listScrollRef,
  });

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] w-full mt-10">
        <Trophy className="w-16 h-16 text-text-muted mb-4 stroke-1" />
        <h2 className="text-xl font-bold text-text-primary mb-2">
          Belum Ada Data
        </h2>
        <p className="text-sm text-text-secondary mb-6 max-w-sm text-center">
          Buka File Center, pilih bulan data, lalu klik Sync sekarang untuk melihat ranking Leaderboard.
        </p>
        <button
          onClick={handleOpenFiles}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-text font-semibold rounded-lg hover:bg-primary-hover transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-sm"
        >
          Buka File Center <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const bottomThreeIds = activeData.slice(-3).map(a => a.csId || a.name);
  const isBottomThree = (id: string) => toggleMode === "agent" && bottomThreeIds.includes(id);

  const selectedRank = selectedAgent ? activeData.findIndex((a) => (a.csId || a.name) === (selectedAgent.csId || selectedAgent.name)) + 1 : 0;
  const isSelectedBottomThree = selectedAgent ? isBottomThree(selectedAgent.csId || selectedAgent.name) : false;

  let safeScore = activeData.length > 3 ? activeData[activeData.length - 3].score : 0;
  let scoreGap = 0;
  let targetDesc = "";
  let isRank1 = false;

  if (selectedAgent) {
    if (isSelectedBottomThree) {
      scoreGap = safeScore - selectedAgent.score + 0.1;
      targetDesc = "TARGET KELUAR 3 TERBAWAH:";
    } else if (selectedRank > 1) {
      const nextRankAgent = activeData[selectedRank - 2];
      safeScore = nextRankAgent.score;
      scoreGap = safeScore - selectedAgent.score + 0.1;
      targetDesc = `TARGET NAIK KE RANK #${selectedRank - 1}:`;
    } else {
      isRank1 = true;
    }
  }

  const dataIssues: string[] = [];
  if (qaData.length <= 1) dataIssues.push('Sheet QA kosong — skor QA & CSAT tidak terhitung untuk semua agent.');
  if (productivityData.length <= 1) dataIssues.push('Sheet Productivity kosong — poin produktivitas tidak terhitung.');
  if (scheduleData.length <= 1) dataIssues.push('Sheet Schedule kosong — man-days & target chat tidak terhitung.');
  if (excludedIncomplete > 0) dataIssues.push(`${excludedIncomplete} agent tidak masuk ranking karena QA / produktivitas / CSAT-nya belum ada.`);

  const gridCols = "grid-cols-[40px_minmax(0,1fr)_170px_150px_60px]";

  return (
    <div className="flex flex-col gap-5 p-2">
      <IncompleteDataNotice
        title="Ranking di bawah ini belum final — data tidak lengkap."
        issues={dataIssues}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          <Trophy className="w-5 h-5 text-warning" />
          Leaderboard
        </h2>
        <span className="text-[11px] tabular-nums text-text-muted">
          {startDate || "-"} &ndash; {endDate || "-"}
          {excludedInactive > 0 && ` · ${excludedInactive} inactive dikecualikan`}
        </span>
      </div>

      <div className="inline-flex bg-surface-muted p-1 rounded-lg w-max gap-1">
        <button
          onClick={() => { setToggleMode("agent"); setSelectedAgent(null); }}
          className={cn(
            "px-4 py-2 rounded-md text-[13px] flex items-center gap-2",
            toggleMode === "agent"
              ? "bg-card text-text-primary font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-border"
              : "bg-transparent text-text-muted font-medium hover:text-text-primary hover:bg-card/50",
          )}
        >
          <User className="w-4 h-4" /> Agent
        </button>
        <button
          onClick={() => { setToggleMode("tl"); setSelectedAgent(null); }}
          className={cn(
            "px-4 py-2 rounded-md text-[13px] flex items-center gap-2",
            toggleMode === "tl"
              ? "bg-card text-text-primary font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-border"
              : "bg-transparent text-text-muted font-medium hover:text-text-primary hover:bg-card/50",
          )}
        >
          <Users className="w-4 h-4" /> Team Leader
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* rank list */}
        <div
          ref={listScrollRef}
          className="rounded-xl border border-border bg-card overflow-y-auto max-h-[calc(100vh-230px)]"
        >
          <div className={cn("sticky top-0 z-10 grid gap-3 px-4 py-2.5 bg-surface border-b border-border text-[10px] font-medium uppercase tracking-wide text-text-muted", gridCols)}>
            <span className="text-center">#</span>
            <span>{toggleMode === "agent" ? "Agent" : "Team Leader"}</span>
            <span>Kontribusi skor</span>
            <span>QA · Prod · CSAT</span>
            <span className="text-right">Skor</span>
          </div>

          {activeData.length === 0 ? (
            <EmptyState
              title="Tidak ada data leaderboard"
              description="Pastikan periode aktif memiliki data agent."
              variant="filter"
              className="border-0 bg-transparent py-8"
              showDataActions
            />
          ) : (
            <>
              <div style={{ height: listVirtual.paddingTop }} aria-hidden />
              {listVirtual.virtualIndexes.map((idx) => {
                const item = activeData[idx];
                if (!item) return null;
                const rank = idx + 1;
                const isBottom = isBottomThree(item.csId || item.name);
                const isSel = !!selectedAgent && (selectedAgent.csId || selectedAgent.name) === (item.csId || item.name);
                const qp = item.qa_points ?? 0;
                const pp = item.prod_final_points ?? 0;
                const cp = item.csat_points ?? 0;
                const tot = qp + pp + cp + 10 || 1;
                const meta = toggleMode === "agent" ? (item.csId || item.name) : `${item.agent_count ?? 0} agent`;

                return (
                  <button
                    key={item.csId || item.name}
                    onClick={() => setSelectedAgent(item)}
                    className={cn(
                      "w-full grid gap-3 px-4 py-3 items-center text-left border-b border-border/60 transition-colors",
                      gridCols,
                      isSel ? "bg-surface-muted" : "hover:bg-surface-muted/60",
                      isBottom && "border-l-2 border-l-warning",
                    )}
                  >
                    <span className={cn("text-center text-[12px] font-bold tabular-nums", rank <= 3 ? "text-text-primary" : "text-text-muted")}>{rank}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-text-primary" title={item.name}>{item.name}</span>
                      <span className="block truncate text-[10px] text-text-muted">{meta}</span>
                    </span>
                    <span
                      className="flex h-2 rounded-full overflow-hidden bg-surface-muted"
                      title={`QA ${qp.toFixed(1)} · Prod ${pp.toFixed(1)} · CSAT ${cp.toFixed(1)} · T+Q 10`}
                    >
                      <span className="bg-text-secondary" style={{ width: `${(qp / tot) * 100}%` }} />
                      <span className="bg-text-muted" style={{ width: `${(pp / tot) * 100}%` }} />
                      <span className="bg-border-strong" style={{ width: `${(cp / tot) * 100}%` }} />
                      <span className="bg-border" style={{ width: `${(10 / tot) * 100}%` }} />
                    </span>
                    <span className="text-[11px] tabular-nums text-text-secondary truncate">
                      {item.qa_pct !== null ? formatNum(item.qa_pct, 1) : "–"}
                      <span className="text-text-disabled"> · </span>
                      {item.prod_pct !== null ? formatNum(Math.min(item.prod_pct, 999), 0) + "%" : "–"}
                      <span className="text-text-disabled"> · </span>
                      {item.csat_pct !== null ? formatNum(item.csat_pct, 1) : "–"}
                    </span>
                    <span className="text-right text-[15px] font-bold tabular-nums text-text-primary">{formatNum(item.score, 1)}</span>
                  </button>
                );
              })}
              <div style={{ height: listVirtual.paddingBottom }} aria-hidden />
            </>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 border-t border-border text-[10px] text-text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2 rounded-sm bg-text-secondary" />QA (50)</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2 rounded-sm bg-text-muted" />Prod (20)</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2 rounded-sm bg-border-strong" />CSAT (20)</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2 rounded-sm bg-border" />Training + Quiz (10)</span>
            {toggleMode === "agent" && <span className="ml-auto">3 terbawah ditandai garis kuning</span>}
          </div>
        </div>

        {/* detail — inline on large screens */}
        <div className="hidden lg:block">
          <div className="sticky top-4 rounded-xl border border-border bg-card p-4 max-h-[calc(100vh-230px)] overflow-y-auto">
            {selectedAgent ? (
              <AgentDetail
                agent={selectedAgent}
                rank={selectedRank}
                isBottom={isSelectedBottomThree}
                isRank1={isRank1}
                scoreGap={scoreGap}
                safeScore={safeScore}
                targetDesc={targetDesc}
                onClose={() => setSelectedAgent(null)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-16 text-text-muted">
                <User className="w-8 h-8 mb-3 stroke-1" />
                <p className="text-xs">Pilih baris untuk lihat rincian skor &amp; saran naik rank.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* detail — slide-in drawer on small screens */}
      {selectedAgent && (
        <div
          className="lg:hidden fixed inset-0 z-[100] flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedAgent(null)}
        >
          <div
            className="h-full w-full max-w-[380px] bg-card border-l border-border overflow-y-auto p-4 animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <AgentDetail
              agent={selectedAgent}
              rank={selectedRank}
              isBottom={isSelectedBottomThree}
              isRank1={isRank1}
              scoreGap={scoreGap}
              safeScore={safeScore}
              targetDesc={targetDesc}
              onClose={() => setSelectedAgent(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;

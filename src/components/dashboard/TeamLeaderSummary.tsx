import React, { useMemo } from "react";
import { AgentKPI, getOfficialCsatAggregate } from "../../lib/dataProcessor";
import { formatNum, getKpiStatus, type KpiType } from "../../lib/utils";
import { EmptyState } from "../ui/EmptyState";

const STATUS_CLASS: Record<string, string> = {
  none: "text-text-disabled",
  on: "text-text-primary",
  watch: "text-warning",
  miss: "text-danger",
};

const Metric = ({ value, text, type }: { value: number | null; text: string; type: KpiType }) => (
  <span className={`font-semibold tabular-nums ${STATUS_CLASS[getKpiStatus(value, type)]}`}>{text}</span>
);

type Row = {
  tl: string;
  agents: number;
  avgProd: number | null;
  csat: number | null;
  qa: number | null;
  attendance: number | null;
  csatScFull: number | null;
  sla1m: number | null;
};

/** Per-Team-Leader rollup of the same KPIs as the hero strip — replaces the
 *  old 12-column agent table with something a TL can act on at a glance. */
export const TeamLeaderSummary: React.FC<{ data: AgentKPI[] }> = ({ data }) => {
  const rows = useMemo<Row[]>(() => {
    const groups = new Map<string, AgentKPI[]>();
    for (const a of data) {
      const tl = String(a.teamLeader || "").trim() || "—";
      const g = groups.get(tl);
      if (g) g.push(a);
      else groups.set(tl, [a]);
    }

    const out: Row[] = [];
    groups.forEach((agents, tl) => {
      let totalProd = 0, manDays = 0, qaSum = 0, qaCount = 0;
      let scFullGood = 0, scFullValid = 0, attPresence = 0, attDuty = 0;
      let sla1mSum = 0, sla1mCount = 0;
      for (const d of agents) {
        totalProd += d.productivityTotal;
        manDays += d.manDays;
        qaSum += d.qaScoreSum;
        qaCount += d.qaScoreCount;
        scFullGood += d.csatScGoodCount || 0;
        scFullValid += d.csatScTotalValid || 0;
        attPresence += d.attendancePresence || 0;
        attDuty += d.attendanceDuty || 0;
        if (d.sla1m !== null) { sla1mSum += d.sla1m; sla1mCount++; }
      }
      const csat = getOfficialCsatAggregate(agents).score;
      out.push({
        tl,
        agents: agents.length,
        avgProd: manDays > 0 ? totalProd / manDays : null,
        csat,
        qa: qaCount > 0 ? qaSum / qaCount : null,
        attendance: attDuty > 0 ? (attPresence / attDuty) * 100 : null,
        csatScFull: scFullValid > 0 ? (scFullGood / scFullValid) * 100 : null,
        sla1m: sla1mCount > 0 ? sla1mSum / sla1mCount : null,
      });
    });

    return out.sort((a, b) => (b.avgProd ?? -1) - (a.avgProd ?? -1));
  }, [data]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Ringkasan per Team Leader</h3>
          <p className="text-[10px] text-text-muted mt-0.5">Rata-rata KPI tiap tim · warna hanya bila di bawah target</p>
        </div>
        <span className="text-[10px] tabular-nums text-text-muted">{rows.length} TL</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Tidak ada Team Leader"
          description="Pastikan periode aktif punya data agent dengan TL."
          variant="filter"
          className="border-0 bg-transparent py-6"
        />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="kpi-data-table w-full text-left text-[11px] border-collapse">
            <thead className="bg-surface text-text-secondary">
              <tr>
                <th className="p-2 font-bold text-center w-[40px]">No</th>
                <th className="p-2 font-bold min-w-[120px]">Team Leader</th>
                <th className="p-2 font-bold text-right w-[64px]">Agent</th>
                <th className="p-2 font-bold text-right w-[90px]">Avg Prod<span className="font-normal text-text-muted"> · t 100</span></th>
                <th className="p-2 font-bold text-right w-[100px]">CSAT Off<span className="font-normal text-text-muted"> · t 3.75</span></th>
                <th className="p-2 font-bold text-right w-[80px]">QA<span className="font-normal text-text-muted"> · t 92%</span></th>
                <th className="p-2 font-bold text-right w-[96px]">Attendance<span className="font-normal text-text-muted"> · t 95%</span></th>
                <th className="p-2 font-bold text-right w-[96px]">CSAT SC Full<span className="font-normal text-text-muted"> · t 75%</span></th>
                <th className="p-2 font-bold text-right w-[84px]">SLA 1m<span className="font-normal text-text-muted"> · t 92%</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.tl} className="border-t border-border hover:bg-surface-muted transition-colors">
                  <td className="p-2 text-center text-text-muted font-medium tabular-nums">{i + 1}</td>
                  <td className="p-2 font-semibold text-text-primary truncate" title={r.tl}>{r.tl}</td>
                  <td className="p-2 text-right tabular-nums text-text-secondary">{r.agents}</td>
                  <td className="p-2 text-right">
                    <Metric value={r.avgProd} type="productivity" text={r.avgProd !== null ? formatNum(r.avgProd, 0) : "–"} />
                  </td>
                  <td className="p-2 text-right">
                    <Metric value={r.csat} type="csatOfficial" text={r.csat !== null ? formatNum(r.csat, 2) : "–"} />
                  </td>
                  <td className="p-2 text-right">
                    <Metric value={r.qa} type="qa" text={r.qa !== null ? `${formatNum(r.qa, 1)}%` : "–"} />
                  </td>
                  <td className="p-2 text-right">
                    <Metric value={r.attendance} type="attendance" text={r.attendance !== null ? `${formatNum(r.attendance, 1)}%` : "–"} />
                  </td>
                  <td className="p-2 text-right">
                    <Metric value={r.csatScFull} type="csatFull" text={r.csatScFull !== null ? `${formatNum(r.csatScFull, 1)}%` : "–"} />
                  </td>
                  <td className="p-2 text-right">
                    <Metric value={r.sla1m} type="sla1m" text={r.sla1m !== null ? `${formatNum(r.sla1m, 1)}%` : "–"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

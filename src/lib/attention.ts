import type { AgentKPI } from './dataProcessor';
import { formatNum, getKpiStatus, KPI_TARGETS, type KpiType } from './utils';

/** "Perlu perhatian" on Summary: KPIs under target (worst first) and the CSAT SC agent with the lowest positive rate. */

export type AttentionItem = {
  key: string;
  title: string;
  value: string;
  target: string;
  gap: string;
  level: 'miss' | 'watch';
  /** Relative shortfall, (value − target) ÷ target; the list is sorted by it, most negative first. */
  rel: number;
};

type AttentionDef = { key: string; title: string; type: KpiType; stat: string; unit: string; dec: number };

const DEFS: AttentionDef[] = [
  { key: 'csatFair', title: 'CSAT SC After Takeout', type: 'csatFair', stat: 'csatScFair', unit: '%', dec: 1 },
  { key: 'csatFull', title: 'CSAT SC Full', type: 'csatFull', stat: 'csatScFull', unit: '%', dec: 1 },
  { key: 'csatOfficial', title: 'CSAT Official', type: 'csatOfficial', stat: 'csat', unit: '', dec: 2 },
  { key: 'qa', title: 'QA Score', type: 'qa', stat: 'qa', unit: '%', dec: 1 },
  { key: 'attendance', title: 'Attendance', type: 'attendance', stat: 'attendance', unit: '%', dec: 1 },
  { key: 'sla1m', title: 'SLA 1 Menit', type: 'sla1m', stat: 'sla1m', unit: '%', dec: 1 },
  { key: 'sla3m', title: 'SLA 3 Menit', type: 'sla3m', stat: 'sla3m', unit: '%', dec: 1 },
  { key: 'whu', title: 'WHU', type: 'whu', stat: 'whu', unit: '%', dec: 1 },
  { key: 'productivity', title: 'Avg Productivity', type: 'productivity', stat: 'avgProductivity', unit: '', dec: 0 },
];

/** KPIs whose status is `miss` or `watch`, most under target first. */
export function buildAttentionItems(stats: Record<string, number | null | undefined>): AttentionItem[] {
  const items: AttentionItem[] = [];
  DEFS.forEach((d) => {
    const val = stats[d.stat];
    if (val === null || val === undefined || Number.isNaN(val)) return;
    const status = getKpiStatus(val, d.type);
    if (status !== 'miss' && status !== 'watch') return;
    const target = KPI_TARGETS[d.type];
    items.push({
      key: d.key, title: d.title, level: status, rel: (val - target) / target,
      value: `${formatNum(val, d.dec)}${d.unit}`, target: `${formatNum(target, d.type === 'csatOfficial' ? 2 : 0)}${d.unit}`,
      gap: `−${formatNum(Math.abs(val - target), d.dec)}`,
    });
  });
  return items.sort((a, b) => a.rel - b.rel);
}

export type LowestAgent = { name: string; pct: number; n: number };

/** Agent with the lowest CSAT SC good-rate among those with at least `minResponses` valid responses. */
export function lowestCsatScAgent(data: AgentKPI[], minResponses = 30): LowestAgent | null {
  let best: LowestAgent | null = null;
  data.forEach((a) => {
    const n = a.csatScTotalValid || 0;
    if (n < minResponses) return;
    const pct = ((a.csatScGoodCount || 0) / n) * 100;
    if (!best || pct < best.pct) best = { name: a.name || a.csId, pct, n };
  });
  return best;
}

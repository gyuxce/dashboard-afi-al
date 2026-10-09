/** Theme color refs for Recharts/SVG — resolve via CSS vars (light/dark aware). */
export const chart = {
  primary: 'var(--color-primary)',
  primarySoft: 'var(--color-primary-soft)',
  danger: 'var(--color-danger)',
  dangerSoft: 'var(--color-danger-soft)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  muted: 'var(--color-text-muted)',
  secondary: 'var(--color-text-secondary)',
  disabled: 'var(--color-text-disabled)',
  card: 'var(--color-card)',
  border: 'var(--color-border)',
  text: 'var(--color-text-primary)',
  surfaceMuted: 'var(--color-surface-muted)',
  kpiProd: 'var(--color-kpi-productivity)',
  kpiCsat: 'var(--color-kpi-csat)',
  kpiQa: 'var(--color-kpi-qa)',
  kpiSla: 'var(--color-kpi-sla)',
  kpiWhu: 'var(--color-kpi-whu)',
  kpiNeutral: 'var(--color-kpi-neutral)',
} as const;

export type ChartColor = (typeof chart)[keyof typeof chart];

/** KPI theme → chart stroke/fill for summary cards & series. */
export function kpiThemeColor(theme: string): string {
  switch (theme) {
    case 'productivity':
      return chart.kpiProd;
    case 'productivity-avg':
      return chart.primary;
    case 'csat':
      return chart.kpiCsat;
    case 'qa':
      return chart.kpiQa;
    case 'sla':
      return chart.kpiSla;
    case 'whu':
      return chart.kpiWhu;
    case 'neutral':
    default:
      return chart.kpiNeutral;
  }
}

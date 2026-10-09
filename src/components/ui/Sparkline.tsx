import { useId } from 'react';

/**
 * Tiny inline trend line for a KPI card / table row. Draws a `currentColor`
 * stroke plus a faint `currentColor` area wash so the parent controls the tint
 * (neutral by default, status colour when it matters). A hollow ring marks the
 * lowest day; a filled dot marks the latest. Nulls bridge rather than drop to
 * zero.
 */
export function Sparkline({
  values,
  height = 26,
  className = '',
  strokeWidth = 1.5,
}: {
  values: Array<number | null | undefined>;
  height?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const gid = `spark-${useId().replace(/:/g, '')}`;

  const clean = values.filter(
    (v): v is number => typeof v === 'number' && !Number.isNaN(v),
  );
  if (clean.length < 2) return null;

  const W = 160; // nominal viewBox width; SVG stretches to the container
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const stepX = W / (values.length - 1);
  const pad = 2;
  const toY = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);

  let d = '';
  let firstX: number | null = null;
  let lastX = 0;
  let minIdx = -1;
  let minVal = Infinity;
  values.forEach((v, i) => {
    if (typeof v !== 'number' || Number.isNaN(v)) return;
    const x = i * stepX;
    if (firstX === null) firstX = x;
    lastX = x;
    d += `${d ? ' L' : 'M'}${x.toFixed(1)},${toY(v).toFixed(1)}`;
    if (v < minVal) { minVal = v; minIdx = i; }
  });

  const lastVal = clean[clean.length - 1];
  const lastY = toY(lastVal);
  const areaD = `${d} L${lastX.toFixed(1)},${height} L${(firstX ?? 0).toFixed(1)},${height} Z`;

  const minX = minIdx * stepX;
  const minY = toY(minVal);
  const showMinDot = minIdx >= 0 && minIdx !== values.length - 1 && Math.abs(minX - lastX) > 0.5;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gid})`} stroke="none" />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showMinDot && (
        <circle
          cx={minX.toFixed(1)}
          cy={minY.toFixed(1)}
          r="2"
          fill="var(--color-card)"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="2.4" fill="currentColor" />
    </svg>
  );
}

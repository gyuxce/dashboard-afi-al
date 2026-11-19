/** A display string such as `63.121`, `95,83%`, `+12.998`, `Rp 34.285.600` split into what can be animated and what stays. */
export type ParsedNumber = { prefix: string; target: number; decimals: number; suffix: string };

/**
 * Splits an Indonesian-formatted display string into prefix / number / suffix. Returns null when the text is not a
 * single plain number (ranges, dates, "3,62 / 5"), so those stay static instead of animating half of them.
 */
export function parseAnimatedNumber(text: string): ParsedNumber | null {
  const match = /^([^\d]*?)(\d[\d.,]*)([^\d]*)$/.exec(text);
  if (!match) return null;
  const [, prefix, raw, suffix] = match;
  let normalized: string;
  let decimals = 0;
  if (raw.includes(',')) {
    const [intPart, decPart = ''] = raw.split(',');
    if (decPart.includes('.') || raw.split(',').length > 2) return null;
    normalized = `${intPart.replace(/\./g, '')}.${decPart}`;
    decimals = decPart.length;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '');
  } else if (/^\d+\.\d+$/.test(raw)) {
    normalized = raw;
    decimals = raw.split('.')[1].length;
  } else if (/^\d+$/.test(raw)) {
    normalized = raw;
  } else {
    return null;
  }
  const target = Number(normalized);
  if (!Number.isFinite(target)) return null;
  return { prefix, target, decimals, suffix };
}

/** Same formatting as `formatNum`: Indonesian grouping and decimal comma. */
export function formatAnimatedNumber(p: Pick<ParsedNumber, 'prefix' | 'decimals' | 'suffix'>, value: number): string {
  const body = value.toLocaleString('id-ID', { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals });
  return `${p.prefix}${body}${p.suffix}`;
}

/** Cubic ease-out, 0 → 1. */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

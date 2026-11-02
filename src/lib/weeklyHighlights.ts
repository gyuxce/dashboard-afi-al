import type { TopAgent, TopCategory } from './csatWeekly';

/**
 * Draft "Highlight" bullets for the weekly deck, in Indonesian, short and derived only from the
 * numbers on the slide, so they can be pasted without retyping.
 */

const nf = (x: number, digits = 2) => x.toFixed(digits);
const pts = (x: number) => nf(Math.abs(x));
const count = (x: number) => String(x);
const moved = (delta: number, up: string, down: string, flat: string) =>
  Math.abs(delta) < 0.005 ? flat : delta > 0 ? up : down;

type RateCol = { label: string; full: number | null; fair: number | null };

export function positiveRateHighlights(cols: RateCol[], targets: { full: number; fair: number }): string[] {
  const last = cols[cols.length - 1];
  const prev = cols.length > 1 ? cols[cols.length - 2] : null;
  if (!last) return [];
  const lines: string[] = [];
  if (last.full !== null && last.fair !== null) {
    lines.push(`Positive rate ${last.label}: Before Takeout ${nf(last.full)}%, After Takeout ${nf(last.fair)}%.`);
  }
  if (prev && last.full !== null && prev.full !== null) {
    const d = last.full - prev.full;
    lines.push(`Before Takeout ${moved(d, 'naik', 'turun', 'tetap')} ${pts(d)} poin dari ${prev.label} (${nf(prev.full)}% ke ${nf(last.full)}%).`);
  }
  if (prev && last.fair !== null && prev.fair !== null) {
    const d = last.fair - prev.fair;
    lines.push(`After Takeout ${moved(d, 'naik', 'turun', 'tetap')} ${pts(d)} poin dari ${prev.label} (${nf(prev.fair)}% ke ${nf(last.fair)}%).`);
  }
  if (last.full !== null && last.fair !== null) {
    const fullOk = last.full >= targets.full;
    const fairOk = last.fair >= targets.fair;
    lines.push(
      fullOk && fairOk
        ? `Kedua angka sudah mencapai target (${targets.full}% dan ${targets.fair}%).`
        : !fullOk && !fairOk
          ? `Kedua angka masih di bawah target (${targets.full}% dan ${targets.fair}%).`
          : fullOk
            ? `Before Takeout sudah mencapai target ${targets.full}%, After Takeout belum (target ${targets.fair}%).`
            : `After Takeout sudah mencapai target ${targets.fair}%, Before Takeout belum (target ${targets.full}%).`,
    );
  }
  return lines;
}

type RespCol = { label: string; respondents: number; rate: number };

export function respondentHighlights(cols: RespCol[], daily: { label: string; respondents: number }[]): string[] {
  const last = cols[cols.length - 1];
  const prev = cols.length > 1 ? cols[cols.length - 2] : null;
  if (!last) return [];
  const lines: string[] = [];
  if (prev) {
    const d = last.respondents - prev.respondents;
    lines.push(
      d === 0
        ? `Total responden ${last.label} tetap ${count(last.respondents)}.`
        : `Total responden ${last.label} ${d > 0 ? 'naik' : 'turun'} dari ${count(prev.respondents)} ke ${count(last.respondents)} (${d > 0 ? '+' : '-'}${count(Math.abs(d))}).`,
    );
    lines.push(`Response rate ${nf(last.rate, 1)}% (${prev.label}: ${nf(prev.rate, 1)}%).`);
  } else {
    lines.push(`Total responden ${last.label}: ${count(last.respondents)}, response rate ${nf(last.rate, 1)}%.`);
  }
  if (daily.length > 1) {
    const hi = daily.reduce((a, b) => (b.respondents > a.respondents ? b : a));
    const lo = daily.reduce((a, b) => (b.respondents < a.respondents ? b : a));
    lines.push(`Hari tersibuk ${hi.label} (${hi.respondents}), tersepi ${lo.label} (${lo.respondents}).`);
  }
  return lines;
}

type CatCol = { label: string; top: TopCategory[]; totalBad: number; takeoutBad: number };

export function categoryHighlights(cols: CatCol[]): string[] {
  const last = cols[cols.length - 1];
  const prev = cols.length > 1 ? cols[cols.length - 2] : null;
  if (!last || last.top.length === 0) return [];
  const lines: string[] = [];
  const top = last.top[0];
  const share = last.totalBad > 0 ? (top.count / last.totalBad) * 100 : 0;
  lines.push(`Kategori DSAT terbanyak ${last.label}: ${top.name}, ${top.count} rating buruk (${nf(share, 1)}% dari ${last.totalBad}).`);
  if (last.totalBad > 0) {
    lines.push(`Kategori takeout menyumbang ${nf((last.takeoutBad / last.totalBad) * 100, 1)}% rating buruk (${last.takeoutBad} dari ${last.totalBad}).`);
  }
  if (prev) {
    const before = new Map(prev.top.map((c) => [c.name.toLowerCase(), c.count]));
    let best: { name: string; from: number; to: number } | null = null;
    last.top.forEach((c) => {
      const was = before.get(c.name.toLowerCase());
      if (was === undefined) return;
      if (!best || Math.abs(c.count - was) > Math.abs(best.to - best.from)) best = { name: c.name, from: was, to: c.count };
    });
    const mover = best as { name: string; from: number; to: number } | null;
    if (mover && mover.from !== mover.to) {
      lines.push(`${mover.name} ${mover.to > mover.from ? 'naik' : 'turun'} dari ${mover.from} ke ${mover.to} dibanding ${prev.label}.`);
    }
  }
  return lines;
}

type AgentCol = { label: string; agents: TopAgent[] };

export function agentHighlights(cols: AgentCol[]): string[] {
  const last = cols[cols.length - 1];
  const prev = cols.length > 1 ? cols[cols.length - 2] : null;
  if (!last || last.agents.length === 0) return [];
  const lines: string[] = [];
  const first = last.agents[0];
  const reason = first.topCategories[0];
  lines.push(
    `${first.name} paling banyak rating 1–2 di ${last.label}: ${first.badCount}${reason ? `, terutama ${reason.name} (${reason.count})` : ''}.`,
  );
  if (prev) {
    const prevIds = new Set(prev.agents.map((a) => a.csId));
    const repeats = last.agents.filter((a) => prevIds.has(a.csId)).map((a) => a.name);
    lines.push(
      repeats.length > 0
        ? `Masuk lima teratas juga di ${prev.label}: ${repeats.join(', ')}.`
        : `Tidak ada agent yang sama dengan daftar ${prev.label}.`,
    );
  }
  const reasons = new Map<string, number>();
  last.agents.forEach((a) => {
    const name = a.topCategories[0]?.name;
    if (name) reasons.set(name, (reasons.get(name) || 0) + 1);
  });
  const common = Array.from(reasons.entries()).sort((a, b) => b[1] - a[1])[0];
  if (common && common[1] > 1) lines.push(`${common[0]} jadi penyebab utama ${common[1]} dari ${last.agents.length} agent.`);
  return lines;
}

type HeadCol = { label: string; agents: number; teamLeaders: number; turnover: number };

export function headcountHighlights(
  bpoLabel: string,
  cols: HeadCol[],
  qc: number,
  trainer: number,
  threshold: number,
): string[] {
  const last = cols[cols.length - 1];
  if (!last) return [];
  const staff = [qc > 0 ? `${qc} QC` : '', trainer > 0 ? `${trainer} Trainer` : '', `${last.teamLeaders} TL`].filter(Boolean);
  const lines = [
    `Turn over ${last.label}: ${nf(last.turnover, 1).replace(/\.0$/, '')}%${last.turnover > threshold ? ` (di atas batas ${threshold}%)` : ''}.`,
    `Total ${last.agents} agent Live Chat ${bpoLabel}, ${staff.join(' & ')}.`,
  ];
  const prev = cols.length > 1 ? cols[cols.length - 2] : null;
  if (prev && prev.agents !== last.agents) {
    lines.push(`Agent ${last.agents > prev.agents ? 'naik' : 'turun'} dari ${prev.agents} ke ${last.agents} dibanding ${prev.label}.`);
  }
  return lines;
}

type OverviewItem = {
  label: string;
  /** Value as printed in the table, e.g. "66,44%". */
  text: string;
  /** Has a target and the value misses it. */
  miss: boolean;
  hasTarget: boolean;
  /** Change from the previous week, only for percent/score KPIs (null otherwise). */
  delta: number | null;
};

export function overviewHighlights(weekLabel: string, prevLabel: string | null, items: OverviewItem[]): string[] {
  const withTarget = items.filter((i) => i.hasTarget);
  if (withTarget.length === 0) return [];
  const missed = withTarget.filter((i) => i.miss);
  const lines: string[] = [];
  lines.push(`${withTarget.length - missed.length} dari ${withTarget.length} KPI bertarget sudah tercapai di ${weekLabel}.`);
  if (missed.length > 0) {
    const shown = missed.slice(0, 4).map((i) => `${i.label} ${i.text}`).join(', ');
    lines.push(`Di bawah target: ${shown}${missed.length > 4 ? `, dan ${missed.length - 4} lainnya` : ''}.`);
  }
  if (prevLabel) {
    const moves = items.filter((i) => i.delta !== null && Math.abs(i.delta) >= 0.005) as (OverviewItem & { delta: number })[];
    const up = moves.filter((i) => i.delta > 0).sort((a, b) => b.delta - a.delta)[0];
    const down = moves.filter((i) => i.delta < 0).sort((a, b) => a.delta - b.delta)[0];
    if (up) lines.push(`Naik terbesar dari ${prevLabel}: ${up.label} (+${pts(up.delta)} poin).`);
    if (down) lines.push(`Turun terbesar dari ${prevLabel}: ${down.label} (-${pts(down.delta)} poin).`);
  }
  return lines;
}

type TlItem = { name: string; dsat: number; analyzed: number | null };

export function tlSamplingHighlights(weekLabel: string, tls: TlItem[]): string[] {
  const totalDsat = tls.reduce((s, t) => s + t.dsat, 0);
  const entered = tls.filter((t) => t.analyzed !== null);
  if (totalDsat === 0) return [`Tidak ada DSAT (rating 1–2) di ${weekLabel}.`];
  if (entered.length === 0) {
    return [`Total DSAT ${weekLabel}: ${count(totalDsat)}.`, 'Belum ada DSAT yang dianalisis TL minggu ini.'];
  }
  const analyzed = entered.reduce((s, t) => s + (t.analyzed ?? 0), 0);
  const lines = [`Total DSAT ${weekLabel}: ${count(totalDsat)}, sudah dianalisis TL ${count(analyzed)} (${nf((analyzed / totalDsat) * 100, 1)}%).`];
  const ranked = entered
    .filter((t) => t.dsat > 0)
    .map((t) => ({ name: t.name, pct: ((t.analyzed ?? 0) / t.dsat) * 100 }))
    .sort((a, b) => a.pct - b.pct);
  if (ranked.length > 1) {
    lines.push(`Terendah: ${ranked[0].name} ${nf(ranked[0].pct, 1)}%, tertinggi: ${ranked[ranked.length - 1].name} ${nf(ranked[ranked.length - 1].pct, 1)}%.`);
  }
  const missing = tls.filter((t) => t.analyzed === null && t.dsat > 0).map((t) => t.name);
  if (missing.length > 0) lines.push(`Belum ada data sampling: ${missing.join(', ')}.`);
  return lines;
}

export type TakeoutSimRow = { label: string; a: number | null; b: number | null };

/**
 * `rows` are the scenarios in order (Full, After Takeout now, + extra categories…) for one month;
 * only the scenarios from index 2 onward are "additional takeout".
 */
export function takeoutSimHighlights(
  extraNames: string,
  months: { label: string; rows: TakeoutSimRow[] }[],
  target: number,
): string[] {
  const gainsA: number[] = [];
  const gapsAB: number[] = [];
  let bestFair = -Infinity;
  months.forEach((m) => {
    const base = m.rows[1];
    const all = m.rows[m.rows.length - 1];
    if (base?.a != null && all?.a != null) gainsA.push(all.a - base.a);
    m.rows.slice(1).forEach((r) => {
      if (r.a != null && r.b != null) gapsAB.push(r.a - r.b);
      if (r.a != null) bestFair = Math.max(bestFair, r.a);
    });
  });
  if (gainsA.length === 0) return [];
  const lines = [
    `Menambah ${extraNames} ke takeout menaikkan After Takeout ${nf(Math.min(...gainsA))}–${nf(Math.max(...gainsA))} poin (rumus A).`,
  ];
  if (gapsAB.length > 0) lines.push(`Rumus B selalu ${nf(Math.min(...gapsAB))}–${nf(Math.max(...gapsAB))} poin di bawah rumus A.`);
  lines.push(
    bestFair < target
      ? `Target After Takeout ${target}% belum tercapai di skenario mana pun.`
      : `Target After Takeout ${target}% tercapai di sebagian skenario.`,
  );
  return lines;
}

import { formatNum } from './utils';
import type { WeeklySummary } from './weeklySummary';
import {
  COLORS,
  FONT,
  beginSlide,
  canvasToPng,
  createSlideCanvas,
  fitText,
  frameLayout,
  layoutHighlights,
  roundRect,
  type SlideHeadline,
} from './slideExport';

/**
 * "Kesimpulan" slide: four cards (KPI vs target, change vs previous period, CSAT/DSAT, agents) and the
 * Highlight box with the same story in sentences. Numbers stay ink; only ▲/▼ are coloured, as on the Overview.
 */

const WIDTH = 1920;
const PAD = 72;
const GAP = 24;
const CARD_H = 332;
const BLUE = '#2456D6';
const CARD_BG = '#F6F8FA';

export type SummarySlide = {
  title: string;
  subtitle: string;
  headline?: SlideHeadline;
  bare?: boolean;
  summary: WeeklySummary;
  highlights?: string[];
};

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, title: string, accent: string) {
  ctx.fillStyle = CARD_BG;
  roundRect(ctx, x, y, w, CARD_H, 18);
  ctx.fill();
  ctx.fillStyle = accent;
  roundRect(ctx, x + 24, y + 26, 8, 26, 4);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `800 26px ${FONT}`;
  ctx.fillText(title, x + 46, y + 48);
}

const arrow = (ctx: CanvasRenderingContext2D, dir: 'up' | 'down', x: number, y: number, size = 24) => {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillStyle = dir === 'up' ? COLORS.up : COLORS.down;
  ctx.textAlign = 'left';
  ctx.fillText(dir === 'up' ? '▲' : '▼', x, y);
};

/** Volume changes (respondents, bad ratings) are neither good nor bad on their own: muted arrow, no red/green. */
const volumeDelta = (delta: number | null) => (delta === null || delta === 0 ? '' : `${delta > 0 ? '▲' : '▼'} ${formatNum(Math.abs(delta), 0)}`);

export async function renderSummarySlide(model: SummarySlide): Promise<Blob> {
  const s = model.summary;
  const hl = model.highlights?.length ? layoutHighlights(model.highlights) : null;
  // Same content-space origin as the other slides: beginSlide() shifts it for the headline / bare layout.
  const top = 150;
  const contentBottom = top + CARD_H * 2 + GAP;
  const height = Math.ceil(contentBottom + (hl ? hl.height + (model.bare ? 24 : 36) : 0) + (model.bare ? 52 : 90));
  const { off } = frameLayout(model);
  const { canvas, ctx } = await createSlideCanvas(WIDTH, height + off);
  beginSlide(ctx, model, model.title, model.subtitle);

  const cardW = (WIDTH - PAD * 2 - GAP) / 2;
  const x1 = PAD;
  const x2 = PAD + cardW + GAP;
  const y1 = top;
  const y2 = top + CARD_H + GAP;
  const inner = cardW - 46 - 28;

  /* ---- 1 · KPI vs target ---- */
  drawCard(ctx, x1, y1, cardW, 'Pencapaian KPI', BLUE);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `800 96px ${FONT}`;
  ctx.fillText(String(s.kpi.achieved), x1 + 46, y1 + 156);
  const bigW = ctx.measureText(String(s.kpi.achieved)).width;
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(`/ ${s.kpi.total}`, x1 + 46 + bigW + 12, y1 + 156);
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('KPI tercapai', x1 + 46, y1 + 196);
  ctx.font = `500 21px ${FONT}`;
  ctx.fillText(`di ${s.label}`, x1 + 46, y1 + 224);
  if (s.prevLabel && s.kpi.prevAchieved !== null) ctx.fillText(`${s.prevLabel}: ${s.kpi.prevAchieved} dari ${s.kpi.total}`, x1 + 46, y1 + 252);

  // Columns: KPI | Nilai | Target | Selisih (nilai − target). The target is printed so the gap can be checked at a glance.
  const listX = x1 + 46 + 215;
  const listW = cardW - 215 - 46 - 24;
  const gapR = listX + listW;
  const targetR = gapR - 110;
  const valueR = targetR - 96;
  const labelW = valueR - 100 - listX;
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 18px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(s.kpi.below.length ? 'KPI DI BAWAH TARGET' : 'STATUS', listX, y1 + 92);
  if (s.kpi.below.length > 0) {
    ctx.textAlign = 'right';
    ctx.fillText('NILAI', valueR, y1 + 92);
    ctx.fillText('TARGET', targetR, y1 + 92);
    ctx.fillText('SELISIH', gapR, y1 + 92);
  }
  if (s.kpi.below.length === 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText('Semua KPI bertarget tercapai', listX, y1 + 130);
  }
  s.kpi.below.slice(0, 4).forEach((b, i) => {
    const ly = y1 + 140 + i * 56;
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(fitText(ctx, b.label, labelW), listX, ly);
    ctx.textAlign = 'right';
    ctx.fillText(b.valueText, valueR, ly);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(b.targetText, targetR, ly);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(b.gapText, gapR, ly);
  });
  if (s.kpi.below.length > 4) {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText(`+${s.kpi.below.length - 4} KPI lainnya`, listX, y1 + 140 + 4 * 56);
  }

  /* ---- 2 · change vs previous period ---- */
  drawCard(ctx, x2, y1, cardW, s.prevLabel ? `Perubahan vs ${s.prevLabel}` : 'Perubahan', BLUE);
  const colW = (cardW - 46 - 28 - 40) / 2;
  (
    [
      { dir: 'up' as const, title: 'NAIK', items: s.moves.up, x: x2 + 46 },
      { dir: 'down' as const, title: 'TURUN', items: s.moves.down, x: x2 + 46 + colW + 40 },
    ]
  ).forEach((col) => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    arrow(ctx, col.dir, col.x, y1 + 92, 20);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText(col.title, col.x + 30, y1 + 92);
    if (col.items.length === 0) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `500 22px ${FONT}`;
      ctx.fillText('Tidak ada', col.x, y1 + 132);
    }
    col.items.forEach((m, i) => {
      const ly = y1 + 134 + i * 56;
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.ink;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText(fitText(ctx, m.label, colW), col.x, ly);
      ctx.fillStyle = COLORS.muted;
      ctx.font = `600 21px ${FONT}`;
      ctx.fillText(m.deltaText, col.x, ly + 26);
    });
  });
  // productivity line (counts, no "poin")
  ctx.fillStyle = '#E3E8EE';
  ctx.fillRect(x2 + 46, y1 + CARD_H - 52, cardW - 46 - 28, 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 22px ${FONT}`;
  let px = x2 + 46;
  s.moves.productivity.forEach((p) => {
    const label = `${p.label} ${p.valueText}`;
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(label, px, y1 + CARD_H - 18);
    let w = ctx.measureText(label).width;
    if (p.delta !== null && p.delta !== 0) {
      const dir = p.delta > 0 ? 'up' : 'down';
      arrow(ctx, dir, px + w + 10, y1 + CARD_H - 18, 18);
      ctx.fillStyle = COLORS.muted;
      ctx.font = `600 20px ${FONT}`;
      const t = formatNum(Math.abs(p.delta), 0);
      ctx.fillText(t, px + w + 34, y1 + CARD_H - 18);
      w += 34 + ctx.measureText(t).width;
    }
    px += w + 40;
  });

  /* ---- 3 · CSAT / DSAT (After Takeout) ---- */
  drawCard(ctx, x1, y2, cardW, 'CSAT & DSAT · After Takeout', BLUE);
  const tiles = [
    { label: 'RESPONDEN', value: formatNum(s.csat.respondents, 0), delta: s.csat.respondentsDelta, sub: '' },
    {
      label: 'RATING 1–2',
      value: formatNum(s.csat.bad, 0),
      delta: s.csat.badDelta,
      sub: s.csat.badShare !== null ? `${formatNum(s.csat.badShare, 1)}% dari responden` : '',
    },
  ];
  tiles.forEach((t, i) => {
    const tx = x1 + 46 + i * 330;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText(t.label, tx, y2 + 92);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `800 80px ${FONT}`;
    ctx.fillText(t.value, tx, y2 + 168);
    const vw = ctx.measureText(t.value).width;
    const d = volumeDelta(t.delta);
    if (d) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `600 22px ${FONT}`;
      ctx.fillText(d, tx + vw + 14, y2 + 166);
    }
    if (t.sub) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `500 20px ${FONT}`;
      ctx.fillText(t.sub, tx, y2 + 204);
    }
  });
  ctx.fillStyle = '#E3E8EE';
  ctx.fillRect(x1 + 46, y2 + CARD_H - 74, cardW - 46 - 28, 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 19px ${FONT}`;
  ctx.fillText('PENYEBAB UTAMA', x1 + 46, y2 + CARD_H - 44);
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(
    fitText(ctx, s.csat.topCategory ? `${s.csat.topCategory.name} · ${s.csat.topCategory.count} rating` : 'Tidak ada rating 1–2', inner - 210),
    x1 + 46 + 210,
    y2 + CARD_H - 44,
  );

  /* ---- 4 · agents ---- */
  drawCard(ctx, x2, y2, cardW, 'Agent perlu perhatian', BLUE);
  if (s.agents.top.length === 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText('Tidak ada rating 1–2 pada agent.', x2 + 46, y2 + 110);
  }
  s.agents.top.forEach((a, i) => {
    const ly = y2 + 118 + i * 62;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText(String(i + 1), x2 + 46, ly);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 30px ${FONT}`;
    const nameW = Math.min(ctx.measureText(a.name).width, inner - 220);
    ctx.fillText(fitText(ctx, a.name, inner - 220), x2 + 82, ly);
    if (a.repeated) {
      const tagX = x2 + 82 + nameW + 14;
      ctx.fillStyle = '#FFF1D6';
      roundRect(ctx, tagX, ly - 24, 100, 32, 16);
      ctx.fill();
      ctx.fillStyle = '#8A5A00';
      ctx.font = `700 18px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('berulang', tagX + 50, ly - 2);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `800 36px ${FONT}`;
    ctx.fillText(String(a.bad), x2 + cardW - 28, ly);
  });
  if (s.agents.commonCause) {
    ctx.fillStyle = '#E3E8EE';
    ctx.fillRect(x2 + 46, y2 + CARD_H - 74, cardW - 46 - 28, 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText('PENYEBAB UMUM', x2 + 46, y2 + CARD_H - 44);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(
      fitText(ctx, `${s.agents.commonCause.name} · ${s.agents.commonCause.agents} dari ${s.agents.commonCause.of} agent`, inner - 190),
      x2 + 46 + 190,
      y2 + CARD_H - 44,
    );
  }

  hl?.draw(ctx, contentBottom + 24);
  return canvasToPng(canvas);
}

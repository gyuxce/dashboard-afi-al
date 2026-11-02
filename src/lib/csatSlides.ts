import type { DailyRespondents, RespondentStats, TakeoutScenario, TopAgent, TopCategory } from './csatWeekly';
import {
  COLORS,
  FONT,
  canvasToPng,
  createSlideCanvas,
  drawSlideHeader,
  drawHeadline,
  fitText,
  headlineOffset,
  layoutHighlights,
  roundRect,
  type SlideHeadline,
} from './slideExport';

/**
 * Presentation images for the weekly CSAT slides. Each function draws one slide on a white canvas,
 * large type, same palette as the Weekly Performance Report export.
 */

export type SlideWeek = {
  /** "W5 Okt" */
  label: string;
  /** "26 Okt–1 Nov" */
  span: string;
};

const WIDTH = 1920;
const PAD = 72;
const GAP = 24;

const SERIES = { full: '#5E7089', fair: '#E5A100' };
const STAR_COLORS = ['#C0261B', '#E0672A', '#E5A100', '#7BB661', '#0E7C66'];

/** Text with a white outline so grid lines and targets never cut through value labels. */
function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#FFFFFF';
  ctx.strokeText(text, x, y);
  ctx.restore();
  ctx.fillText(text, x, y);
}

function columnWidth(n: number) {
  return (WIDTH - PAD * 2 - GAP * (n - 1)) / n;
}

function drawWeekChip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, week: SlideWeek, hot: boolean) {
  ctx.fillStyle = hot ? '#FBE4E1' : '#EEF2F6';
  roundRect(ctx, x, y, w, 64, 12);
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = hot ? COLORS.miss : COLORS.ink;
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(week.label, x + w / 2, y + 24);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 18px ${FONT}`;
  ctx.fillText(week.span, x + w / 2, y + 48);
  ctx.textBaseline = 'alphabetic';
}

/** Wraps `text` into at most `maxLines` lines, ellipsising the last one. */
function wrapClamp(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (line && ctx.measureText(next).width > maxWidth) {
      if (lines.length === maxLines - 1) {
        lines.push(fitText(ctx, [line, ...words.slice(i)].join(' '), maxWidth));
        return lines;
      }
      lines.push(line);
      line = words[i];
    } else {
      line = next;
    }
  }
  if (line) lines.push(fitText(ctx, line, maxWidth));
  return lines;
}

/* ------------------------------------------------------------------ */
/* Slide: top categories with bad ratings, one column per week         */
/* ------------------------------------------------------------------ */

export type CategoriesSlide = {
  title: string;
  subtitle: string;
  headline?: SlideHeadline;
  columns: (SlideWeek & { rows: TopCategory[] })[];
  highlights?: string[];
};

export async function renderCategoriesSlide(model: CategoriesSlide): Promise<Blob> {
  const n = Math.max(model.columns.length, 1);
  const rowsMax = Math.max(1, ...model.columns.map((c) => c.rows.length));
  const colW = columnWidth(n);
  const rowH = 80;
  const top = 178;
  const tableTop = top + 64 + 18;
  const headH = 52;
  const contentBottom = tableTop + headH + rowH * rowsMax;
  const hl = model.highlights?.length ? layoutHighlights(model.highlights) : null;
  const height = Math.ceil(contentBottom + (hl ? hl.height + 36 : 0) + 90);
  const off = headlineOffset(model.headline);
  const { canvas, ctx } = await createSlideCanvas(WIDTH, height + off);

  drawSlideHeader(ctx, model.title, model.subtitle);
  drawHeadline(ctx, model.headline);
  ctx.translate(0, off);

  model.columns.forEach((col, ci) => {
    const x = PAD + ci * (colW + GAP);
    drawWeekChip(ctx, x, top, colW, col, ci === n - 1);

    // header
    ctx.fillStyle = '#F2F5F8';
    roundRect(ctx, x, tableTop, colW, headH, 10);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 19px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('#', x + 14, tableTop + headH / 2);
    ctx.fillText('Category', x + 52, tableTop + headH / 2);
    ctx.textAlign = 'right';
    ctx.fillText('Freq', x + colW - 108, tableTop + headH / 2);
    ctx.fillText('Good %', x + colW - 14, tableTop + headH / 2);

    const catW = colW - 52 - 108 - 52;
    col.rows.forEach((row, ri) => {
      const y = tableTop + headH + ri * rowH;
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(x, y + rowH - 1, colW, 1);
      const mid = y + rowH / 2;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.muted;
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(String(row.rank), x + 14, mid);

      ctx.font = `600 21px ${FONT}`;
      ctx.fillStyle = row.isTakeout ? COLORS.miss : COLORS.ink;
      const lines = wrapClamp(ctx, row.name, catW, 3);
      const lineH = 25;
      lines.forEach((line, li) => {
        ctx.fillText(line, x + 52, mid - ((lines.length - 1) * lineH) / 2 + li * lineH);
      });

      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.ink;
      ctx.font = `700 25px ${FONT}`;
      ctx.fillText(String(row.count), x + colW - 108, mid);
      ctx.fillStyle = COLORS.muted;
      ctx.font = `600 21px ${FONT}`;
      ctx.fillText(row.goodPct === null ? '-' : `${row.goodPct.toFixed(1)}%`, x + colW - 14, mid);
    });
  });

  hl?.draw(ctx, contentBottom + 28);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText(
    'Freq = jumlah rating 1–2. Good % = porsi rating 4–5 pada kategori itu. Merah = kategori takeout.',
    PAD,
    height - 36,
  );
  return canvasToPng(canvas);
}

/* ------------------------------------------------------------------ */
/* Slide: top agents with bad ratings, one column per week             */
/* ------------------------------------------------------------------ */

export type AgentsSlide = {
  title: string;
  subtitle: string;
  headline?: SlideHeadline;
  columns: (SlideWeek & { agents: TopAgent[]; repeatIds?: ReadonlySet<string> })[];
  highlights?: string[];
};

export async function renderAgentsSlide(model: AgentsSlide): Promise<Blob> {
  const n = Math.max(model.columns.length, 1);
  const agentsMax = Math.max(1, ...model.columns.map((c) => c.agents.length));
  const colW = columnWidth(n);
  const blockH = 156;
  const top = 178;
  const listTop = top + 64 + 18;
  const contentBottom = listTop + blockH * agentsMax;
  const hl = model.highlights?.length ? layoutHighlights(model.highlights) : null;
  const height = Math.ceil(contentBottom + (hl ? hl.height + 36 : 0) + 90);
  const off = headlineOffset(model.headline);
  const { canvas, ctx } = await createSlideCanvas(WIDTH, height + off);

  drawSlideHeader(ctx, model.title, model.subtitle);
  drawHeadline(ctx, model.headline);
  ctx.translate(0, off);

  model.columns.forEach((col, ci) => {
    const x = PAD + ci * (colW + GAP);
    drawWeekChip(ctx, x, top, colW, col, ci === n - 1);

    col.agents.forEach((agent, ai) => {
      const y = listTop + ai * blockH;
      ctx.fillStyle = ai % 2 === 0 ? '#F6F8FA' : '#FFFFFF';
      roundRect(ctx, x, y, colW, blockH - 8, 10);
      ctx.fill();

      const repeated = col.repeatIds?.has(agent.csId) ?? false;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.muted;
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(String(ai + 1), x + 16, y + 38);

      ctx.fillStyle = repeated ? COLORS.miss : COLORS.ink;
      ctx.font = `700 26px ${FONT}`;
      ctx.fillText(fitText(ctx, agent.name, colW - 48 - 70), x + 48, y + 38);

      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.ink;
      ctx.font = `700 30px ${FONT}`;
      ctx.fillText(String(agent.badCount), x + colW - 16, y + 38);

      ctx.font = `500 20px ${FONT}`;
      agent.topCategories.forEach((cat, k) => {
        const ly = y + 74 + k * 28;
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(fitText(ctx, cat.name, colW - 48 - 60), x + 48, ly);
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.ink;
        ctx.fillText(String(cat.count), x + colW - 16, ly);
      });
    });
  });

  hl?.draw(ctx, contentBottom + 20);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText(
    'Angka besar = jumlah rating 1–2 per agent. Nama merah = juga masuk 5 teratas minggu sebelumnya.',
    PAD,
    height - 36,
  );
  return canvasToPng(canvas);
}

/* ------------------------------------------------------------------ */
/* Slide: respondents (cards per week + daily trend of the last week)  */
/* ------------------------------------------------------------------ */

export type RespondentsSlide = {
  title: string;
  subtitle: string;
  headline?: SlideHeadline;
  columns: (SlideWeek & { stats: RespondentStats; deltaFromPrevious: number | null })[];
  daily: { title: string; points: (DailyRespondents & { label: string })[] };
  highlights?: string[];
};

export async function renderRespondentsSlide(model: RespondentsSlide): Promise<Blob> {
  const contentBottom = 918;
  const hl = model.highlights?.length ? layoutHighlights(model.highlights) : null;
  const height = contentBottom + (hl ? hl.height + 36 : 0) + 82;
  const off = headlineOffset(model.headline);
  const { canvas, ctx } = await createSlideCanvas(WIDTH, height + off);
  drawSlideHeader(ctx, model.title, model.subtitle);
  drawHeadline(ctx, model.headline);
  ctx.translate(0, off);

  const gridTop = 178;
  const cardW = 440;
  const cardH = 360;
  const cardGap = 20;

  model.columns.slice(0, 4).forEach((col, i) => {
    const x = PAD + (i % 2) * (cardW + cardGap);
    const y = gridTop + Math.floor(i / 2) * (cardH + cardGap);
    const last = i === model.columns.length - 1;

    ctx.fillStyle = last ? '#FDF1EF' : '#F6F8FA';
    roundRect(ctx, x, y, cardW, cardH, 16);
    ctx.fill();

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(col.label, x + 24, y + 40);
    ctx.font = `500 17px ${FONT}`;
    ctx.fillText(col.span, x + 24, y + 64);

    ctx.fillStyle = COLORS.ink;
    ctx.font = `800 68px ${FONT}`;
    ctx.fillText(String(col.stats.respondents), x + 24, y + 140);

    // change vs previous week + response rate
    ctx.font = `700 22px ${FONT}`;
    if (col.deltaFromPrevious !== null && col.deltaFromPrevious !== 0) {
      const down = col.deltaFromPrevious < 0;
      ctx.fillStyle = down ? COLORS.down : COLORS.up;
      ctx.fillText(`${down ? '▼' : '▲'} ${Math.abs(col.deltaFromPrevious)}`, x + 24, y + 176);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText(`Rate ${col.stats.rate.toFixed(1)}%`, x + cardW - 24, y + 140);

    // star distribution
    const max = Math.max(1, ...col.stats.stars);
    const baseY = y + cardH - 56;
    const barAreaH = 90;
    const slot = (cardW - 48) / 5;
    col.stats.stars.forEach((count, s) => {
      const cx = x + 24 + slot * s + slot / 2;
      const h = Math.max(4, (count / max) * barAreaH);
      ctx.fillStyle = STAR_COLORS[s];
      roundRect(ctx, cx - 22, baseY - h, 44, h, Math.min(5, h / 2));
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.ink;
      ctx.font = `700 19px ${FONT}`;
      ctx.fillText(String(count), cx, baseY - h - 8);
      ctx.fillStyle = COLORS.muted;
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText(`${s + 1}★`, cx, baseY + 28);
    });
  });

  // daily trend (area chart) on the right
  const chartX = PAD + cardW * 2 + cardGap + 56;
  const chartW = WIDTH - PAD - chartX;
  const chartTop = gridTop + 70;
  const chartH = cardH * 2 + cardGap - 70 - 60;
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(model.daily.title, chartX, gridTop + 30);

  const pts = model.daily.points;
  if (pts.length > 0) {
    const maxV = Math.max(...pts.map((p) => p.respondents));
    const niceMax = Math.ceil(maxV / 40) * 40 || 40;
    const plotL = chartX + 56;
    const plotR = chartX + chartW - 24;
    const plotT = chartTop + 20;
    const plotB = chartTop + chartH;
    ctx.font = `500 17px ${FONT}`;
    for (let g = 0; g <= 4; g++) {
      const v = (niceMax / 4) * g;
      const gy = plotB - (v / niceMax) * (plotB - plotT);
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(plotL, gy, plotR - plotL, 1);
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(v)), plotL - 10, gy + 6);
    }
    const stepX = pts.length > 1 ? (plotR - plotL) / (pts.length - 1) : 0;
    const px = (i: number) => (pts.length > 1 ? plotL + stepX * i : (plotL + plotR) / 2);
    const py = (v: number) => plotB - (v / niceMax) * (plotB - plotT);

    ctx.beginPath();
    ctx.moveTo(px(0), plotB);
    pts.forEach((p, i) => ctx.lineTo(px(i), py(p.respondents)));
    ctx.lineTo(px(pts.length - 1), plotB);
    ctx.closePath();
    ctx.fillStyle = 'rgba(229, 161, 0, 0.18)';
    ctx.fill();

    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(px(i), py(p.respondents)) : ctx.lineTo(px(i), py(p.respondents))));
    ctx.strokeStyle = SERIES.fair;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke();

    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(px(i), py(p.respondents), 6, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = SERIES.fair;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.ink;
      ctx.font = `700 21px ${FONT}`;
      haloText(ctx, String(p.respondents), px(i), py(p.respondents) - 16);
      ctx.fillStyle = COLORS.muted;
      ctx.font = `500 17px ${FONT}`;
      ctx.fillText(p.label, px(i), plotB + 28);
    });
  }

  hl?.draw(ctx, contentBottom + 28);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText(
    'Responden = jumlah rating 1–5 yang masuk. Rate = responden ÷ tiket yang diproses. Panah = selisih dari minggu sebelumnya.',
    PAD,
    height - 36,
  );
  return canvasToPng(canvas);
}

/* ------------------------------------------------------------------ */
/* Slide: positive rate before / after takeout                         */
/* ------------------------------------------------------------------ */

export type PositiveRateSlide = {
  title: string;
  subtitle: string;
  headline?: SlideHeadline;
  columns: (SlideWeek & { full: number | null; fair: number | null })[];
  targets: { full: number; fair: number };
  highlights?: string[];
};

export async function renderPositiveRateSlide(model: PositiveRateSlide): Promise<Blob> {
  const baseH = 960;
  const contentBottom = baseH - 70;
  const hl = model.highlights?.length ? layoutHighlights(model.highlights) : null;
  const height = baseH + (hl ? hl.height + 36 : 0);
  const off = headlineOffset(model.headline);
  const { canvas, ctx } = await createSlideCanvas(WIDTH, height + off);
  drawSlideHeader(ctx, model.title, model.subtitle);
  drawHeadline(ctx, model.headline);
  ctx.translate(0, off);

  // legend
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 22px ${FONT}`;
  ctx.textAlign = 'left';
  let lx = PAD + 26;
  [
    { color: SERIES.full, text: `Before Takeout (Full) · target ${model.targets.full}%` },
    { color: SERIES.fair, text: `After Takeout · target ${model.targets.fair}%` },
  ].forEach((item) => {
    ctx.fillStyle = item.color;
    roundRect(ctx, lx, 172, 22, 22, 5);
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(item.text, lx + 34, 191);
    lx += 34 + ctx.measureText(item.text).width + 48;
  });

  const plotL = PAD + 70;
  const plotR = WIDTH - PAD;
  const plotT = 240;
  const plotB = baseH - 200;
  const y = (v: number) => plotB - (v / 100) * (plotB - plotT);

  ctx.font = `500 19px ${FONT}`;
  for (let v = 0; v <= 100; v += 25) {
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(plotL, y(v), plotR - plotL, 1);
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'right';
    ctx.fillText(String(v), plotL - 12, y(v) + 6);
  }

  // target lines
  [
    { v: model.targets.full, color: SERIES.full, label: `target ${model.targets.full}%` },
    { v: model.targets.fair, color: SERIES.fair, label: `target ${model.targets.fair}%` },
  ].forEach((t) => {
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plotL, y(t.v));
    ctx.lineTo(plotR, y(t.v));
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = t.color;
    ctx.textAlign = 'right';
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(t.label, plotR, y(t.v) - 8);
  });

  const n = Math.max(model.columns.length, 1);
  const slot = (plotR - plotL) / n;
  const barW = Math.min(110, slot * 0.28);
  model.columns.forEach((col, i) => {
    const cx = plotL + slot * i + slot / 2;
    [
      { v: col.full, color: SERIES.full, x: cx - barW - 8 },
      { v: col.fair, color: SERIES.fair, x: cx + 8 },
    ].forEach((bar) => {
      if (bar.v === null) return;
      const top = y(bar.v);
      ctx.fillStyle = bar.color;
      roundRect(ctx, bar.x, top, barW, plotB - top, 6);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.ink;
      ctx.font = `800 28px ${FONT}`;
      haloText(ctx, bar.v.toFixed(2) + '%', bar.x + barW / 2, top - 14);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(col.label, cx, plotB + 44);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText(col.span, cx, plotB + 74);

    // change from previous week
    const prev = i > 0 ? model.columns[i - 1] : null;
    if (prev) {
      const parts: string[] = [];
      if (col.full !== null && prev.full !== null) parts.push(`Full ${col.full - prev.full >= 0 ? '▲ +' : '▼ '}${(col.full - prev.full).toFixed(2)}`);
      if (col.fair !== null && prev.fair !== null) parts.push(`After ${col.fair - prev.fair >= 0 ? '▲ +' : '▼ '}${(col.fair - prev.fair).toFixed(2)}`);
      ctx.fillStyle = COLORS.muted;
      ctx.font = `600 19px ${FONT}`;
      ctx.fillText(parts.join('   '), cx, plotB + 112);
    }
  });

  hl?.draw(ctx, contentBottom + 12);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText(
    'Positive rate = rating 4–5 ÷ (rating 1–2 + 4–5), rating 3 diabaikan. After Takeout membuang 3 kategori takeout. Panah = selisih dari minggu sebelumnya (poin).',
    PAD,
    height - 36,
  );
  return canvasToPng(canvas);
}

/* ------------------------------------------------------------------ */
/* Slide: headcount + turnover                                         */
/* ------------------------------------------------------------------ */

export type HeadcountSlide = {
  title: string;
  subtitle: string;
  headline?: SlideHeadline;
  columns: (SlideWeek & {
    teamLeaders: number;
    agents: number;
    trainer: number;
    qc: number;
    /** Turnover in percent for the week. */
    turnover: number;
  })[];
  /** Turnover threshold in percent (dashed line). */
  threshold: number;
  highlights?: string[];
};

export async function renderHeadcountSlide(model: HeadcountSlide): Promise<Blob> {
  const baseH = 700;
  const contentBottom = baseH - 40;
  const hl = model.highlights?.length ? layoutHighlights(model.highlights) : null;
  const height = baseH + (hl ? hl.height + 36 : 0);
  const off = headlineOffset(model.headline);
  const { canvas, ctx } = await createSlideCanvas(WIDTH, height + off);
  drawSlideHeader(ctx, model.title, model.subtitle);
  drawHeadline(ctx, model.headline);
  ctx.translate(0, off);

  const n = Math.max(model.columns.length, 1);
  const top = 190;

  // Left: turnover rate bars with the threshold line
  const chartX = PAD;
  const chartW = 760;
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText('Turn over rate', chartX, top + 28);

  const plotL = chartX + 64;
  const plotR = chartX + chartW;
  const plotT = top + 70;
  const plotB = contentBottom - 90;
  const maxV = Math.max(model.threshold * 2, ...model.columns.map((c) => c.turnover));
  const niceMax = Math.ceil(maxV / 5) * 5;
  const y = (v: number) => plotB - (v / niceMax) * (plotB - plotT);

  ctx.font = `500 18px ${FONT}`;
  for (let g = 0; g <= 4; g++) {
    const v = (niceMax / 4) * g;
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(plotL, y(v), plotR - plotL, 1);
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'right';
    ctx.fillText(`${Number.isInteger(v) ? v : v.toFixed(1)}%`, plotL - 10, y(v) + 6);
  }
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(plotL, y(model.threshold));
  ctx.lineTo(plotR, y(model.threshold));
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = 'right';
  ctx.font = `700 18px ${FONT}`;
  ctx.fillText(`Threshold ${model.threshold}%`, plotR, y(model.threshold) - 8);

  const slot = (plotR - plotL) / n;
  const barW = Math.min(90, slot * 0.5);
  model.columns.forEach((col, i) => {
    const cx = plotL + slot * i + slot / 2;
    const h = Math.max(3, plotB - y(col.turnover));
    ctx.fillStyle = col.turnover > model.threshold ? COLORS.miss : SERIES.full;
    roundRect(ctx, cx - barW / 2, plotB - h, barW, h, Math.min(6, h / 2));
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `800 26px ${FONT}`;
    haloText(ctx, `${col.turnover.toFixed(1).replace(/\.0$/, '')}%`, cx, plotB - h - 12);
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(col.label, cx, plotB + 36);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 17px ${FONT}`;
    ctx.fillText(col.span, cx, plotB + 62);
  });

  // Right: headcount table
  const tableX = chartX + chartW + 60;
  const tableW = WIDTH - PAD - tableX;
  const labelW = 150;
  const colW = (tableW - labelW) / n;
  const headH = 84;
  const rowH = 76;
  const rows: { label: string; pick: (c: HeadcountSlide['columns'][number]) => number }[] = [
    { label: 'TL', pick: (c) => c.teamLeaders },
    { label: 'Agent', pick: (c) => c.agents },
    { label: 'Trainer', pick: (c) => c.trainer },
    { label: 'QC', pick: (c) => c.qc },
  ];

  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, tableX, top, tableW, 52, 10);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(model.title.replace(/^Headcount /, 'Headcount '), tableX + tableW / 2, top + 35);

  const hy = top + 64;
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'left';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText('Skill', tableX + 16, hy + 36);
  model.columns.forEach((col, i) => {
    const rx = tableX + labelW + colW * (i + 1) - 14;
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(col.label, rx, hy + 30);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText(col.span, rx, hy + 54);
  });
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(tableX, hy + headH - 14, tableW, 2);

  rows.forEach((row, r) => {
    const ry = hy + headH + r * rowH;
    if (r % 2 === 1) {
      ctx.fillStyle = '#F6F8FA';
      ctx.fillRect(tableX, ry - 8, tableW, rowH);
    }
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(tableX, ry - 8 + rowH - 1, tableW, 1);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(row.label, tableX + 16, ry + rowH / 2 - 8);
    model.columns.forEach((col, i) => {
      const value = row.pick(col);
      ctx.textAlign = 'right';
      ctx.fillStyle = value > 0 ? COLORS.ink : COLORS.muted;
      ctx.font = `700 32px ${FONT}`;
      ctx.fillText(value > 0 ? String(value) : '–', tableX + labelW + colW * (i + 1) - 14, ry + rowH / 2 - 8);
    });
    ctx.textBaseline = 'alphabetic';
  });

  hl?.draw(ctx, contentBottom + 8);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText(
    'TL dan Agent dihitung dari jadwal (punya man-day di minggu itu). Trainer, QC, dan turn over diisi manual.',
    PAD,
    height - 28,
  );
  return canvasToPng(canvas);
}

/* ------------------------------------------------------------------ */
/* Slide: DSAT analysed by team leaders (sampling)                     */
/* ------------------------------------------------------------------ */

export type TlSamplingSlide = {
  title: string;
  subtitle: string;
  headline?: SlideHeadline;
  rows: {
    name: string;
    dsat: number;
    /** The categories behind this team's DSAT, so the slide is useful before any sampling. */
    topCategories: { name: string; count: number }[];
    /** null = no sampling entered yet */
    analyzed: number | null;
  }[];
  highlights?: string[];
};

export async function renderTlSamplingSlide(model: TlSamplingSlide): Promise<Blob> {
  const rowH = 128;
  const top = 190;
  const headH = 60;
  const rows = model.rows;
  const contentBottom = top + headH + rowH * (rows.length + 1) + 10;
  const hl = model.highlights?.length ? layoutHighlights(model.highlights) : null;
  const height = Math.ceil(contentBottom + (hl ? hl.height + 36 : 0) + 90);
  const off = headlineOffset(model.headline);
  const { canvas, ctx } = await createSlideCanvas(WIDTH, height + off);
  drawSlideHeader(ctx, model.title, model.subtitle);
  drawHeadline(ctx, model.headline);
  ctx.translate(0, off);

  const nameX = PAD + 16;
  const dsatRight = PAD + 400;
  const causeX = PAD + 440;
  const causeW = 600;
  const analyzedRight = PAD + 1290;
  const barL = PAD + 1340;
  const pctRight = WIDTH - PAD - 16;
  const barR = pctRight - 150;

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F2F5F8';
  roundRect(ctx, PAD, top, WIDTH - PAD * 2, headH, 10);
  ctx.fill();
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 21px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('Team Leader', nameX, top + headH / 2);
  ctx.textAlign = 'right';
  ctx.fillText('DSAT (1–2)', dsatRight, top + headH / 2);
  ctx.textAlign = 'left';
  ctx.fillText('Penyebab terbanyak', causeX, top + headH / 2);
  ctx.textAlign = 'right';
  ctx.fillText('Dianalisis', analyzedRight, top + headH / 2);
  ctx.textAlign = 'left';
  ctx.fillText('% Dianalisis', barL, top + headH / 2);

  const totalDsat = rows.reduce((sum, r) => sum + r.dsat, 0);
  const maxDsat = Math.max(1, ...rows.map((r) => r.dsat));
  const entered = rows.filter((r) => r.analyzed !== null);
  const totalAnalyzed = entered.reduce((sum, r) => sum + (r.analyzed ?? 0), 0);
  const all = [
    ...rows.map((r) => ({ ...r, total: false })),
    { name: 'Total', dsat: totalDsat, topCategories: [], analyzed: entered.length ? totalAnalyzed : null, total: true },
  ];

  all.forEach((row, i) => {
    const y = top + headH + i * rowH;
    const mid = y + rowH / 2;
    if (row.total) {
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(PAD, y, WIDTH - PAD * 2, 2);
    } else {
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(PAD, y + rowH - 1, WIDTH - PAD * 2, 1);
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `${row.total ? 800 : 700} 29px ${FONT}`;
    ctx.fillText(row.name, nameX, mid);

    // DSAT count with a small bar relative to the biggest team
    ctx.textAlign = 'right';
    ctx.font = `800 32px ${FONT}`;
    ctx.fillText(String(row.dsat), dsatRight, row.total ? mid : mid - 12);
    if (!row.total) {
      const w = Math.max(6, (row.dsat / maxDsat) * 130);
      ctx.fillStyle = '#F2B8B2';
      roundRect(ctx, dsatRight - w, mid + 16, w, 10, 5);
      ctx.fill();
    }

    // causes
    if (row.topCategories.length) {
      ctx.textAlign = 'left';
      row.topCategories.forEach((c, k) => {
        const ly = mid - 28 + k * 28;
        ctx.fillStyle = COLORS.muted;
        ctx.font = `500 21px ${FONT}`;
        ctx.fillText(fitText(ctx, c.name, causeW - 70), causeX, ly);
        ctx.fillStyle = COLORS.ink;
        ctx.font = `700 21px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.fillText(String(c.count), causeX + causeW, ly);
        ctx.textAlign = 'left';
      });
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = row.analyzed === null ? COLORS.muted : COLORS.ink;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(row.analyzed === null ? '–' : String(row.analyzed), analyzedRight, mid);

    ctx.fillStyle = '#E8EEF4';
    roundRect(ctx, barL, mid - 14, barR - barL, 28, 14);
    ctx.fill();
    if (row.analyzed === null || row.dsat === 0) {
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.muted;
      ctx.font = `500 21px ${FONT}`;
      ctx.fillText(row.analyzed === null ? 'belum ada sampling' : '', barL + 16, mid);
    } else {
      const pct = Math.min(100, (row.analyzed / row.dsat) * 100);
      ctx.fillStyle = pct >= 100 ? '#0E7C66' : pct >= 50 ? '#E5A100' : COLORS.miss;
      if (pct > 0) {
        roundRect(ctx, barL, mid - 14, Math.max(14, ((barR - barL) * pct) / 100), 28, 14);
        ctx.fill();
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.ink;
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(`${pct.toFixed(1)}%`, pctRight, mid);
    }
    ctx.textBaseline = 'alphabetic';
  });

  hl?.draw(ctx, contentBottom + 20);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText(
    '% Dianalisis = DSAT yang dianalisis TL ÷ total DSAT tim TL itu. Penyebab terbanyak dari data; jumlah dianalisis diisi manual dari hasil sampling.',
    PAD,
    height - 36,
  );
  return canvasToPng(canvas);
}

/* ------------------------------------------------------------------ */
/* Slide: takeout simulation (extra categories), per month             */
/* ------------------------------------------------------------------ */

export type TakeoutSimSlide = {
  title: string;
  subtitle: string;
  headline?: SlideHeadline;
  months: { label: string; rows: TakeoutScenario[] }[];
  highlights?: string[];
};

export async function renderTakeoutSimSlide(model: TakeoutSimSlide): Promise<Blob> {
  const n = Math.max(model.months.length, 1);
  const scenarioCount = Math.max(1, ...model.months.map((m) => m.rows.length));
  const labelW = 470;
  const respW = 120;
  const groupW = (WIDTH - PAD * 2 - labelW) / n;
  const valW = (groupW - respW) / 2;
  const top = 190;
  const monthH = 56;
  const subH = 52;
  const rowH = 100;
  const contentBottom = top + monthH + subH + rowH * scenarioCount;
  const hl = model.highlights?.length ? layoutHighlights(model.highlights) : null;
  const height = Math.ceil(contentBottom + (hl ? hl.height + 36 : 0) + 90);
  const off = headlineOffset(model.headline);
  const { canvas, ctx } = await createSlideCanvas(WIDTH, height + off);
  drawSlideHeader(ctx, model.title, model.subtitle);
  drawHeadline(ctx, model.headline);
  ctx.translate(0, off);

  // legend of the two formulas
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `600 22px ${FONT}`;
  let lx = PAD + 26;
  [
    { tag: 'A', color: '#2456D6', text: 'good ÷ (good + bad), rating 3 diabaikan' },
    { tag: 'B', color: '#B4540A', text: 'good ÷ total responden, rating 3 ikut dihitung' },
  ].forEach((item) => {
    ctx.fillStyle = item.color;
    roundRect(ctx, lx, 150, 30, 30, 6);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(item.tag, lx + 15, 172);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(item.text, lx + 42, 172);
    lx += 42 + ctx.measureText(item.text).width + 44;
  });

  const tableLeft = PAD + labelW;
  model.months.forEach((m, mi) => {
    const gx = tableLeft + groupW * mi;
    ctx.fillStyle = '#F2F5F8';
    roundRect(ctx, gx + 4, top, groupW - 8, monthH, 10);
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 28px ${FONT}`;
    ctx.fillText(m.label, gx + groupW / 2, top + monthH / 2);
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'right';
    ctx.fillText('Resp', gx + respW - 14, top + monthH + subH / 2);
    ctx.fillStyle = '#2456D6';
    ctx.fillText('A', gx + respW + valW - 14, top + monthH + subH / 2);
    ctx.fillStyle = '#B4540A';
    ctx.fillText('B', gx + respW + valW * 2 - 14, top + monthH + subH / 2);
  });
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('Skenario', PAD + 16, top + monthH + subH / 2);
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(PAD, top + monthH + subH - 2, WIDTH - PAD * 2, 2);

  const labels = model.months[0]?.rows ?? [];
  const subLabels = ['tanpa takeout', '3 kategori dibuang'];
  labels.forEach((row, ri) => {
    const y = top + monthH + subH + ri * rowH;
    const mid = y + rowH / 2;
    const isBase = ri === 1;
    const isLast = ri === labels.length - 1;
    if (isBase) {
      ctx.fillStyle = '#FFF6D6';
      ctx.fillRect(PAD, y, WIDTH - PAD * 2, rowH);
      ctx.fillStyle = '#E0B000';
      ctx.fillRect(PAD, y, 6, rowH);
    } else if (isLast) {
      ctx.fillStyle = COLORS.up;
      ctx.fillRect(PAD, y, 6, rowH);
    }
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(PAD, y + rowH - 1, WIDTH - PAD * 2, 1);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(row.label, PAD + 22, subLabels[ri] ? mid - 14 : mid);
    if (subLabels[ri]) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `500 19px ${FONT}`;
      ctx.fillText(subLabels[ri], PAD + 22, mid + 16);
    }

    model.months.forEach((m, mi) => {
      const cell = m.rows[ri];
      if (!cell) return;
      const gx = tableLeft + groupW * mi;
      const base = m.rows[1];
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.muted;
      ctx.font = `500 22px ${FONT}`;
      ctx.fillText(String(cell.respondents), gx + respW - 14, mid);

      [
        { v: cell.a, baseV: base?.a ?? null, x: gx + respW + valW - 14 },
        { v: cell.b, baseV: base?.b ?? null, x: gx + respW + valW * 2 - 14 },
      ].forEach((c) => {
        if (c.v === null) return;
        const showDelta = ri >= 2 && c.baseV !== null;
        ctx.fillStyle = COLORS.ink;
        ctx.font = `800 31px ${FONT}`;
        ctx.fillText(`${c.v.toFixed(2)}%`, c.x, showDelta ? mid - 12 : mid);
        if (showDelta) {
          ctx.fillStyle = COLORS.up;
          ctx.font = `700 19px ${FONT}`;
          ctx.fillText(`▲ +${(c.v - (c.baseV as number)).toFixed(2)}`, c.x, mid + 22);
        }
      });
    });
    ctx.textBaseline = 'alphabetic';
  });

  hl?.draw(ctx, contentBottom + 24);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText(
    'Resp = responden yang tersisa. Panah = selisih dari After Takeout sekarang. Good = rating 4–5, bad = rating 1–2.',
    PAD,
    height - 36,
  );
  return canvasToPng(canvas);
}

/* ------------------------------------------------------------------ */
/* Slide 1: three key numbers under the date band                      */
/* ------------------------------------------------------------------ */

export type ChipTone = 'good' | 'warn' | 'bad' | 'neutral';

const CHIP_STYLE: Record<ChipTone, { bg: string; fg: string }> = {
  good: { bg: '#E4F4EE', fg: '#0B5F4D' },
  warn: { bg: '#FFF1D6', fg: '#8A5A00' },
  bad: { bg: '#FBE7E4', fg: '#9E1D14' },
  neutral: { bg: '#EDF1F5', fg: '#13202D' },
};

export type SnapshotSlide = {
  caption: string;
  chips: { label: string; value: string; note?: string; tone: ChipTone }[];
};

export async function renderSnapshotChips(model: SnapshotSlide): Promise<Blob> {
  const n = Math.max(model.chips.length, 1);
  const width = 1400;
  const pad = 20;
  const gap = 20;
  const chipW = (width - pad * 2 - gap * (n - 1)) / n;
  const height = 250;
  const { canvas, ctx } = await createSlideCanvas(width, height);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(model.caption, pad, 44);

  model.chips.forEach((chip, i) => {
    const x = pad + i * (chipW + gap);
    const y = 68;
    const style = CHIP_STYLE[chip.tone];
    ctx.fillStyle = style.bg;
    roundRect(ctx, x, y, chipW, 150, 18);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 22px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(chip.label, x + 26, y + 40);
    ctx.fillStyle = style.fg;
    ctx.font = `800 58px ${FONT}`;
    ctx.fillText(chip.value, x + 26, y + 100);
    if (chip.note) {
      ctx.fillStyle = style.fg;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText(chip.note, x + 26, y + 132);
    }
  });
  return canvasToPng(canvas);
}

/* ------------------------------------------------------------------ */
/* Slide 2: one status line per section of the table of contents       */
/* ------------------------------------------------------------------ */

export type SectionSummarySlide = {
  rows: { section: string; headline: string; detail: string; tone: ChipTone }[];
};

export async function renderSectionSummary(model: SectionSummarySlide): Promise<Blob> {
  const rowH = 170;
  const width = 980;
  const pad = 12;
  const height = rowH * model.rows.length + pad * 2;
  const { canvas, ctx } = await createSlideCanvas(width, height);

  model.rows.forEach((row, i) => {
    const y = pad + i * rowH;
    const style = CHIP_STYLE[row.tone];
    ctx.fillStyle = style.bg;
    roundRect(ctx, pad, y + 8, width - pad * 2, rowH - 16, 18);
    ctx.fill();
    ctx.fillStyle = style.fg;
    ctx.beginPath();
    ctx.arc(pad + 38, y + rowH / 2, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText(row.section.toUpperCase(), pad + 70, y + 52);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(fitText(ctx, row.headline, width - pad * 2 - 100), pad + 70, y + 94);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 23px ${FONT}`;
    ctx.fillText(fitText(ctx, row.detail, width - pad * 2 - 100), pad + 70, y + 128);
  });
  return canvasToPng(canvas);
}

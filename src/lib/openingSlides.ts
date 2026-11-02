import { COLORS, FONT, canvasToPng, createSlideCanvas, fitText, roundRect } from './slideExport';
import { SLIDE_H, SLIDE_W, getLogo } from './slideFrame';

/**
 * Opening slides of the weekly deck (cover and agenda), drawn as full 1920×1080 pictures.
 * Palette follows the Akulaku logo red and the colours of the agenda funnel in the template.
 */

const RED = '#E31E24';
const RED_DEEP = '#A9121A';
const INK = COLORS.ink;

/** ISO week number of a yyyy-mm-dd date. */
export function isoWeekNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
}

/** Largest font size (≤ max, ≥ min) at which `text` fits `maxWidth`; weight and family stay as set. */
function fitFontSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, max: number, min: number): number {
  for (let size = max; size > min; size -= 2) {
    ctx.font = `800 ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return min;
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  // letterSpacing is not in every canvas implementation; ignore it where missing.
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = `${px}px`;
}

/* ------------------------------------------------------------------ */
/* Slide 1: cover                                                      */
/* ------------------------------------------------------------------ */

export type CoverModel = {
  title: string;
  subtitle: string;
  /** "AFI - NSI" */
  scope: string;
  /** "26 Oct - 1 Nov 2026" or "1 - 31 Oct 2026" */
  period: string;
  /** "Week 5 · Oct" or "October 2026" */
  week: string;
  /** Small caps line above the title, e.g. "REVIEW MINGGUAN". */
  eyebrow: string;
};

export async function renderCoverSlide(model: CoverModel): Promise<Blob> {
  const [logo, { canvas, ctx }] = await Promise.all([getLogo(), createSlideCanvas(SLIDE_W, SLIDE_H)]);

  // soft backdrop
  const bg = ctx.createLinearGradient(0, 0, SLIDE_W, SLIDE_H);
  bg.addColorStop(0, '#FFFFFF');
  bg.addColorStop(1, '#FDEEEC');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);

  // red panel on the right, rounded on its left edge
  const panelX = 1040;
  const r = 150;
  ctx.beginPath();
  ctx.moveTo(panelX + r, 0);
  ctx.lineTo(SLIDE_W, 0);
  ctx.lineTo(SLIDE_W, SLIDE_H);
  ctx.lineTo(panelX + r, SLIDE_H);
  ctx.arcTo(panelX, SLIDE_H, panelX, SLIDE_H - r, r);
  ctx.lineTo(panelX, r);
  ctx.arcTo(panelX, 0, panelX + r, 0, r);
  ctx.closePath();
  const grad = ctx.createLinearGradient(panelX, 0, SLIDE_W, SLIDE_H);
  grad.addColorStop(0, RED);
  grad.addColorStop(1, RED_DEEP);
  ctx.fillStyle = grad;
  ctx.fill();

  // concentric rings (echo of the logo disc)
  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX, 0, SLIDE_W - panelX, SLIDE_H);
  ctx.clip();
  const cx = 1500;
  const cy = 470;
  [520, 400, 280].forEach((radius, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + i * 0.05})`;
    ctx.lineWidth = i === 2 ? 3 : 2;
    ctx.stroke();
  });
  ctx.restore();

  // rising bars + trend line: the KPI motif
  const baseY = 800;
  const bars = [150, 230, 200, 330, 430];
  const barW = 92;
  const gap = 38;
  const startX = 1210;
  const tops: { x: number; y: number }[] = [];
  bars.forEach((h, i) => {
    const x = startX + i * (barW + gap);
    const last = i === bars.length - 1;
    ctx.fillStyle = last ? '#FFFFFF' : 'rgba(255,255,255,0.28)';
    roundRect(ctx, x, baseY - h, barW, h, 18);
    ctx.fill();
    tops.push({ x: x + barW / 2, y: baseY - h });
  });
  ctx.beginPath();
  tops.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y - 46) : ctx.lineTo(p.x, p.y - 46)));
  ctx.strokeStyle = '#FFE08A';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  tops.forEach((p, i) => {
    const last = i === tops.length - 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 46, last ? 17 : 11, 0, Math.PI * 2);
    ctx.fillStyle = last ? '#FFE08A' : '#FFFFFF';
    ctx.fill();
    if (last) {
      ctx.beginPath();
      ctx.arc(p.x, p.y - 46, 34, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,224,138,0.55)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  });
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(startX - 30, baseY + 2, bars.length * (barW + gap) - gap + 60, 4);

  // logo
  const logoH = 74;
  ctx.drawImage(logo, 110, 96, (logo.width / logo.height) * logoH, logoH);

  // titles
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setSpacing(ctx, 6);
  ctx.fillStyle = RED;
  ctx.font = `800 28px ${FONT}`;
  ctx.fillText(model.eyebrow, 110, 330);
  setSpacing(ctx, 0);

  ctx.fillStyle = INK;
  ctx.font = `800 ${fitFontSize(ctx, model.title, 900, 156, 80)}px ${FONT}`;
  ctx.fillText(model.title, 104, 480);
  ctx.fillStyle = RED;
  ctx.font = `800 ${fitFontSize(ctx, model.subtitle, 900, 82, 44)}px ${FONT}`;
  ctx.fillText(model.subtitle, 110, 584);

  // scope pill
  ctx.font = `800 52px ${FONT}`;
  const scopeW = ctx.measureText(model.scope).width + 80;
  ctx.fillStyle = INK;
  roundRect(ctx, 110, 650, scopeW, 94, 47);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.fillText(model.scope, 150, 699);

  // period row
  ctx.font = `700 42px ${FONT}`;
  const periodW = ctx.measureText(model.period).width + 72;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 110, 800, periodW, 88, 44);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#F3C9C6';
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillText(model.period, 146, 845);

  ctx.font = `800 36px ${FONT}`;
  const weekW = ctx.measureText(model.week).width + 64;
  ctx.fillStyle = RED;
  roundRect(ctx, 110 + periodW + 20, 800, weekW, 88, 44);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(model.week, 110 + periodW + 20 + 32, 845);

  return canvasToPng(canvas);
}

/* ------------------------------------------------------------------ */
/* Slide 2: agenda / table of contents                                 */
/* ------------------------------------------------------------------ */

export type AgendaRow = {
  name: string;
  description: string;
  /** "Slide 3", "Slide 5–10" */
  slides: string;
};

export type AgendaModel = {
  title: string;
  scope: string;
  period: string;
  week: string;
  eyebrow: string;
  rows: AgendaRow[];
};

// Same colours as the funnel in the template: red, yellow, cyan, blue, navy.
const AGENDA_COLORS = [
  { fill: '#EE4545', tint: '#FDECEC', onFill: '#FFFFFF' },
  { fill: '#F5C84B', tint: '#FEF6DC', onFill: INK },
  { fill: '#5BC8E6', tint: '#E4F6FB', onFill: INK },
  { fill: '#4EA3EE', tint: '#E5F1FD', onFill: '#FFFFFF' },
  { fill: '#23527C', tint: '#E3ECF4', onFill: '#FFFFFF' },
];

export async function renderAgendaSlide(model: AgendaModel): Promise<Blob> {
  const [logo, { canvas, ctx }] = await Promise.all([getLogo(), createSlideCanvas(SLIDE_W, SLIDE_H)]);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);

  // left column: red block with the title
  const colW = 640;
  const grad = ctx.createLinearGradient(0, 0, colW, SLIDE_H);
  grad.addColorStop(0, RED);
  grad.addColorStop(1, RED_DEEP);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(colW - 120, 0);
  ctx.arcTo(colW, 0, colW, 120, 120);
  ctx.lineTo(colW, SLIDE_H - 120);
  ctx.arcTo(colW, SLIDE_H, colW - 120, SLIDE_H, 120);
  ctx.lineTo(0, SLIDE_H);
  ctx.closePath();
  ctx.fill();

  // rings, clipped to the block
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, colW, SLIDE_H);
  ctx.clip();
  [420, 300, 180].forEach((radius, i) => {
    ctx.beginPath();
    ctx.arc(60, SLIDE_H - 80, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + i * 0.05})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setSpacing(ctx, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `800 26px ${FONT}`;
  ctx.fillText(model.eyebrow, 90, 360);
  setSpacing(ctx, 0);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 104px ${FONT}`;
  ctx.fillText(fitText(ctx, model.title, colW - 140), 84, 470);
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(model.scope, 90, 540);

  ctx.font = `700 30px ${FONT}`;
  const periodW = ctx.measureText(model.period).width + 56;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, 90, 584, periodW, 66, 33);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.fillText(model.period, 118, 617);
  ctx.font = `800 28px ${FONT}`;
  const weekW = ctx.measureText(model.week).width + 48;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 90, 668, weekW, 62, 31);
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.fillText(model.week, 114, 700);

  // logo in a white chip at the top of the block
  const logoH = 52;
  const logoW = (logo.width / logo.height) * logoH;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 90, 124, logoW + 48, logoH + 36, 28);
  ctx.fill();
  ctx.drawImage(logo, 114, 142, logoW, logoH);

  // agenda rows
  const rowX = 720;
  const rowW = SLIDE_W - rowX - 90;
  const n = Math.max(model.rows.length, 1);
  const gap = 22;
  const rowH = Math.min(150, (SLIDE_H - 150 - gap * (n - 1)) / n);
  const top = (SLIDE_H - (rowH * n + gap * (n - 1))) / 2;

  model.rows.forEach((row, i) => {
    const c = AGENDA_COLORS[i % AGENDA_COLORS.length];
    const y = top + i * (rowH + gap);

    ctx.save();
    ctx.shadowColor = 'rgba(19,32,45,0.10)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = c.tint;
    roundRect(ctx, rowX, y, rowW, rowH, 40);
    ctx.fill();
    ctx.restore();

    // number block
    ctx.fillStyle = c.fill;
    roundRect(ctx, rowX, y, rowH, rowH, 40);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.onFill;
    ctx.font = `800 62px ${FONT}`;
    ctx.fillText(String(i + 1).padStart(2, '0'), rowX + rowH / 2, y + rowH / 2 + 3);

    // slide pill geometry first, so the text can use all the space left of it
    ctx.font = `800 28px ${FONT}`;
    const pillW = ctx.measureText(row.slides).width + 56;
    const pillX = rowX + rowW - 36 - 62 - 20 - pillW;
    const textX = rowX + rowH + 36;
    const textW = pillX - textX - 28;

    // text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = INK;
    ctx.font = `800 50px ${FONT}`;
    ctx.fillText(fitText(ctx, row.name, textW), textX, y + rowH / 2 - 2);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(fitText(ctx, row.description, textW), textX, y + rowH / 2 + 38);

    // slide pill + arrow
    ctx.font = `800 28px ${FONT}`;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, pillX, y + rowH / 2 - 32, pillW, 64, 32);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.slides, pillX + pillW / 2, y + rowH / 2 + 2);

    const ax = rowX + rowW - 36 - 31;
    ctx.fillStyle = c.fill;
    ctx.beginPath();
    ctx.arc(ax, y + rowH / 2, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.onFill;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ax - 11, y + rowH / 2);
    ctx.lineTo(ax + 11, y + rowH / 2);
    ctx.moveTo(ax + 3, y + rowH / 2 - 9);
    ctx.lineTo(ax + 12, y + rowH / 2);
    ctx.lineTo(ax + 3, y + rowH / 2 + 9);
    ctx.stroke();
  });

  return canvasToPng(canvas);
}

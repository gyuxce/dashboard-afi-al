import logoUrl from '../assets/akulaku-logo.png';
import { COLORS, FONT, canvasToPng, createSlideCanvas, fitText, roundRect } from './slideExport';

/**
 * Full 16:9 slide (1920×1080, the Google Slides widescreen ratio) around a content image, in the
 * same look as the cover and agenda: soft warm backdrop, a coloured section pill, a big title,
 * the Akulaku logo and a white rounded card that holds the content.
 */

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

const RED = '#E31E24';

/** Section colours match the agenda: Headcount red, Overview yellow, KPI cyan, DSAT blue, Insight navy. */
const SECTION_ACCENTS: Record<string, { fill: string; on: string }> = {
  headcount: { fill: '#EE4545', on: '#FFFFFF' },
  overview: { fill: '#F5C84B', on: COLORS.ink },
  'kpi - csat': { fill: '#5BC8E6', on: COLORS.ink },
  dsat: { fill: '#4EA3EE', on: '#FFFFFF' },
  insight: { fill: '#23527C', on: '#FFFFFF' },
};
const accentFor = (section: string) => SECTION_ACCENTS[section.trim().toLowerCase()] ?? { fill: RED, on: '#FFFFFF' };

const CARD = { x: 72, y: 192, w: SLIDE_W - 144, h: 790 };
const AREA = { x: CARD.x + 22, y: CARD.y + 22, w: CARD.w - 44, h: CARD.h - 44 };

let logoPromise: Promise<HTMLImageElement> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = src;
  });
}

export const getLogo = () => (logoPromise ??= loadImage(logoUrl));

export type FrameOptions = {
  /** Text in the white tab, e.g. "KPI - CSAT". */
  section: string;
  /** Text in the red bar. */
  title: string;
  /** Small grey text in the footer, e.g. the period and data view. */
  caption?: string;
  /** The content picture (from the bare slide renderers). */
  content: Blob;
  /** Slide number shown in the footer. */
  no?: number;
};

export async function composeFullSlide(options: FrameOptions): Promise<Blob> {
  const { section, title, caption, content, no } = options;
  const [logo, bitmap] = await Promise.all([getLogo(), createImageBitmap(content)]);
  const { canvas, ctx } = await createSlideCanvas(SLIDE_W, SLIDE_H);
  const accent = accentFor(section);

  // warm backdrop with faint rings in the top-right corner
  const bg = ctx.createLinearGradient(0, 0, SLIDE_W, SLIDE_H);
  bg.addColorStop(0, '#FFFFFF');
  bg.addColorStop(1, '#FDEEEC');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
  [380, 280, 180].forEach((r) => {
    ctx.beginPath();
    ctx.arc(SLIDE_W - 30, 20, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(227,30,36,0.07)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // section pill + title
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `800 24px ${FONT}`;
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = '4px';
  const label = section.toUpperCase();
  const pillW = ctx.measureText(label).width + 60;
  ctx.fillStyle = accent.fill;
  roundRect(ctx, 72, 48, pillW, 50, 25);
  ctx.fill();
  ctx.fillStyle = accent.on;
  ctx.fillText(label, 102, 74);
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = '0px';

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `800 58px ${FONT}`;
  ctx.fillText(fitText(ctx, title, SLIDE_W - 144 - 360), 72, 160);

  // logo, top right
  const logoH = 54;
  const logoW = (logo.width / logo.height) * logoH;
  ctx.drawImage(logo, SLIDE_W - 72 - logoW, 54, logoW, logoH);

  // content card
  ctx.save();
  ctx.shadowColor = 'rgba(19,32,45,0.10)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 40);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#F6E4E2';
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 40);
  ctx.stroke();

  // content: fit inside the card, centred horizontally, top aligned
  const scale = Math.min(AREA.w / bitmap.width, AREA.h / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, AREA.x + (AREA.w - w) / 2, AREA.y, w, h);
  bitmap.close();

  // footer: caption and slide number
  ctx.textBaseline = 'middle';
  if (caption) {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(fitText(ctx, caption, SLIDE_W - 144 - 90), 72, 1036);
  }
  if (no !== undefined) {
    ctx.fillStyle = accent.fill;
    ctx.beginPath();
    ctx.arc(SLIDE_W - 72 - 24, 1036, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent.on;
    ctx.textAlign = 'center';
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(String(no), SLIDE_W - 72 - 24, 1038);
  }

  return canvasToPng(canvas);
}

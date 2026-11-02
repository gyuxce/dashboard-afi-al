import logoUrl from '../assets/akulaku-logo.png';
import { COLORS, FONT, canvasToPng, createSlideCanvas, fitText, roundRect } from './slideExport';

/**
 * Full 16:9 slide (1920×1080, the Google Slides widescreen ratio) around a content image:
 * red title bar with a white section tab, grey footer with the Akulaku logo and a caption.
 */

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

const BAR_RED = '#D93A2B';
const FOOTER_GREY = '#E8E8E8';

const AREA = { x: 72, y: 196, w: SLIDE_W - 144, h: 796 };

let logoPromise: Promise<HTMLImageElement> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = src;
  });
}

const getLogo = () => (logoPromise ??= loadImage(logoUrl));

export type FrameOptions = {
  /** Text in the white tab, e.g. "KPI - CSAT". */
  section: string;
  /** Text in the red bar. */
  title: string;
  /** Small grey text in the footer, e.g. the period and data view. */
  caption?: string;
  /** The content picture (from the bare slide renderers). */
  content: Blob;
};

export async function composeFullSlide(options: FrameOptions): Promise<Blob> {
  const { section, title, caption, content } = options;
  const [logo, bitmap] = await Promise.all([getLogo(), createImageBitmap(content)]);
  const { canvas, ctx } = await createSlideCanvas(SLIDE_W, SLIDE_H);

  // footer band + logo + caption
  const footerTop = 1008;
  ctx.fillStyle = FOOTER_GREY;
  ctx.fillRect(0, footerTop, SLIDE_W, SLIDE_H - footerTop);
  const logoH = 46;
  const logoW = (logo.width / logo.height) * logoH;
  ctx.drawImage(logo, SLIDE_W - 72 - logoW, footerTop + (SLIDE_H - footerTop - logoH) / 2, logoW, logoH);
  if (caption) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(fitText(ctx, caption, SLIDE_W - 144 - logoW - 40), 72, footerTop + (SLIDE_H - footerTop) / 2);
  }

  // title bar
  const barX = 150;
  const barY = 58;
  const barH = 104;
  const barW = SLIDE_W - 72 - barX;
  ctx.fillStyle = BAR_RED;
  roundRect(ctx, barX, barY, barW, barH, 30);
  ctx.fill();

  // section tab (overlaps the left end of the bar)
  const tabX = 56;
  const tabY = 44;
  const tabW = 430;
  const tabH = 132;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, tabX, tabY, tabW, tabH, 30);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `800 46px ${FONT}`;
  ctx.fillText(fitText(ctx, section, tabW - 64), tabX + tabW / 2, tabY + tabH / 2 + 2);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 50px ${FONT}`;
  const titleAreaL = tabX + tabW + 30;
  const titleAreaR = barX + barW - 40;
  ctx.fillText(fitText(ctx, title, titleAreaR - titleAreaL), (titleAreaL + titleAreaR) / 2, barY + barH / 2 + 2);

  // content: fit inside the white area, centred horizontally, top aligned
  const scale = Math.min(AREA.w / bitmap.width, AREA.h / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, AREA.x + (AREA.w - w) / 2, AREA.y, w, h);
  bitmap.close();

  return canvasToPng(canvas);
}

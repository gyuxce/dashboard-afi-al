/**
 * Renders a KPI comparison table as a presentation-ready PNG (white background, large type) so it
 * can be pasted straight into a slide instead of screenshotting the dark dashboard.
 *
 * Drawn on a canvas with fixed export colours: the image must look the same whatever theme the
 * dashboard is in, so these deliberately do not follow the CSS theme tokens.
 */

export type SlideTone = 'plain' | 'watch' | 'miss';

/** One-line takeaway shown above a slide's content. */
export type SlideHeadline = { text: string; tone: 'good' | 'bad' | 'warn' | 'neutral' };

export type SlideCell = { text: string; tone: SlideTone };

export type SlideColumn = {
  label: string;
  /** Second line under the label, e.g. "5–11 Okt". */
  sublabel?: string;
  /** Tinted column (the period the change column points at). */
  emphasis?: boolean;
};

export type SlideRow = {
  label: string;
  target: string;
  cells: SlideCell[];
  delta: { text: string; dir: 'up' | 'down' | 'flat' };
};

export type SlideModel = {
  title: string;
  subtitle: string;
  columns: SlideColumn[];
  rows: SlideRow[];
  deltaHeader: string;
  deltaSub: string;
  note?: string;
  /** Bullets for the "Highlight" box under the table. */
  highlights?: string[];
  headline?: SlideHeadline;
  /** Content only (no title block): the full-slide frame supplies the title. */
  bare?: boolean;
};

export const COLORS = {
  ink: '#13202D',
  muted: '#52606D',
  line: '#D8E0E8',
  zebra: '#F6F8FA',
  emphasis: '#FDECEA',
  accent: '#D93A2B',
  miss: '#C0261B',
  watch: '#B45309',
  up: '#0E7C66',
  down: '#C0261B',
};

export const FONT = '"Geist Sans", "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const WIDTH = 1920;
const SCALE = 2;
const PAD_X = 72;

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderTableSlide(model: SlideModel): Promise<Blob> {
  // The app font is a webfont; make sure it is loaded before measuring or drawing.
  try {
    await Promise.all([
      document.fonts.load(`700 30px "Geist Sans"`),
      document.fonts.load(`500 24px "Geist Sans"`),
    ]);
  } catch {
    /* fall back to the system stack */
  }

  const labelW = 470;
  const targetW = 130;
  const deltaW = 270;
  const valueCols = Math.max(model.columns.length, 1);
  const valueW = (WIDTH - PAD_X * 2 - labelW - targetW - deltaW) / valueCols;

  const headTop = 56;
  const titleH = 60;
  const subtitleH = 40;
  const tableTop = headTop + titleH + subtitleH + 28;
  const headRowH = model.bare ? 84 : 96;
  const rowH = model.bare ? 48 : 78;
  const noteSize = 20;

  // Measure the note first so the canvas height fits it.
  const measure = document.createElement('canvas').getContext('2d');
  let noteLines: string[] = [];
  if (measure && model.note && !model.bare) {
    measure.font = `400 ${noteSize}px ${FONT}`;
    noteLines = wrapLines(measure, model.note, WIDTH - PAD_X * 2);
  }
  const noteH = noteLines.length ? noteLines.length * (noteSize + 8) + 28 : 0;
  const hl = model.highlights?.length ? layoutHighlights(model.highlights) : null;
  const tableBottom = tableTop + headRowH + rowH * model.rows.length;
  const height = Math.ceil(tableBottom + noteH + (hl ? hl.height + 32 : 0) + (model.bare ? 20 : 48));
  const { off } = frameLayout(model);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * SCALE;
  canvas.height = (height + off) * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, height + off);

  // Header
  if (!model.bare) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(PAD_X, headTop + 2, 8, titleH - 14);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 46px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(model.title, PAD_X + 26, headTop + 44);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 25px ${FONT}`;
    ctx.fillText(model.subtitle, PAD_X + 26, headTop + titleH + 24);
  }
  drawHeadline(ctx, model.headline, model.bare ? 8 : 154);
  ctx.translate(0, off);

  // Column geometry
  const xLabel = PAD_X;
  const xTargetRight = PAD_X + labelW + targetW - 18;
  const valueRight = (i: number) => PAD_X + labelW + targetW + valueW * (i + 1) - 24;
  const xDeltaRight = WIDTH - PAD_X - 24;

  // Emphasised column tint (header + body)
  model.columns.forEach((col, i) => {
    if (!col.emphasis) return;
    ctx.fillStyle = COLORS.emphasis;
    ctx.fillRect(PAD_X + labelW + targetW + valueW * i, tableTop, valueW, headRowH + rowH * model.rows.length);
  });

  // Header row
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'left';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('KPI', xLabel + 18, tableTop + 56);
  ctx.textAlign = 'right';
  ctx.fillText('Target', xTargetRight, tableTop + 56);
  model.columns.forEach((col, i) => {
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(col.label, valueRight(i), tableTop + (col.sublabel ? 44 : 56));
    if (col.sublabel) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `500 19px ${FONT}`;
      ctx.fillText(col.sublabel, valueRight(i), tableTop + 72);
    }
  });
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText('Perubahan', xDeltaRight, tableTop + 44);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText(model.deltaSub || model.deltaHeader, xDeltaRight, tableTop + 72);

  // Rule under header
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(PAD_X, tableTop + headRowH - 2, WIDTH - PAD_X * 2, 2);

  // Rows
  model.rows.forEach((row, r) => {
    const top = tableTop + headRowH + rowH * r;
    const mid = top + rowH / 2;

    if (r % 2 === 1) {
      // Zebra stripe, skipping the tinted column so its highlight stays continuous.
      ctx.fillStyle = COLORS.zebra;
      ctx.fillRect(PAD_X, top, labelW + targetW, rowH);
      let x = PAD_X + labelW + targetW;
      model.columns.forEach((col) => {
        if (!col.emphasis) ctx.fillRect(x, top, valueW, rowH);
        x += valueW;
      });
      ctx.fillRect(x, top, deltaW, rowH);
    }

    ctx.fillStyle = COLORS.line;
    ctx.fillRect(PAD_X, top + rowH - 1, WIDTH - PAD_X * 2, 1);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 29px ${FONT}`;
    ctx.fillText(row.label, xLabel + 18, mid);

    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 25px ${FONT}`;
    ctx.fillText(row.target, xTargetRight, mid);

    row.cells.forEach((cell, i) => {
      ctx.fillStyle = cell.tone === 'miss' ? COLORS.miss : cell.tone === 'watch' ? COLORS.watch : COLORS.ink;
      ctx.font = `700 32px ${FONT}`;
      const text = cell.tone === 'miss' ? `▼ ${cell.text}` : cell.text;
      ctx.fillText(text, valueRight(i), mid);
    });

    ctx.font = `700 27px ${FONT}`;
    ctx.fillStyle =
      row.delta.dir === 'up' ? COLORS.up : row.delta.dir === 'down' ? COLORS.down : COLORS.muted;
    ctx.fillText(row.delta.text, xDeltaRight, mid);
    ctx.textBaseline = 'alphabetic';
  });

  // Note
  if (noteLines.length) {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 ${noteSize}px ${FONT}`;
    const baseY = tableTop + headRowH + rowH * model.rows.length + 40;
    noteLines.forEach((line, i) => ctx.fillText(line, PAD_X + 18, baseY + i * (noteSize + 8)));
  }
  hl?.draw(ctx, tableBottom + noteH + 16);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal membuat gambar'))), 'image/png');
  });
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Loads the app font, creates a white canvas of the given logical size and scales it for crisp export. */
export async function createSlideCanvas(width: number, height: number) {
  try {
    await Promise.all([
      document.fonts.load('700 30px "Geist Sans"'),
      document.fonts.load('500 24px "Geist Sans"'),
    ]);
  } catch {
    /* fall back to the system stack */
  }
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal membuat gambar'))), 'image/png');
  });
}

/** Title block used by every export slide: accent bar, title, one-line subtitle. */
export function drawSlideHeader(ctx: CanvasRenderingContext2D, title: string, subtitle: string, padX = 72) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(padX, 58, 8, 46);
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(title, padX + 26, 98);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(subtitle, padX + 26, 134);
}

/** Truncates text with an ellipsis so it fits `maxWidth` at the current font. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * "Highlight:" box (dotted border, bullets) drawn under a slide's content. Measures first so the
 * canvas can be sized to fit, then draws at the requested top.
 */
export function layoutHighlights(lines: string[], width = WIDTH, padX = 72) {
  const measure = document.createElement('canvas').getContext('2d');
  const innerW = width - padX * 2 - 56 - 34;
  const fontSize = 26;
  const lineH = 34;
  const wrapped: string[][] = lines.map((line) => {
    if (!measure) return [line];
    measure.font = `500 ${fontSize}px ${FONT}`;
    return wrapLines(measure, line, innerW);
  });
  const bodyH = wrapped.reduce((sum, w) => sum + w.length * lineH + 8, 0);
  const height = 24 + 40 + bodyH + 18;

  return {
    height,
    draw(ctx: CanvasRenderingContext2D, top: number) {
      ctx.save();
      ctx.setLineDash([3, 6]);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#8B98A5';
      roundRect(ctx, padX, top, width - padX * 2, height, 18);
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = COLORS.ink;
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText('Highlight:', padX + 28, top + 24 + 28);

      let y = top + 24 + 40 + 26;
      ctx.font = `500 ${fontSize}px ${FONT}`;
      wrapped.forEach((parts) => {
        ctx.fillStyle = COLORS.ink;
        ctx.fillText('•', padX + 32, y);
        parts.forEach((part, i) => ctx.fillText(part, padX + 62, y + i * lineH));
        y += parts.length * lineH + 8;
      });
    },
  };
}

/** Extra canvas height a headline needs; content is translated down by this much. */
export const HEADLINE_H = 74;
export const headlineOffset = (headline?: SlideHeadline) => (headline ? HEADLINE_H : 0);

const HEADLINE_STYLE: Record<SlideHeadline['tone'], { bar: string; bg: string; ink: string }> = {
  good: { bar: '#0E7C66', bg: '#E4F4EE', ink: '#0B5F4D' },
  bad: { bar: '#C0261B', bg: '#FBE7E4', ink: '#9E1D14' },
  warn: { bar: '#D98A00', bg: '#FFF1D6', ink: '#8A5A00' },
  neutral: { bar: '#5E7089', bg: '#EDF1F5', ink: '#13202D' },
};

/** One-line takeaway under the slide title, coloured by tone. Drawn before content is translated down. */
export function drawHeadline(ctx: CanvasRenderingContext2D, headline?: SlideHeadline, y = 154, padX = 72) {
  if (!headline) return;
  const style = HEADLINE_STYLE[headline.tone];
  const x = padX;
  const w = WIDTH - padX * 2;
  const h = 58;
  ctx.save();
  ctx.fillStyle = style.bg;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.fillStyle = style.bar;
  roundRect(ctx, x, y, 10, h, 5);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.ink;
  ctx.font = `700 29px ${FONT}`;
  ctx.fillText(fitText(ctx, headline.text, w - 56), x + 32, y + h / 2 + 1);
  ctx.restore();
}

/** Height of the title block (accent bar, title, subtitle) that bare slides leave out. */
export const BARE_UP = 150;

/**
 * Shared start of every content slide: sizes the canvas for the optional headline and the optional
 * title block, draws them, and shifts the origin so the renderer's own coordinates stay unchanged.
 */
export function frameLayout(model: { headline?: SlideHeadline; bare?: boolean }) {
  return { off: model.bare ? headlineOffset(model.headline) - BARE_UP : headlineOffset(model.headline) };
}

export function beginSlide(
  ctx: CanvasRenderingContext2D,
  model: { headline?: SlideHeadline; bare?: boolean },
  title: string,
  subtitle: string,
) {
  const { off } = frameLayout(model);
  if (!model.bare) drawSlideHeader(ctx, title, subtitle);
  drawHeadline(ctx, model.headline, model.bare ? 8 : 154);
  ctx.translate(0, off);
}

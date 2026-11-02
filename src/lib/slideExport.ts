/**
 * Renders a KPI comparison table as a presentation-ready PNG (white background, large type) so it
 * can be pasted straight into a slide instead of screenshotting the dark dashboard.
 *
 * Drawn on a canvas with fixed export colours: the image must look the same whatever theme the
 * dashboard is in, so these deliberately do not follow the CSS theme tokens.
 */

export type SlideTone = 'plain' | 'watch' | 'miss';

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
};

const COLORS = {
  ink: '#13202D',
  muted: '#52606D',
  line: '#D8E0E8',
  zebra: '#F6F8FA',
  emphasis: '#E8EEFC',
  accent: '#D93A2B',
  miss: '#C0261B',
  watch: '#B45309',
  up: '#0E7C66',
  down: '#C0261B',
};

const FONT = '"Geist Sans", "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
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
  const headRowH = 96;
  const rowH = 78;
  const noteSize = 20;

  // Measure the note first so the canvas height fits it.
  const measure = document.createElement('canvas').getContext('2d');
  let noteLines: string[] = [];
  if (measure && model.note) {
    measure.font = `400 ${noteSize}px ${FONT}`;
    noteLines = wrapLines(measure, model.note, WIDTH - PAD_X * 2);
  }
  const noteH = noteLines.length ? noteLines.length * (noteSize + 8) + 28 : 0;
  const height = Math.ceil(tableTop + headRowH + rowH * model.rows.length + noteH + 48);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, height);

  // Header
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

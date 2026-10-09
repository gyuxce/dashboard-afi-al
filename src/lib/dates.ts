/**
 * Shared date helpers used across dataProcessor, sheetsApi, store, and App.
 * Extracted here to break the sheetsApi → dataProcessor coupling and
 * eliminate duplicated copies in store.ts / App.tsx.
 */

export function formatLocalDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getCurrentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthValue(date: string): string {
  return date ? date.slice(0, 7) : '';
}

export function getMonthRange(monthValue: string): { start: string; end: string } {
  if (!monthValue) return { start: '', end: '' };
  const [year, month] = monthValue.split('-').map(Number);
  if (!year || !month) return { start: '', end: '' };
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: formatLocalDate(year, month, 1),
    end: formatLocalDate(year, month, lastDay),
  };
}

export function getCurrentMonthRange(): { start: string; end: string } {
  return getMonthRange(getCurrentMonthValue());
}

// --- normalizeDateStr (moved from dataProcessor.ts) ---

const dateStrCache = new Map<string, string | null>();

function formatDateLocalYmd(dObj: Date): string {
  return `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
}

export function normalizeDateStr(raw: string): string | null {
  if (!raw) return null;
  const rawKey = String(raw).trim();
  if (dateStrCache.has(rawKey))
    return dateStrCache.get(rawKey) as string | null;

  // Drop a trailing clock time so "13-Agu-2026 14:30" / "13 Agu 2026 09:00:00"
  // still match the anchored date patterns below instead of falling through to
  // null and having the whole Productivity/SLA row dropped silently.
  const dateKey = rawKey
    .replace(/[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp]\.?[Mm]\.?)?$/, '')
    .trim();

  let result: string | null = null;

  // Try to parse DD MMM YYYY or DD-MMM-YYYY
  const dashMatch = dateKey.match(
    /^(\d{1,2})[-\s]([A-Za-z]+)(?:[-\s](\d{4}))?$/,
  );
  if (dashMatch) {
    const [, day, monthStr, yearStr] = dashMatch;
    const monthMap: Record<string, number> = {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      agu: 8, // id-ID short (Intl)
      sep: 9,
      oct: 10,
      okt: 10, // id-ID short
      nov: 11,
      dec: 12,
      des: 12, // id-ID short
      januari: 1,
      februari: 2,
      maret: 3,
      april: 4,
      mei: 5,
      juni: 6,
      juli: 7,
      agustus: 8,
      september: 9,
      oktober: 10,
      november: 11,
      desember: 12,
    };
    let mNum = monthMap[monthStr.toLowerCase()];
    if (mNum === undefined) {
      for (const [k, v] of Object.entries(monthMap)) {
        if (monthStr.toLowerCase().startsWith(k)) {
          mNum = v;
          break;
        }
      }
    }
    if (mNum !== undefined) {
      const y = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
      result = `${y}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  if (!result) {
    const clean = dateKey.split(" ")[0]; // Take only the date part if there's time
    const parts = clean.split(/[-/]/);

    if (parts.length >= 3) {
      let y = 0,
        m = 0,
        d = 0;
      if (parts[2].length === 4) {
        // Could be DD/MM/YYYY or MM/DD/YYYY
        y = parseInt(parts[2], 10);
        const p1 = parseInt(parts[0], 10);
        const p2 = parseInt(parts[1], 10);
        if (p1 > 12) {
          d = p1;
          m = p2;
        } else if (p2 > 12) {
          m = p1;
          d = p2;
        } else {
          d = p1;
          m = p2;
        }
      } else if (parts[0].length === 4) {
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        d = parseInt(parts[2], 10);
      }

      if (y > 0 && m > 0 && d > 0 && m <= 12 && d <= 31) {
        result = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }

    // Fallback to JS Date parser (use local Y-M-D to avoid UTC off-by-one)
    if (!result) {
      const dObj = new Date(clean);
      if (!isNaN(dObj.getTime())) {
        result = formatDateLocalYmd(dObj);
      }
    }
  }

  // Final fallback
  if (!result) {
    const dObj2 = new Date(rawKey);
    if (!isNaN(dObj2.getTime())) {
      result = formatDateLocalYmd(dObj2);
    }
  }

  dateStrCache.set(rawKey, result);
  return result;
}

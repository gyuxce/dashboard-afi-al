import { useCallback, useEffect, useState, type RefObject } from 'react';

export type VirtualRowsResult = {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
  /** Absolute indices of rows that should mount */
  virtualIndexes: number[];
};

type Options = {
  count: number;
  /** Estimated row height in px (sticky/multi-line cells ~48–56). */
  rowHeight?: number;
  overscan?: number;
  scrollRef: RefObject<HTMLElement | null>;
  /** Skip windowing for small lists — cheaper to render all. */
  threshold?: number;
};

/**
 * Fixed-row-height windowing against an overflow scroll parent.
 * Pairs with spacer rows in <tbody> so sticky table columns keep working.
 */
export function useVirtualRows({
  count,
  rowHeight = 48,
  overscan = 10,
  scrollRef,
  threshold = 40,
}: Options): VirtualRowsResult {
  const [range, setRange] = useState(() => ({
    start: 0,
    end: Math.min(count, threshold + overscan * 2),
  }));

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el || count <= threshold) {
      setRange((prev) => {
        if (prev.start === 0 && prev.end === count) return prev;
        return { start: 0, end: count };
      });
      return;
    }

    const start = Math.max(0, Math.floor(el.scrollTop / rowHeight) - overscan);
    const visible = Math.ceil(el.clientHeight / rowHeight) + overscan * 2;
    const end = Math.min(count, start + visible);
    setRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [count, overscan, rowHeight, scrollRef, threshold]);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [scrollRef, update]);

  // Reset window when list shrinks/grows a lot (filter/sort).
  useEffect(() => {
    update();
  }, [count, update]);

  const useAll = count <= threshold;
  const startIndex = useAll ? 0 : Math.min(range.start, count);
  const endIndex = useAll ? count : Math.min(range.end, count);
  const windowStart = startIndex >= endIndex ? 0 : startIndex;
  const windowEnd = startIndex >= endIndex ? count : endIndex;
  const virtualIndexes =
    windowEnd > windowStart
      ? Array.from({ length: windowEnd - windowStart }, (_, i) => windowStart + i)
      : [];

  return {
    startIndex: windowStart,
    endIndex: windowEnd,
    paddingTop: windowStart * rowHeight,
    paddingBottom: Math.max(0, (count - windowEnd) * rowHeight),
    virtualIndexes,
  };
}

import React, { useLayoutEffect, useRef } from 'react';
import { easeOutCubic, formatAnimatedNumber, parseAnimatedNumber } from '../../lib/animatedNumber';
import { usePerfLite } from '../../hooks/usePerfLite';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts a number up (first appearance) or between values (updates) by writing straight to the DOM, so no React
 * re-render happens per frame. A new value mid-animation continues from what is on screen, never from zero. Text that
 * is not a single plain number is shown as is.
 */
export const AnimatedNumber: React.FC<{ value: React.ReactNode; durationMs?: number }> = ({ value, durationMs = 600 }) => {
  const lite = usePerfLite();
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || text === null) return;
    const parsed = parseAnimatedNumber(text);
    if (!parsed || prefersReducedMotion()) {
      el.textContent = text;
      shown.current = parsed ? parsed.target : null;
      return;
    }
    const from = shown.current ?? 0;
    if (from === parsed.target) {
      el.textContent = text;
      return;
    }
    const duration = lite ? Math.min(durationMs, 350) : durationMs;
    const startedAt = performance.now();
    let frame = 0;
    el.textContent = formatAnimatedNumber(parsed, from);
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      if (progress >= 1) {
        el.textContent = text;
        shown.current = parsed.target;
        return;
      }
      const current = from + (parsed.target - from) * easeOutCubic(progress);
      shown.current = current;
      el.textContent = formatAnimatedNumber(parsed, current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, durationMs, lite]);

  if (text === null) return <>{value}</>;
  // Content is owned by the effect above; the span starts empty so React never overwrites an animation in flight.
  return <span ref={ref} />;
};

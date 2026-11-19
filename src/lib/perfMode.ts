/**
 * "Mode ringan" switches off the decorative effects that are expensive on weak office laptops (frosted-glass blur,
 * large shadows, long fades). `auto` turns it on for devices that report few cores or little memory.
 */
export type PerfPreference = 'auto' | 'lite' | 'full';

const STORAGE_KEY = 'perfMode';

export function isLowEndDevice(nav: { hardwareConcurrency?: number; deviceMemory?: number } = typeof navigator !== 'undefined' ? navigator : {}): boolean {
  const cores = nav.hardwareConcurrency;
  const memory = nav.deviceMemory;
  return (typeof cores === 'number' && cores <= 4) || (typeof memory === 'number' && memory <= 4);
}

export function resolvePerfLite(preference: PerfPreference, lowEnd: boolean): boolean {
  if (preference === 'lite') return true;
  if (preference === 'full') return false;
  return lowEnd;
}

export function parsePerfPreference(value: unknown): PerfPreference {
  return value === 'lite' || value === 'full' ? value : 'auto';
}

let preference: PerfPreference = 'auto';
try {
  preference = parsePerfPreference(typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null);
} catch { /* storage blocked: stay on auto */ }

const listeners = new Set<() => void>();

export const getPerfPreference = () => preference;
export const getPerfLite = () => resolvePerfLite(preference, isLowEndDevice());

/** Mirrors the resolved mode on <html data-perf="lite|full"> so CSS can react to it. */
export function applyPerfMode() {
  if (typeof document !== 'undefined') document.documentElement.dataset.perf = getPerfLite() ? 'lite' : 'full';
}

export function setPerfPreference(next: PerfPreference) {
  preference = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  applyPerfMode();
  listeners.forEach((l) => l());
}

export function subscribePerf(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Props for recharts series: short grow-in on normal devices, none in "Mode ringan" or when the OS asks for less motion. */
export function chartAnimation() {
  const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { isAnimationActive: !getPerfLite() && !reduced, animationDuration: 450, animationEasing: 'ease-out' as const };
}

/**
 * Page size. `auto` follows the window (see the zoom steps in index.css: small laptop screens are scaled down on their own);
 * the other values pin it, like choosing 100%, 88% or 78% in the browser, but remembered for this dashboard only.
 */
export type UiScalePreference = 'auto' | 'large' | 'medium' | 'small';

const STORAGE_KEY = 'uiScale';
const ORDER: UiScalePreference[] = ['auto', 'large', 'medium', 'small'];

export const UI_SCALE_LABEL: Record<UiScalePreference, string> = {
  auto: 'Otomatis',
  large: '100%',
  medium: '88%',
  small: '78%',
};

export function parseUiScale(value: unknown): UiScalePreference {
  return value === 'large' || value === 'medium' || value === 'small' ? value : 'auto';
}

export function nextUiScale(current: UiScalePreference): UiScalePreference {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
}

let preference: UiScalePreference = 'auto';
try {
  preference = parseUiScale(typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null);
} catch { /* storage blocked: stay on auto */ }

const listeners = new Set<() => void>();
export const getUiScale = () => preference;

/** Mirrors the choice on <html data-ui-scale> so CSS can apply it; `auto` leaves the attribute off. */
export function applyUiScale() {
  if (typeof document === 'undefined') return;
  if (preference === 'auto') delete document.documentElement.dataset.uiScale;
  else document.documentElement.dataset.uiScale = preference;
}

export function setUiScale(next: UiScalePreference) {
  preference = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  applyUiScale();
  listeners.forEach((l) => l());
}

export function subscribeUiScale(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

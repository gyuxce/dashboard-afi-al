import { useSyncExternalStore } from 'react';
import { getPerfLite, getPerfPreference, subscribePerf } from '../lib/perfMode';

/** true when "Mode ringan" is in effect (chosen, or picked automatically for a weak device). */
export const usePerfLite = () => useSyncExternalStore(subscribePerf, getPerfLite, () => false);
export const usePerfPreference = () => useSyncExternalStore(subscribePerf, getPerfPreference, () => 'auto' as const);

import { getUiScale, subscribeUiScale } from '../lib/uiScale';
export const useUiScale = () => useSyncExternalStore(subscribeUiScale, getUiScale, () => 'auto' as const);

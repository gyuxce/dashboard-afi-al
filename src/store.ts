import { create } from 'zustand';
import { saveData, loadData, clearAllData, listKeys, SHEETS_SNAPSHOT_REVISION } from './lib/storage';
import { countDataRows, ValidationResult } from './lib/csvValidator';
import { type AllSheetsData, fetchAllSheets, getCurrentSheetMonthKey, getSheetMonthHistoryKeys, getNextSheetMonthKey, isFutureSheetMonth, getSheetConfigForMonth, getSheetMonthOption, getSpreadsheetIdForMonth, getSpreadsheetIdCandidatesForMonth, mergeAllSheetsData, sheetDataToParseResult, emptyAllSheetsData, isAbortError, isTransientNetworkError, getDateRangeForSheetMonth, sheetMonthOrdinal } from './lib/sheetsApi';
import { buildAgentDictionary, isAgentDictionaryPopulated } from './lib/csid';
import { getCurrentMonthRange } from './lib/dates';
import { lastDataDate, lastDatesForAllSources, type SourceLastDates } from './lib/sourceFreshness';

let sheetsSyncGeneration = 0;
let sheetsAbortController: AbortController | null = null;
let hydratePromise: Promise<void> | null = null;
let inFlightSheetsFetch: { month: string; promise: Promise<void> } | null = null;
let storageEpoch = 0;
let sheetsPersistChain: Promise<void> = Promise.resolve();

/**
 * How much history a sync loads. Only what the current screen needs (see lib/historyNeeds.ts): Summary needs last month for
 * its delta chips, comparisons and the slide export need more. `ensureSheetsHistory` raises these on demand; picking another
 * month resets them. Loading less keeps the download, the memory and every processKPIs scan small on weak laptops.
 */
let requestedHistoryDepth = 1;
let requestedScheduleDepth = 2;
let requestedNextMonth = false;

/**
 * Every month fetched in this session, so a later sync rebuilds the dataset from memory instead of the network and
 * going back to a month you already looked at is instant. The running month goes stale quickly, closed months barely change.
 */
/** `scheduleOnly` = only the Schedule tab was loaded (the month before a period start, for the shift-22 boundary day). */
const monthCache = new Map<string, { data: AllSheetsData; at: number; scheduleOnly?: boolean }>();
const RUNNING_MONTH_FRESH_MS = 5 * 60 * 1000;
const MAX_CACHED_MONTHS = 6;
const monthIsFresh = (monthKey: string, at: number) =>
  Date.now() - at < (monthKey === getCurrentSheetMonthKey() ? RUNNING_MONTH_FRESH_MS : HISTORY_MONTH_CACHE_MAX_AGE_MS);
/** Keeps memory bounded: drop the oldest cached months beyond the limit, never the ones the current sync needs. */
const trimMonthCache = (keep: Set<string>) => {
  if (monthCache.size <= MAX_CACHED_MONTHS) return;
  [...monthCache.entries()]
    .filter(([key]) => !keep.has(key))
    .sort((a, b) => a[1].at - b[1].at)
    .slice(0, monthCache.size - MAX_CACHED_MONTHS)
    .forEach(([key]) => monthCache.delete(key));
};

/** A cached Sheets snapshot older than this is ignored on boot. */
const SHEETS_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

/** Closed history months barely change: reuse a saved copy this long. */
const HISTORY_MONTH_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const historyCacheKey = (monthKey: string) => `historyMonth_${monthKey}`;

const defaultDateRange =getCurrentMonthRange();

export interface AppState {
  // Data source mode
  dataSource: 'sheets' | 'csv';
  
  // Loading & error state untuk Sheets fetch
  isFetchingSheets: boolean;
  sheetsFetchError: string | null;
  /** Soft progress for boot/sync panel (single-phase loading). */
  sheetsSyncProgress: {
    message: string;
    steps: Array<{ id: string; label: string; state: 'pending' | 'active' | 'done' | 'error' }>;
  } | null;
  lastSyncTime: Date | null;
  selectedSheetMonth: string;
  activeMonthRowCounts: Record<string, number> | null;
  /** Newest calendar date present per source sheet — surfaces a stale/frozen sheet. */
  activeMonthLastDates: SourceLastDates | null;
  /** History month keys (e.g. `JUN_2026`) whose tabs could not be fetched this sync. */
  missingHistoryMonths: string[];
  sheetsSnapshotRevision: number | null;
  /** Which sheet months the dataset holds (`roster` = loaded with their CSID tab), so a screen asks for more only when something is missing. */
  sheetsLoaded: { months: string[]; roster: string[]; scheduleOnly: string[] } | null;
  
  // Sheet configuration
  sheetsConfig: {
    spreadsheetId: string;
    apiKey: string;
    sheetNames: {
      csid: string;
      productivity: string;
      csatSc: string;
      sla: string;
      schedule: string;
      qa: string;
    };
  } | null;

  productivityFile: File | null;
  csatScFile: File | null;
  slaFile: File | null;
  scheduleFile: File | null;
  csidFile: File | null;
  qaFile: File | null;
  
  productivityData: string[][];
  csatScData: string[][];
  slaData: string[][];
  scheduleData: string[][];
  csidData: string[][];
  qaData: string[][];

  startDate: string;
  endDate: string;
  selectedBpo: string;
  selectedTL: string;
  selectedGlobalAgent: string;
  agentDictionary: Record<string, { name: string; bpo: string; teamLeader: string }>;
  agentDictionaryByMonth: Record<string, Record<string, { name: string; bpo: string; teamLeader: string }>>;
  isComparisonEnabled: boolean;
  comparisonMode: 'wow' | 'mom';

  isHydrating: boolean;
  isPersisting: boolean;
  persistedKeys: string[];
  fileValidations: Record<string, ValidationResult | null>;
  fileNames: Record<string, string>;

  setFile: (key: keyof AppState, file: File | null, data: string[][], validation?: ValidationResult | null) => void;
  setDateRange: (start: string, end: string) => void;
  setSelectedBpo: (bpo: string) => void;
  setSelectedTL: (tl: string) => void;
  setSelectedGlobalAgent: (agent: string) => void;
  clearFiles: () => void;
  hydrateFromStorage: () => Promise<void>;
  
  // Sheet actions
  fetchFromSheets: (opts?: { reuseCurrentMonth?: boolean }) => Promise<void>;
  /** Loads more history / the next month when the current screen needs it; never loads less. */
  ensureSheetsHistory: (needs: { depth: number; scheduleDepth: number; nextMonth: boolean }) => Promise<void>;
  setSelectedSheetMonth: (monthKey: string) => void;
  setDataSource: (mode: 'sheets' | 'csv') => void;
  setIsComparisonEnabled: (enabled: boolean) => void;
  setComparisonMode: (mode: 'wow' | 'mom') => void;

  /** Soft navigation request from child views (e.g. EmptyState → File Center) */
  pendingTab: string | null;
  openTab: (tab: string) => void;
  clearPendingTab: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  dataSource: 'csv',
  isFetchingSheets: false,
  sheetsFetchError: null,
  sheetsSyncProgress: null,
  lastSyncTime: null,
  selectedSheetMonth: getCurrentSheetMonthKey(),
  activeMonthRowCounts: null,
  activeMonthLastDates: null,
  missingHistoryMonths: [],
  sheetsSnapshotRevision: null,
  sheetsLoaded: null,
  sheetsConfig: null,

  productivityFile: null,
  csatScFile: null,
  slaFile: null,
  scheduleFile: null,
  csidFile: null,
  qaFile: null,

  productivityData: [],
  csatScData: [],
  slaData: [],
  scheduleData: [],
  csidData: [],
  qaData: [],

  startDate: defaultDateRange.start,
  endDate: defaultDateRange.end,
  selectedBpo: 'All BPO',
  selectedTL: 'All TL',
  selectedGlobalAgent: 'All Agents',
  agentDictionary: {},
  agentDictionaryByMonth: {},
  isComparisonEnabled: false,
  comparisonMode: 'wow',
  pendingTab: null,
  fileValidations: {},
  fileNames: {},

  isHydrating: true, // Start as true to show loading initially if used
  isPersisting: false,
  persistedKeys: [],

  setFile: (key, file, data, validation = null) => {
    set({ isPersisting: true });
    
    // Process CSID Dictionary if csidData is uploaded
    let dictUpdates = {};
    if (key === 'csidFile') {
      const dict = buildAgentDictionary(data);
      dictUpdates = { agentDictionary: dict, agentDictionaryByMonth: { legacy: dict } };
    }

    const dataKey = key.replace('File', 'Data');

    // Track the newest date this uploaded source carries, so a stale sheet shows up.
    const lastDate = key === 'csidFile' ? null : lastDataDate(dataKey, data);

    // Update Zustand state synchronously
    set((state) => ({
      [key]: file,
      [dataKey]: data,
      ...dictUpdates,
      fileValidations: { ...state.fileValidations, [key]: validation },
      ...(key !== 'csidFile'
        ? { activeMonthLastDates: { ...(state.activeMonthLastDates || {}), [dataKey]: lastDate } }
        : {}),
      ...(file && file.name ? { fileNames: { ...state.fileNames, [key]: file.name } } : {})
    }));

    // Persist to IndexedDB asynchronously
    const p1 = saveData(key, data);
    const p2 = validation ? saveData(key + '_validation', validation) : Promise.resolve();
    const p3 = file && file.name ? saveData(key + '_filename', file.name) : Promise.resolve();
    
    Promise.all([p1, p2, p3]).then(() => {
      listKeys().then(keys => {
        set({ persistedKeys: keys, isPersisting: false });
      });
    }).catch(err => {
      console.warn("Failed to persist data in background", err);
      set({ isPersisting: false });
    });
  },

  setDateRange: (start, end) => set(() => ({ startDate: start, endDate: end })),
  setSelectedBpo: (bpo) => set(() => ({ selectedBpo: bpo })),
  setSelectedTL: (tl) => set(() => ({ selectedTL: tl })),
  setSelectedGlobalAgent: (agent) => set(() => ({ selectedGlobalAgent: agent })),
  setIsComparisonEnabled: (enabled) => set(() => ({ isComparisonEnabled: enabled })),
  setComparisonMode: (mode) => set(() => ({ comparisonMode: mode })),
  openTab: (tab) => set(() => ({ pendingTab: tab })),
  clearPendingTab: () => set(() => ({ pendingTab: null })),

  clearFiles: async () => {
    storageEpoch += 1;
    sheetsSyncGeneration += 1;
    sheetsAbortController?.abort();
    sheetsAbortController = null;
    inFlightSheetsFetch = null;
    hydratePromise = null;

    set(() => ({
      productivityFile: null,
      csatScFile: null,
      slaFile: null,
      scheduleFile: null,
      csidFile: null,
      qaFile: null,
      productivityData: [],
      csatScData: [],
      slaData: [],
      scheduleData: [],
      csidData: [],
      qaData: [],
      agentDictionary: {},
      agentDictionaryByMonth: {},
      fileValidations: {},
      fileNames: {},
      activeMonthRowCounts: null,
      activeMonthLastDates: null,
      missingHistoryMonths: [],
      selectedBpo: 'All BPO',
      selectedTL: 'All TL',
      persistedKeys: [],
      lastSyncTime: null,
      dataSource: 'csv',
      sheetsSnapshotRevision: null,
      sheetsLoaded: null,
      isFetchingSheets: false,
      sheetsSyncProgress: null,
      sheetsFetchError: null,
    }));
    monthCache.clear();
    
    await clearAllData();
  },

  hydrateFromStorage: async () => {
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      set({ isHydrating: true });
      const hydrateStartedAt = Date.now();
      const hydrateEpoch = storageEpoch;
      try {
        const keys = await listKeys();
        if (hydrateEpoch !== storageEpoch) {
          set({ isHydrating: false });
          return;
        }
        const filesToLoad = ['productivityFile', 'csatScFile', 'slaFile', 'scheduleFile', 'csidFile', 'qaFile'];

        const fileData: Partial<AppState> = { fileValidations: {}, fileNames: {} };

        for (const k of filesToLoad) {
          if (hydrateEpoch !== storageEpoch) {
            set({ isHydrating: false });
            return;
          }
          if (keys.includes(k)) {
            const loadedData = await loadData(k);
            if (loadedData) {
              const dataKey = k.replace('File', 'Data') as keyof AppState;

              if (keys.includes(k + '_filename')) {
                const savedName = await loadData(k + '_filename');
                if (savedName && fileData.fileNames) {
                  fileData.fileNames[k] = savedName;
                }
              }

              const dummyFile = new File([], `Persisted Data (${k.replace('File', '')}.csv)`, { type: 'text/csv' });

              // @ts-ignore — File vs string[][] union key
              fileData[k as keyof AppState] = dummyFile;
              // @ts-ignore — dynamic key, TS can't resolve the specific array type
              fileData[dataKey] = loadedData as string[][];

              if (keys.includes(k + '_validation')) {
                const valData = await loadData(k + '_validation');
                if (valData && fileData.fileValidations) {
                  fileData.fileValidations[k] = valData;
                }
              }
            }
          }
        }

        if (fileData.csidData) {
          const data = fileData.csidData;
          const dict = buildAgentDictionary(data);
          fileData.agentDictionary = dict;
          fileData.agentDictionaryByMonth = { legacy: dict };
        }

        if (keys.includes('sheetsMeta')) {
          const meta = await loadData('sheetsMeta');
          if (meta && typeof meta === 'object') {
            if (meta.dataSource === 'sheets' || meta.dataSource === 'csv') {
              fileData.dataSource = meta.dataSource;
            }
            if (meta.selectedSheetMonth) fileData.selectedSheetMonth = meta.selectedSheetMonth;
            if (meta.lastSyncTime) fileData.lastSyncTime = new Date(meta.lastSyncTime);
            if (meta.activeMonthRowCounts) fileData.activeMonthRowCounts = meta.activeMonthRowCounts;
            if (meta.activeMonthLastDates) fileData.activeMonthLastDates = meta.activeMonthLastDates;
            if (Array.isArray(meta.missingHistoryMonths)) fileData.missingHistoryMonths = meta.missingHistoryMonths;
            if (meta.agentDictionaryByMonth) fileData.agentDictionaryByMonth = meta.agentDictionaryByMonth;
            if (meta.agentDictionary) fileData.agentDictionary = meta.agentDictionary;
            if (meta.fileNames) {
              fileData.fileNames = { ...(fileData.fileNames || {}), ...meta.fileNames };
            }
            if (typeof meta.sheetsSnapshotRevision === 'number') {
              fileData.sheetsSnapshotRevision = meta.sheetsSnapshotRevision;
            }
            if (meta.selectedSheetMonth) {
              // Snapshots from before on-demand history always held three months back and the next month.
              const keys = getSheetMonthHistoryKeys(meta.selectedSheetMonth);
              const next = getNextSheetMonthKey(meta.selectedSheetMonth);
              fileData.sheetsLoaded = {
                months: Array.isArray(meta.loadedMonths) ? meta.loadedMonths : [...keys, ...(next ? [next] : [])],
                roster: Array.isArray(meta.rosterMonths) ? meta.rosterMonths : keys,
                scheduleOnly: Array.isArray(meta.scheduleOnlyMonths) ? meta.scheduleOnlyMonths : [],
              };
            }
          }
        }

        // A Sheets snapshot is only a placeholder until the live fetch lands.
        // Never trust one that is old, from another month, or from an older
        // snapshot format — otherwise the dashboard shows stale data (or last
        // month's tab) on that laptop. Drop it and let the live sync fill in.
        if (fileData.dataSource === 'sheets') {
          const snapshotAge = fileData.lastSyncTime
            ? Date.now() - fileData.lastSyncTime.getTime()
            : Number.POSITIVE_INFINITY;
          const snapshotUsable =
            fileData.selectedSheetMonth === getCurrentSheetMonthKey()
            && fileData.sheetsSnapshotRevision === SHEETS_SNAPSHOT_REVISION
            && snapshotAge >= 0
            && snapshotAge <= SHEETS_CACHE_MAX_AGE_MS;
          if (!snapshotUsable) {
            set({ persistedKeys: keys, isHydrating: false });
            return;
          }
        }

        const monthForFilter = fileData.selectedSheetMonth || get().selectedSheetMonth;
        if (fileData.dataSource === 'sheets' && monthForFilter) {
          const monthRange = getDateRangeForSheetMonth(monthForFilter);
          if (monthRange) {
            fileData.startDate = monthRange.start;
            fileData.endDate = monthRange.end;
          }
        }

        // Re-check immediately before applying IndexedDB so a live/completed
        // Sheets sync cannot be clobbered by a slower hydrate.
        if (hydrateEpoch !== storageEpoch) {
          set({ isHydrating: false });
          return;
        }
        const live = get();
        const liveSync = live.lastSyncTime?.getTime() || 0;
        if (live.isFetchingSheets || liveSync > hydrateStartedAt) {
          set({ isHydrating: false });
          return;
        }

        set({ ...fileData, persistedKeys: keys, isHydrating: false });
      } catch (e) {
        console.warn("Failed to hydrate from IndexedDB", e);
        set({ isHydrating: false });
      }
    })();

    try {
      await hydratePromise;
    } catch (error) {
      hydratePromise = null;
      throw error;
    }
  },

  setDataSource: (mode) => set({ dataSource: mode }),
  setSelectedSheetMonth: (monthKey) => {
    // A different month starts from the small default again; the screen asks for more through ensureSheetsHistory.
    requestedHistoryDepth = 1;
    requestedScheduleDepth = 2;
    requestedNextMonth = false;
    set({ selectedSheetMonth: monthKey });
  },

  fetchFromSheets: async (opts) => {
    const selectedMonth = get().selectedSheetMonth;
    if (inFlightSheetsFetch && inFlightSheetsFetch.month === selectedMonth) {
      return inFlightSheetsFetch.promise;
    }

    let settle: (value: void | PromiseLike<void>) => void;
    let fail: (reason?: unknown) => void;
    const wrapper = new Promise<void>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    inFlightSheetsFetch = { month: selectedMonth, promise: wrapper };

    const run = (async () => {
      const gen = ++sheetsSyncGeneration;
      sheetsAbortController?.abort();
      sheetsAbortController = new AbortController();
      const signal = sheetsAbortController.signal;

      type StepState = 'pending' | 'active' | 'done' | 'error';
      const sourceSteps: Array<{ id: string; label: string; state: StepState }> = [
        { id: 'month', label: 'Data bulan aktif', state: 'pending' },
        { id: 'history', label: 'Riwayat bulan sebelumnya', state: 'pending' },
        { id: 'master', label: 'Master CSID', state: 'pending' },
        { id: 'productivity', label: 'Productivity', state: 'pending' },
        { id: 'csat', label: 'CSAT SC', state: 'pending' },
        { id: 'sla', label: 'SLA / WHU', state: 'pending' },
        { id: 'schedule', label: 'Schedule', state: 'pending' },
        { id: 'qa', label: 'QA', state: 'pending' },
        { id: 'assemble', label: 'Menyusun dataset', state: 'pending' },
      ];

      const patchProgress = (
        message: string,
        patch: Partial<Record<string, StepState>>,
      ) => {
        if (gen !== sheetsSyncGeneration) return;
        set({
          sheetsSyncProgress: {
            message,
            steps: sourceSteps.map((step) => ({
              ...step,
              state: patch[step.id] ?? step.state,
            })),
          },
        });
        sourceSteps.forEach((step) => {
          const next = patch[step.id];
          if (next) step.state = next;
        });
      };

      set({
        isFetchingSheets: true,
        sheetsFetchError: null,
        sheetsSyncProgress: { message: 'Menyiapkan sync...', steps: [...sourceSteps] },
      });

      try {
        const sheetConfig = getSheetConfigForMonth(selectedMonth);
        const monthOption = getSheetMonthOption(selectedMonth);
        const depthForRun = requestedHistoryDepth;
        const nextMonthKey = requestedNextMonth ? getNextSheetMonthKey(selectedMonth) : null;
        const fullKeys = new Set(getSheetMonthHistoryKeys(selectedMonth, depthForRun));
        // The dataset keeps every month already in memory (going back to a month you viewed is instant) plus the months
        // this screen needs. Earlier months and the selected one feed the roster; later months bring only the data tabs.
        const wanted = new Set<string>(getSheetMonthHistoryKeys(selectedMonth, Math.max(depthForRun, requestedScheduleDepth)));
        if (nextMonthKey && !isFutureSheetMonth(nextMonthKey)) wanted.add(nextMonthKey);
        monthCache.forEach((_entry, key) => wanted.add(key));
        wanted.add(selectedMonth);
        const selectedOrdinal = sheetMonthOrdinal(selectedMonth);
        const orderedKeys = [...wanted].sort((x, y) => sheetMonthOrdinal(x) - sheetMonthOrdinal(y));
        const historyMonthKeys = orderedKeys.filter((key) => sheetMonthOrdinal(key) <= selectedOrdinal);
        const laterMonthKeys = orderedKeys.filter((key) => sheetMonthOrdinal(key) > selectedOrdinal);

        // History tabs are optional. A missing JUN/legacy sheet must not fail the
        // first boot of the selected month.
        const loadHistoryMonth = async (monthKey: string) => {
          const inMemory = monthCache.get(monthKey);
          const needsFull = fullKeys.has(monthKey);
          // A month held without its data tabs is good enough unless the screen needs it in full.
          if (inMemory && monthIsFresh(monthKey, inMemory.at) && (!inMemory.scheduleOnly || !needsFull)) return inMemory.data;
          if (!needsFull) return loadScheduleOnlyMonth(monthKey);
          const cached = await loadData(historyCacheKey(monthKey));
          if (
            cached
            && cached.revision === SHEETS_SNAPSHOT_REVISION
            && cached.data
            && Date.now() - Number(cached.savedAt || 0) <= HISTORY_MONTH_CACHE_MAX_AGE_MS
          ) {
            monthCache.set(monthKey, { data: cached.data as AllSheetsData, at: Number(cached.savedAt) || Date.now() });
            return cached.data as AllSheetsData;
          }
          const fresh = await fetchHistoryMonthFromSheets(monthKey);
          if (fresh) {
            monthCache.set(monthKey, { data: fresh, at: Date.now() });
            void saveData(historyCacheKey(monthKey), {
              revision: SHEETS_SNAPSHOT_REVISION,
              savedAt: Date.now(),
              data: fresh,
            });
          }
          return fresh;
        };
        const fetchHistoryMonthFromSheets = async (monthKey: string) => {
          const monthConfig = getSheetConfigForMonth(monthKey);
          const candidateIds = getSpreadsheetIdCandidatesForMonth(monthKey, selectedMonth);
          let lastError: unknown = null;
          for (const spreadsheetId of candidateIds) {
            try {
              return await fetchAllSheets(monthConfig, spreadsheetId, signal);
            } catch (error) {
              if (isAbortError(error) || signal.aborted) throw error;
              lastError = error;
            }
          }
          console.warn(`Riwayat ${monthKey} dilewati`, lastError);
          return null;
        };

        const loadScheduleOnlyMonth = async (monthKey: string) => {
          for (const spreadsheetId of getSpreadsheetIdCandidatesForMonth(monthKey, selectedMonth)) {
            try {
              const only = await fetchAllSheets(getSheetConfigForMonth(monthKey), spreadsheetId, signal, ['schedule']);
              if (only.schedule.length > 1) {
                monthCache.set(monthKey, { data: only, at: Date.now(), scheduleOnly: true });
                return only;
              }
            } catch (error) {
              if (isAbortError(error) || signal.aborted) throw error;
            }
          }
          return null;
        };

        // Months after the selected one are loaded for their data tabs only (everything except the roster):
        //  - QA: Simulasi Insentif buckets QA by Tanggal Case, so cases of a closed month
        //    that were checked the month after live in the NEXT month's QA tab.
        //  - Weekly Performance Report: Monday–Sunday weeks cross month boundaries
        //    (W5 Okt = 26 Okt–1 Nov), so 1 Nov productivity/CSAT/SLA/schedule must be present.
        const loadLaterMonth = async (monthKey: string) => {
          const inMemory = monthCache.get(monthKey);
          if (inMemory && monthIsFresh(monthKey, inMemory.at)) return inMemory.data;
          if (isFutureSheetMonth(monthKey)) return null;
          const laterConfig = getSheetConfigForMonth(monthKey);
          for (const spreadsheetId of getSpreadsheetIdCandidatesForMonth(monthKey, selectedMonth)) {
            try {
              const later = await fetchAllSheets(
                laterConfig,
                spreadsheetId,
                signal,
                ['productivity', 'csatSc', 'sla', 'schedule', 'qa'],
              );
              if (later.qa.length > 1 || later.productivity.length > 1) {
                monthCache.set(monthKey, { data: later, at: Date.now() });
                return later;
              }
            } catch (error) {
              if (isAbortError(error) || signal.aborted) throw error;
            }
          }
          return null;
        };

        // Start everything at once: the active month is shown as soon as it is
        // ready, history catches up in the background.
        patchProgress(`Mengambil data ${monthOption.label}...`, { month: 'active' });
        const heldCurrent = monthCache.get(selectedMonth);
        const reusableCurrent = opts?.reuseCurrentMonth && heldCurrent && monthIsFresh(selectedMonth, heldCurrent.at)
          ? heldCurrent.data
          : null;
        const currentMonthPromise = reusableCurrent
          ? Promise.resolve(reusableCurrent)
          : fetchAllSheets(
            sheetConfig,
            getSpreadsheetIdForMonth(selectedMonth),
            signal,
          ).then((data) => {
            monthCache.set(selectedMonth, { data, at: Date.now() });
            return data;
          });
        const historyPromises = historyMonthKeys.map((monthKey) =>
          monthKey === selectedMonth ? currentMonthPromise : loadHistoryMonth(monthKey),
        );
        const laterPromises = laterMonthKeys.map((monthKey) => loadLaterMonth(monthKey));
        // Avoid unhandled rejections if the active month fails first.
        [...historyPromises, ...laterPromises].forEach((promise) => { promise.catch(() => undefined); });

        const currentMonthData = await currentMonthPromise;
        if (gen !== sheetsSyncGeneration) return;
        patchProgress(`Bulan ${monthOption.label} siap`, {
          month: 'done',
          master: 'done',
          productivity: 'done',
          csat: 'done',
          sla: 'done',
          schedule: 'done',
          qa: 'done',
        });

        const currentMonthRows = {
          csidData: countDataRows(sheetDataToParseResult(currentMonthData.csid).data),
          productivityData: countDataRows(sheetDataToParseResult(currentMonthData.productivity).data),
          csatScData: countDataRows(sheetDataToParseResult(currentMonthData.csatSc).data),
          slaData: countDataRows(sheetDataToParseResult(currentMonthData.sla).data),
          scheduleData: countDataRows(sheetDataToParseResult(currentMonthData.schedule).data),
          qaData: countDataRows(sheetDataToParseResult(currentMonthData.qa).data),
        };
        const currentMonthLastDates = lastDatesForAllSources({
          productivityData: sheetDataToParseResult(currentMonthData.productivity).data,
          csatScData: sheetDataToParseResult(currentMonthData.csatSc).data,
          slaData: sheetDataToParseResult(currentMonthData.sla).data,
          scheduleData: sheetDataToParseResult(currentMonthData.schedule).data,
          qaData: sheetDataToParseResult(currentMonthData.qa).data,
        });

        const syncedAt = new Date();
        let loadedSummary: { months: string[]; roster: string[]; scheduleOnly: string[] } = { months: [], roster: [], scheduleOnly: [] };

        /** Assemble the dataset and push it to the store. `final` = history is
         *  complete: finish the sync and persist the snapshot. */
        const commitSnapshot = (
          historicalSheets: Array<typeof currentMonthData>,
          missingHistoryMonths: string[],
          final: boolean,
          laterSheets: Array<typeof currentMonthData> = [],
        ) => {
          const mergedHistory = historicalSheets.reduce(
            (merged, monthData) =>
              merged ? mergeAllSheetsData(merged, monthData) : monthData,
            null as typeof currentMonthData | null,
          ) || currentMonthData;
          const allData = laterSheets.reduce(
            (merged, later) => mergeAllSheetsData(merged, { ...emptyAllSheetsData(), ...later, csid: [] }),
            mergedHistory,
          );
          const firstFullKey = historyMonthKeys.find((key) => !monthCache.get(key)?.scheduleOnly) ?? selectedMonth;
          const loadedMonthLabel = final && firstFullKey !== selectedMonth
            ? `${getSheetMonthOption(firstFullKey).label} - ${monthOption.label}`
            : monthOption.label;

          const csvCsid = sheetDataToParseResult(allData.csid);
          const csvProductivity = sheetDataToParseResult(allData.productivity);
          const csvCsatSc = sheetDataToParseResult(allData.csatSc);
          const csvSla = sheetDataToParseResult(allData.sla);
          const csvSchedule = sheetDataToParseResult(allData.schedule);
          const csvQa = sheetDataToParseResult(allData.qa);

          const newAgentDict = buildAgentDictionary(csvCsid.data);
          const agentDictionaryByMonth = historyMonthKeys.reduce((result, monthKey, index) => {
            result[monthKey] = buildAgentDictionary(
              sheetDataToParseResult(historicalSheets[index].csid).data,
            );
            return result;
          }, {} as Record<string, Record<string, { name: string; bpo: string; teamLeader: string }>>);

          const fileNames = {
            csidFile: `CSID (${loadedMonthLabel})`,
            productivityFile: `Productivity (${loadedMonthLabel})`,
            csatScFile: `CSAT SC (${loadedMonthLabel})`,
            slaFile: `SLA (${loadedMonthLabel})`,
            scheduleFile: `Schedule (${loadedMonthLabel})`,
            qaFile: `QA (${loadedMonthLabel})`,
          };
          const monthDict = agentDictionaryByMonth[selectedMonth];
          const agentDictionary = isAgentDictionaryPopulated(monthDict) ? monthDict : newAgentDict;
          const monthRange = getDateRangeForSheetMonth(selectedMonth);

          set({
            csidFile: new File([], fileNames.csidFile),
            productivityFile: new File([], fileNames.productivityFile),
            csatScFile: new File([], fileNames.csatScFile),
            slaFile: new File([], fileNames.slaFile),
            scheduleFile: new File([], fileNames.scheduleFile),
            qaFile: new File([], fileNames.qaFile),

            csidData: csvCsid.data,
            productivityData: csvProductivity.data,
            csatScData: csvCsatSc.data,
            slaData: csvSla.data,
            scheduleData: csvSchedule.data,
            qaData: csvQa.data,

            agentDictionary,
            agentDictionaryByMonth,
            activeMonthRowCounts: currentMonthRows,
            activeMonthLastDates: currentMonthLastDates,
            missingHistoryMonths,
            lastSyncTime: syncedAt,
            ...(final ? { isFetchingSheets: false, sheetsSyncProgress: null, sheetsLoaded: loadedSummary } : {}),
            dataSource: 'sheets',
            sheetsSnapshotRevision: SHEETS_SNAPSHOT_REVISION,
            fileNames,
            ...(monthRange ? { startDate: monthRange.start, endDate: monthRange.end } : {}),
          });

          if (!final) return;

          const persistGen = gen;
          sheetsPersistChain = sheetsPersistChain.then(async () => {
            if (persistGen !== sheetsSyncGeneration) return;
            try {
              await Promise.all([
                saveData('csidFile', csvCsid.data),
                saveData('productivityFile', csvProductivity.data),
                saveData('csatScFile', csvCsatSc.data),
                saveData('slaFile', csvSla.data),
                saveData('scheduleFile', csvSchedule.data),
                saveData('qaFile', csvQa.data),
                saveData('sheetsMeta', {
                  dataSource: 'sheets',
                  selectedSheetMonth: selectedMonth,
                  lastSyncTime: syncedAt.toISOString(),
                  activeMonthRowCounts: currentMonthRows,
                  activeMonthLastDates: currentMonthLastDates,
                  missingHistoryMonths,
                  agentDictionary,
                  agentDictionaryByMonth,
                  fileNames,
                  sheetsSnapshotRevision: SHEETS_SNAPSHOT_REVISION,
                  loadedMonths: loadedSummary.months,
                  rosterMonths: loadedSummary.roster,
                  scheduleOnlyMonths: loadedSummary.scheduleOnly,
                }),
              ]);
              if (persistGen !== sheetsSyncGeneration) return;
              const persisted = await listKeys();
              if (persistGen !== sheetsSyncGeneration) return;
              set({ persistedKeys: persisted });
            } catch (err) {
              console.warn('Failed to persist sheets snapshot', err);
            }
          });
        };

        // 1) Show the active month right away (history still loading). Months already in memory are included, so growing
        //    the history of a month on screen never drops what is loaded for a moment.
        const stillToLoad = historyMonthKeys.some((monthKey) => monthKey !== selectedMonth && !monthCache.has(monthKey));
        if (historyMonthKeys.length > 1 && stillToLoad && !reusableCurrent) {
          commitSnapshot(
            historyMonthKeys.map((monthKey) =>
              monthKey === selectedMonth ? currentMonthData : monthCache.get(monthKey)?.data ?? emptyAllSheetsData(),
            ),
            [],
            false,
            laterMonthKeys.map((monthKey) => monthCache.get(monthKey)?.data).filter((d): d is typeof currentMonthData => !!d),
          );
          patchProgress('Mengambil riwayat bulan sebelumnya...', { history: 'active' });
        }

        // 2) History complete → final snapshot, persisted for the next boot.
        const historyResults = await Promise.all(historyPromises);
        const laterResults = await Promise.all(laterPromises);
        if (gen !== sheetsSyncGeneration) return;
        patchProgress('Dataset siap', { history: 'done', assemble: 'done' });

        const missingHistoryMonths: string[] = [];
        const historicalSheets = historyResults.map((result, index) => {
          if (result) return result;
          // Only months that were meant to be complete count as missing; a schedule-only month that failed is not worth a warning.
          if (fullKeys.has(historyMonthKeys[index])) missingHistoryMonths.push(historyMonthKeys[index]);
          return emptyAllSheetsData();
        });
        const isScheduleOnly = (monthKey: string) => !!monthCache.get(monthKey)?.scheduleOnly;
        // `months` lists every month that was tried, found or not (a tab that does not exist must not be asked for again on every
        // screen change); `roster` only those that actually loaded.
        loadedSummary = {
          months: [...historyMonthKeys, ...laterMonthKeys],
          roster: historyMonthKeys.filter((key, index) => historyResults[index] && !isScheduleOnly(key)),
          scheduleOnly: historyMonthKeys.filter((key, index) => historyResults[index] && isScheduleOnly(key)),
        };
        trimMonthCache(new Set(historyMonthKeys.slice(-(Math.max(depthForRun, requestedScheduleDepth) + 1))));
        commitSnapshot(historicalSheets, missingHistoryMonths, true, laterResults.filter((d): d is typeof currentMonthData => !!d));

      } catch (error) {
        if (gen !== sheetsSyncGeneration) return;
        if (isAbortError(error) || signal.aborted) {
          set({ isFetchingSheets: false, sheetsSyncProgress: null });
          return;
        }
        const message = error instanceof Error ? error.message : 'Gagal mengambil data dari Google Sheets';
        const isFlakyNetwork = isTransientNetworkError(error);
        set({
          isFetchingSheets: false,
          sheetsSyncProgress: null,
          sheetsFetchError: isFlakyNetwork
            ? 'Koneksi ke Google Sheets terputus saat loading pertama. Coba Sync lagi.'
            : message,
        });
      }
    })();

    run.then(settle!, fail!);
    try {
      await wrapper;
    } finally {
      if (inFlightSheetsFetch?.promise === wrapper) inFlightSheetsFetch = null;
    }
  },

  ensureSheetsHistory: async ({ depth, scheduleDepth, nextMonth }) => {
    if (get().dataSource !== 'sheets') return;
    requestedHistoryDepth = Math.max(requestedHistoryDepth, depth);
    requestedScheduleDepth = Math.max(requestedScheduleDepth, scheduleDepth, requestedHistoryDepth);
    requestedNextMonth = requestedNextMonth || nextMonth;
    const isCovered = () => {
      const selected = get().selectedSheetMonth;
      const loaded = get().sheetsLoaded;
      if (!loaded || !loaded.roster.includes(selected)) return false;
      const full = getSheetMonthHistoryKeys(selected, depth);
      const next = nextMonth ? getNextSheetMonthKey(selected) : null;
      if (next && !isFutureSheetMonth(next)) full.push(next);
      const withSchedule = getSheetMonthHistoryKeys(selected, scheduleDepth);
      return full.every((key) => loaded.months.includes(key) && !loaded.scheduleOnly.includes(key))
        && withSchedule.every((key) => loaded.months.includes(key));
    };
    if (isCovered()) return;
    // A sync already running was started with a smaller request: let it finish, then load what is still missing.
    while (inFlightSheetsFetch) {
      await inFlightSheetsFetch.promise.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (isCovered()) return;
    await get().fetchFromSheets({ reuseCurrentMonth: true });
  },
}));

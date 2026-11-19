import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from './store';
import { getPreviousMonthPeriodToDate, getPreviousPeriod } from './lib/dataProcessor';
import { planComparison, planTabOf } from './lib/comparisonPlan';
import { buildWeekCompare } from './lib/weekCompare';
import { isAdminMode } from './lib/adminMode';
import { formatRelativeTime, isStaleSync, countDataRows, extractCsIds, getProductivityDuplicateCount } from './lib/dataQuality';
import { laggingSources } from './lib/sourceFreshness';
import { useFilteredKpis } from './hooks/useFilteredKpis';
import { formatLocalDate, getCurrentMonthValue, getMonthValue, getMonthRange, getCurrentMonthRange } from './lib/dates';
import { getSheetMonthKeyFromDate, getSheetMonthHistoryKeys, getSheetMonthOption } from './lib/sheetsApi';

import { 
  LayoutDashboard,
  Activity,
  Star,
  UserCircle,
  FolderDown,
  ImageDown,
  CheckCircle,
  Menu,
  X,
  RefreshCw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Calculator,
  Check,
  AlertTriangle
} from 'lucide-react';

import { cn } from './lib/utils';

import { SearchableSelect } from './components/ui/SearchableSelect';
import { TabSkeleton } from './components/ui/TabSkeleton';
import { BootLoadingPanel } from './components/ui/BootLoadingPanel';
import { TabErrorBoundary } from './components/ui/TabErrorBoundary';
import { useProcessedKpis } from './hooks/useProcessedKpis';

// Each tab is its own chunk. `loadTab` lets us start fetching a chunk before the user clicks (hover / idle),
// so opening a tab does not wait for the network. Repeated calls are free: the module is cached after the first import.
const loadTab = {
  files: () => import('./components/dashboard/FileCenter'),
  summary: () => import('./components/dashboard/DashboardSummary'),
  productivity: () => import('./components/dashboard/ProductivityDetail'),
  csat_official: () => import('./components/csat/CsatOfficialMonitor'),
  csat: () => import('./components/csat/CsatRoom'),
  csat_rca: () => import('./components/csat/CsatRcaMonitor'),
  sla: () => import('./components/sla/SlaWhuMonitor'),
  qa: () => import('./components/qa/QaAgent360'),
  leaderboard: () => import('./components/team/Leaderboard'),
  incentive: () => import('./components/team/IncentiveSimulation'),
  weekly_export: () => import('./components/export/WeeklyExport'),
  schedule: () => import('./components/team/ScheduleAttendance'),
} as const;
const prefetchTab = (id: string) => {
  const load = (loadTab as Record<string, (() => Promise<unknown>) | undefined>)[id];
  if (load) void load().catch(() => {});
};

const FileCenter = React.lazy(() => loadTab.files().then(module => ({ default: module.FileCenter })));
const DashboardSummary = React.lazy(() => loadTab.summary().then(module => ({ default: module.DashboardSummary })));
const ProductivityDetail = React.lazy(() => loadTab.productivity().then(module => ({ default: module.ProductivityDetail })));
const CsatOfficialMonitor = React.lazy(() => loadTab.csat_official().then(module => ({ default: module.CsatOfficialMonitor })));
const CsatRoom = React.lazy(() => loadTab.csat().then(module => ({ default: module.CsatRoom })));
const CsatRcaMonitor = React.lazy(() => loadTab.csat_rca().then(module => ({ default: module.CsatRcaMonitor })));
const SlaWhuMonitor = React.lazy(() => loadTab.sla().then(module => ({ default: module.SlaWhuMonitor })));
const QaAgent360 = React.lazy(() => loadTab.qa().then(module => ({ default: module.QaAgent360 })));
const Leaderboard = React.lazy(() => loadTab.leaderboard().then(module => ({ default: module.Leaderboard })));
const IncentiveSimulation = React.lazy(() => loadTab.incentive().then(module => ({ default: module.IncentiveSimulation })));
const WeeklyExport = React.lazy(() => loadTab.weekly_export().then(module => ({ default: module.WeeklyExport })));
const ScheduleAttendance = React.lazy(() => loadTab.schedule().then(module => ({ default: module.ScheduleAttendance })));

function TabLoading() {
  return <TabSkeleton />;
}

interface ActiveFilterChipProps {
  label: string;
  value: string;
  onClear: () => void;
}

function ActiveFilterChip({ label, value, onClear }: ActiveFilterChipProps) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-strong bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-text-primary">
      <span className="shrink-0 text-text-muted">{label}:</span>
      <span className="min-w-0 truncate">{value}</span>
      <button
        type="button"
        onClick={onClear}
        className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-border-strong hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label={`Clear ${label} filter`}
      >
        <X size={11} />
      </button>
    </span>
  );
}

function formatFilterDate(date: string) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function getMonthOptions() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return {
      value,
      label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date),
    };
  });
}

interface MonthPickerProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function MonthPicker({ value, options, onChange }: MonthPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = React.useId();
  const selectedOption = options.find(option => option.value === value);

  const updateMenuPos = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 192);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setMenuPos({ top: rect.bottom + 4, left, width });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
    const onScrollOrResize = () => updateMenuPos();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  return (
    <div className="relative w-[156px] shrink-0" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-full items-center justify-between rounded-[12px] bg-black/[0.07] px-3 text-[13.5px] font-semibold text-text-primary transition-colors hover:bg-black/[0.1] focus:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <span className="truncate">{selectedOption?.label || 'Pilih bulan'}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </button>

      {isOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label="Pilih bulan"
            className="fixed z-[200] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_32px_rgba(20,24,40,0.16)]"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          >
            <div className="max-h-64 overflow-y-auto p-1">
              {options.map(option => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                      isSelected ? "bg-primary-soft font-semibold text-primary" : "text-text-primary hover:bg-surface-muted"
                    )}
                  >
                    <span>{option.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}


export default function App() {
  const [activeTab, setActiveTab] = useState('summary');
  // The sidebar highlight follows `activeTab` at once; the page itself follows `shownTab`. React keeps the previous page
  // on screen until the new one is ready instead of flashing the loading fallback (which it also holds for ~300 ms).
  const shownTab = React.useDeferredValue(activeTab);
  const isTabPending = shownTab !== activeTab;
  // Keep <Suspense> OUTSIDE the keyed page wrapper below: a boundary that stays mounted lets React hold the old page while
  // the next one loads. A boundary remounted per tab shows its fallback and then keeps it for ~300 ms.

  // Warm the other tabs shortly after boot so the first click on each one is instant.
  useEffect(() => {
    const ids = ['productivity', 'qa', 'csat_official', 'csat', 'sla', 'incentive', 'schedule', 'csat_rca'];
    const timers: number[] = [];
    const start = window.setTimeout(() => {
      ids.forEach((id, i) => timers.push(window.setTimeout(() => prefetchTab(id), i * 300)));
    }, 2000);
    return () => { window.clearTimeout(start); timers.forEach((t) => window.clearTimeout(t)); };
  }, []);
  const isAdmin = useMemo(() => isAdminMode(), []);
  const formatClock = (date: Date) => date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Tablet (768–1099px): sidebar starts minimized so content gets the width; manual toggle still works.
  const TABLET_MQ = '(min-width: 768px) and (max-width: 1099px)';
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(TABLET_MQ).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(TABLET_MQ);
    const onChange = (e: MediaQueryListEvent) => setIsSidebarMinimized(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const hasAutoFetchedSheetsRef = useRef(false);
  const autoRetryCountRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One continuous boot loader: stays up from hydrate through the first sync so
  // the panel never flashes off in the gap between "hydrate done" and "sync started".
  const [initialSyncSettled, setInitialSyncSettled] = useState(!import.meta.env.VITE_SHEETS_API_KEY);
  
  const {
    csidData, productivityData, csatScData, slaData, scheduleData, qaData,
    startDate, endDate, selectedBpo, selectedTL, selectedGlobalAgent, agentDictionary, agentDictionaryByMonth, selectedSheetMonth,
    setDateRange, setSelectedBpo, setSelectedTL, setSelectedGlobalAgent, setSelectedSheetMonth,
    isHydrating, hydrateFromStorage,
    isFetchingSheets, fetchFromSheets, lastSyncTime, sheetsFetchError, sheetsSyncProgress, activeMonthRowCounts, activeMonthLastDates, missingHistoryMonths,
    isComparisonEnabled, setIsComparisonEnabled, comparisonMode, setComparisonMode,
    pendingTab, clearPendingTab,
  } = useStore(useShallow((s) => ({
    csidData: s.csidData,
    productivityData: s.productivityData,
    csatScData: s.csatScData,
    slaData: s.slaData,
    scheduleData: s.scheduleData,
    qaData: s.qaData,
    startDate: s.startDate,
    endDate: s.endDate,
    selectedBpo: s.selectedBpo,
    selectedTL: s.selectedTL,
    selectedGlobalAgent: s.selectedGlobalAgent,
    agentDictionary: s.agentDictionary,
    agentDictionaryByMonth: s.agentDictionaryByMonth,
    selectedSheetMonth: s.selectedSheetMonth,
    setDateRange: s.setDateRange,
    setSelectedBpo: s.setSelectedBpo,
    setSelectedTL: s.setSelectedTL,
    setSelectedGlobalAgent: s.setSelectedGlobalAgent,
    setSelectedSheetMonth: s.setSelectedSheetMonth,
    isHydrating: s.isHydrating,
    hydrateFromStorage: s.hydrateFromStorage,
    isFetchingSheets: s.isFetchingSheets,
    fetchFromSheets: s.fetchFromSheets,
    lastSyncTime: s.lastSyncTime,
    sheetsFetchError: s.sheetsFetchError,
    sheetsSyncProgress: s.sheetsSyncProgress,
    activeMonthRowCounts: s.activeMonthRowCounts,
    activeMonthLastDates: s.activeMonthLastDates,
    missingHistoryMonths: s.missingHistoryMonths,
    isComparisonEnabled: s.isComparisonEnabled,
    setIsComparisonEnabled: s.setIsComparisonEnabled,
    comparisonMode: s.comparisonMode,
    setComparisonMode: s.setComparisonMode,
    pendingTab: s.pendingTab,
    clearPendingTab: s.clearPendingTab,
  })));

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (!pendingTab) return;
    setActiveTab(pendingTab);
    clearPendingTab();
  }, [pendingTab, clearPendingTab]);

  // Auto-sync on every page load — always fetch fresh data, even if cache
  // exists. Cached data shows immediately while sync runs in background.
  useEffect(() => {
    if (!import.meta.env.VITE_SHEETS_API_KEY) return;
    if (isHydrating || isFetchingSheets) return;
    if (hasAutoFetchedSheetsRef.current) return;

    hasAutoFetchedSheetsRef.current = true;
    autoRetryCountRef.current = 0;
    void fetchFromSheets();
  }, [fetchFromSheets, isFetchingSheets, isHydrating]);

  // Auto-retry on sync failure so loading never gets stuck on an error.
  useEffect(() => {
    if (!sheetsFetchError) return;
    if (autoRetryCountRef.current >= 3) return;

    const retryCount = ++autoRetryCountRef.current;
    const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
    autoRetryTimerRef.current = setTimeout(() => {
      hasAutoFetchedSheetsRef.current = false;
      void fetchFromSheets();
    }, delay);
    return () => {
      if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
    };
  }, [sheetsFetchError, fetchFromSheets]);

  // Keep a long-open tab fresh: re-sync every 10 min and when the tab becomes
  // visible again after being away. Agents never have to refresh manually.
  useEffect(() => {
    if (!import.meta.env.VITE_SHEETS_API_KEY) return;
    const REFRESH_MS = 10 * 60 * 1000;
    const refreshIfDue = () => {
      if (document.visibilityState !== 'visible') return;
      const { isFetchingSheets: busy, isHydrating: hydrating, lastSyncTime: last, dataSource } = useStore.getState();
      if (busy || hydrating || dataSource !== 'sheets') return;
      if (last && Date.now() - last.getTime() < REFRESH_MS) return;
      void useStore.getState().fetchFromSheets();
    };
    const intervalId = window.setInterval(refreshIfDue, 60 * 1000);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshIfDue);
    };
  }, []);

  // Reset retry counter when sync succeeds.
  useEffect(() => {
    if (!isFetchingSheets && !sheetsFetchError && lastSyncTime) {
      autoRetryCountRef.current = 0;
    }
  }, [isFetchingSheets, sheetsFetchError, lastSyncTime]);

  const syncStatusText = isFetchingSheets
    ? (sheetsSyncProgress?.message || 'Menyinkronkan data...')
    : sheetsFetchError
      ? 'Gagal memperbarui, mencoba lagi otomatis. Data yang tampil bisa belum terbaru.'
      : lastSyncTime
        ? ''
        : 'Menunggu sync';
  const syncIsStale = isStaleSync(lastSyncTime);
  const syncDotColor = isFetchingSheets
    ? 'bg-primary animate-pulse'
    : sheetsFetchError
      ? 'bg-danger animate-pulse'
      : syncIsStale
        ? 'bg-warning'
        : lastSyncTime
          ? 'bg-success'
          : 'bg-border';
  const dataQuality = useMemo(() => {
    // First-ever sync in progress: nothing to review yet — stay neutral.
    if (isFetchingSheets && !lastSyncTime) {
      return {
        status: 'ok' as const,
        label: 'Memuat…',
        detail: 'Sinkronisasi pertama sedang berjalan',
        count: 0,
      };
    }

    const sourceRows = [
      { label: 'Master', rows: activeMonthRowCounts?.csidData ?? countDataRows(csidData) },
      { label: 'Productivity', rows: activeMonthRowCounts?.productivityData ?? countDataRows(productivityData) },
      { label: 'CSAT SC', rows: activeMonthRowCounts?.csatScData ?? countDataRows(csatScData) },
      { label: 'SLA', rows: activeMonthRowCounts?.slaData ?? countDataRows(slaData) },
      { label: 'Schedule', rows: activeMonthRowCounts?.scheduleData ?? countDataRows(scheduleData) },
      { label: 'QA', rows: activeMonthRowCounts?.qaData ?? countDataRows(qaData) },
    ];
    const missingSources = sourceRows.filter((source) => source.rows === 0);
    const masterIds = new Set(Object.keys(agentDictionary || {}));
    const productivityIds = extractCsIds(productivityData);
    const scheduleIds = extractCsIds(scheduleData);
    const missingProductivity = Array.from(masterIds).filter((id) => !productivityIds.has(id)).length;
    const missingSchedule = Array.from(masterIds).filter((id) => !scheduleIds.has(id)).length;
    const duplicateProductivityRows = getProductivityDuplicateCount(productivityData);
    const lags = laggingSources(activeMonthLastDates || {});

    let warningCount = 0;
    if (syncIsStale) warningCount += 1;
    if (missingProductivity > 0) warningCount += 1;
    if (missingSchedule > 0) warningCount += 1;
    if (duplicateProductivityRows > 0) warningCount += 1;
    if (lags.length > 0) warningCount += 1;

    const errorCount = (sheetsFetchError ? 1 : 0) + missingSources.length;
    const detailParts = [
      sheetsFetchError ? 'sync error' : '',
      missingSources.length ? `${missingSources.length} missing source` : '',
      missingProductivity ? `${missingProductivity} missing productivity` : '',
      missingSchedule ? `${missingSchedule} missing schedule` : '',
      duplicateProductivityRows ? `${duplicateProductivityRows} duplicate suspect` : '',
      lags.length ? `${lags[0].label} tertinggal ${lags[0].lagDays} hari` : '',
      syncIsStale ? 'stale sync' : '',
    ].filter(Boolean);

    if (errorCount > 0) {
      return {
        status: 'error' as const,
        label: 'Need Review',
        detail: detailParts.join(' | '),
        count: errorCount + warningCount,
      };
    }

    if (warningCount > 0) {
      return {
        status: 'warning' as const,
        label: `${warningCount} Warning${warningCount > 1 ? 's' : ''}`,
        detail: detailParts.join(' | '),
        count: warningCount,
      };
    }

    return {
      status: 'ok' as const,
      label: 'Data OK',
      detail: lastSyncTime ? `Tersinkron ${formatRelativeTime(lastSyncTime)}` : 'Menunggu sync',
      count: 0,
    };
  }, [
    isFetchingSheets,
    agentDictionary,
    activeMonthRowCounts,
    activeMonthLastDates,
    csidData,
    productivityData,
    csatScData,
    slaData,
    scheduleData,
    qaData,
    lastSyncTime,
    sheetsFetchError,
    syncIsStale,
  ]);

  // What to compute for this tab (previous periods, rolling weeks, export months): see lib/comparisonPlan.ts.
  // Keyed on the tab *kind*, not the tab id, so switching between two comparison tabs keeps the same period objects
  // (and so does not trigger another worker pass).
  const planTab = planTabOf(activeTab);
  const productivityLastDate = activeMonthLastDates?.productivityData ?? null;
  const plan = useMemo(() => {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return planComparison({ tab: planTab, isComparisonEnabled, comparisonMode, startDate, endDate, productivityLastDate, todayIso });
  }, [planTab, isComparisonEnabled, comparisonMode, startDate, endDate, productivityLastDate]);
  const { comparisonTabs, needsComparisonData, passivePrevMonth, weekRanges, monthRanges } = plan;
  const previousPeriods = useMemo(() => ({ prev1: plan.prev1, prev2: plan.prev2, prev3: plan.prev3 }), [plan]);

  // Auto-disable comparison when switching to a tab that doesn't support it.
  useEffect(() => {
    if (!comparisonTabs && isComparisonEnabled) {
      setIsComparisonEnabled(false);
    }
  }, [comparisonTabs, isComparisonEnabled, setIsComparisonEnabled]);

  // Leaderboard is hidden — bounce any persisted/stale nav state to Summary.
  useEffect(() => {
    if (activeTab === 'leaderboard') setActiveTab('summary');
    // Pilot CSAT and Simulasi Takeout were removed — bounce stale persisted nav state.
    if (activeTab === 'pilot' || activeTab === 'csat_takeout') setActiveTab('summary');
    // Attendance Monitor was merged into "Jadwal & Kehadiran".
    if (activeTab === 'attendance') setActiveTab('schedule');
  }, [activeTab]);

  const hasSourceData =
    productivityData.length > 0
    || csatScData.length > 0
    || slaData.length > 0
    || scheduleData.length > 0
    || qaData.length > 0
    || csidData.length > 0;

  // Simulasi Insentif buckets QA by Tanggal Case (col I); every other tab keeps Checking Date.
  const incentivePeriodRange = useMemo(
    () => (activeTab === 'incentive' && startDate && endDate ? { start: startDate, end: endDate } : null),
    [activeTab, startDate, endDate],
  );

  // Yield between KPI passes so boot UI does not freeze/"patah".
  const { bundle: kpiRawBundle, isProcessing: isProcessingKpis } = useProcessedKpis({
    productivityData,
    csatScData,
    slaData,
    scheduleData,
    qaData,
    startDate,
    endDate,
    agentDictionary,
    agentDictionaryByMonth,
    needsComparisonData: needsComparisonData || passivePrevMonth,
    prev1: plan.prev1,
    prev2: plan.prev2,
    prev3: plan.prev3,
    // Simulasi Insentif runs on the live active period.
    incentivePeriod: incentivePeriodRange,
    weekPeriods: weekRanges,
    extraPeriods: monthRanges,
    enabled: !isHydrating && hasSourceData,
  });

  const {
    rawData,
    previousRawData,
    previousRawData2,
    previousRawData3,
    incentiveRawData,
    weekRawData,
    extraRawData,
  } = kpiRawBundle;

  const { kpiData, previousKpiData, previousKpiData2, previousKpiData3, weekKpiData, extraKpiData, incentiveKpiData, incentivePeriod, tlList, agentList } = useFilteredKpis({
    rawData,
    previousRawData,
    previousRawData2,
    previousRawData3,
    incentiveRawData,
    weekRawData,
    extraRawData,
    activeTab,
    startDate,
    endDate,
    selectedSheetMonth,
    selectedBpo,
    selectedTL,
    selectedGlobalAgent,
    agentDictionary,
    agentDictionaryByMonth,
  });



  const weekCompare = useMemo(() => buildWeekCompare(weekRanges, weekKpiData), [weekRanges, weekKpiData]);

  // Keep persisted/stale scope choices from mixing different BPO rosters.
  useEffect(() => {
    if (
      selectedTL !== 'All TL'
      && selectedTL !== 'All Team Leaders'
      && !tlList.includes(selectedTL)
    ) {
      setSelectedTL('All TL');
    }
  }, [selectedTL, setSelectedTL, tlList]);

  useEffect(() => {
    if (
      selectedGlobalAgent !== 'All Agents'
      && !agentList.includes(selectedGlobalAgent)
    ) {
      setSelectedGlobalAgent('All Agents');
    }
  }, [agentList, selectedGlobalAgent, setSelectedGlobalAgent]);

  const handleBpoChange = (bpo: string) => {
    setSelectedBpo(bpo);
    setSelectedTL('All TL');
    setSelectedGlobalAgent('All Agents');
  };

  const handleTeamLeaderChange = (teamLeader: string) => {
    setSelectedTL(teamLeader);
    setSelectedGlobalAgent('All Agents');
  };

  // Boot loader shows once, continuously, then never comes back. It clears the
  // moment there's data (cached or freshly synced) so a background sync doesn't
  // keep the whole screen blocked; later manual refreshes use the status strip.
  useEffect(() => {
    if (initialSyncSettled) return;
    if (isHydrating) return;                       // still reading IndexedDB cache
    if (hasSourceData) { setInitialSyncSettled(true); return; }
    if (isFetchingSheets) return;                  // no data yet, first sync running — keep panel up
    if (sheetsFetchError || !import.meta.env.VITE_SHEETS_API_KEY) setInitialSyncSettled(true);
  }, [initialSyncSettled, isHydrating, isFetchingSheets, hasSourceData, sheetsFetchError]);

  // Once the KPI pipeline has produced real rows a single time, never blank
  // the whole app for it again — a later recompute (switching to a tab that
  // needs a wider period, changing the date range, a background re-sync)
  // keeps showing what's already on screen (useProcessedKpis is
  // stale-while-revalidate) instead of re-triggering the full boot screen.
  const hasRenderedKpiOnceRef = useRef(false);
  if (rawData.length > 0) hasRenderedKpiOnceRef.current = true;

  const showBootLoading =
    !initialSyncSettled
    || isHydrating
    || (isProcessingKpis && rawData.length === 0 && !hasRenderedKpiOnceRef.current);

  // Apple-Settings-style colour per menu section (RGB triples for the .navico tint).
  const SECTION_TINT: Record<string, string> = {
    KPI: '0 122 255', CSAT: '255 149 0', Service: '52 199 89', Team: '175 82 222', Laporan: '255 45 85', Data: '48 176 199',
  };

  const navItems = [
    { id: 'summary', label: 'Dashboard Summary', icon: LayoutDashboard, section: 'KPI' },
    { id: 'productivity', label: 'Productivity Detail', icon: Activity, section: 'KPI' },
    { id: 'qa', label: 'QA Agent 360', icon: UserCircle, section: 'KPI' },
    { id: 'csat_official', label: 'CSAT Official', icon: Star, section: 'CSAT' },
    { id: 'csat', label: 'CSAT Room (Survey)', icon: Star, section: 'CSAT' },
    { id: 'csat_rca', label: 'CSAT Root Cause', icon: FileText, section: 'CSAT' },
    { id: 'sla', label: 'SLA / WHU Monitor', icon: CheckCircle, section: 'Service' },
    // Leaderboard hidden per 1 Sep 2026 — Simulasi Insentif (live period) is the primary Team view.
    // { id: 'leaderboard', label: 'Leaderboard', icon: Trophy, section: 'Team' },
    { id: 'incentive', label: 'Simulasi Insentif', icon: Calculator, section: 'Team' },
    { id: 'schedule', label: 'Jadwal & Kehadiran', icon: Calendar, section: 'Team' },
    { id: 'weekly_export', label: 'Ekspor Slide', icon: ImageDown, section: 'Laporan' },
    ...(isAdmin ? [{ id: 'files', label: 'File Center', icon: FolderDown, section: 'Data' }] : []),
  ];

  const activeNavLabel = navItems.find((item) => item.id === activeTab)?.label || 'tab';

  const navigateWeek = (dir: 'prev' | 'next' | 'current') => {
    if (dir === 'current') {
      const d = new Date();
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      const t1 = formatLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const end = new Date(d);
      end.setDate(end.getDate() + 6);
      setDateRange(t1, formatLocalDate(end.getFullYear(), end.getMonth() + 1, end.getDate()));
      return;
    }
    if (startDate) {
      const s = new Date(startDate);
      const e = new Date(endDate || startDate);
      const offset = dir === 'next' ? 7 : -7;
      s.setDate(s.getDate() + offset);
      e.setDate(e.getDate() + offset);
      setDateRange(
        formatLocalDate(s.getFullYear(), s.getMonth() + 1, s.getDate()),
        formatLocalDate(e.getFullYear(), e.getMonth() + 1, e.getDate()),
      );
    } else {
      const now = new Date();
      const day = now.getDay() || 7;
      now.setDate(now.getDate() - day + 1);
      const t1 = formatLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const end = new Date(now);
      end.setDate(end.getDate() + 6);
      setDateRange(t1, formatLocalDate(end.getFullYear(), end.getMonth() + 1, end.getDate()));
    }
  };

  const selectedMonthFilter = getMonthValue(startDate);
  const monthOptions = getMonthOptions();
  const defaultDateRange = getCurrentMonthRange();
  const isDefaultDateRange = startDate === defaultDateRange.start && endDate === defaultDateRange.end;
  const hasCustomDateFilter = !!(startDate || endDate) && !isDefaultDateRange;
  const applyMonthFilter = (monthValue: string) => {
    const range = getMonthRange(monthValue);
    setDateRange(range.start, range.end);
    // Keep the roster aligned with the displayed period so TL/BPO
    // follows the month the user is viewing, not just the File Center sync month.
    setSelectedSheetMonth(getSheetMonthKeyFromDate(monthValue));
  };
  const resetPeriodToCurrentMonth = () => {
    setDateRange(defaultDateRange.start, defaultDateRange.end);
  };

  const activeFilters = [
    selectedBpo && selectedBpo !== 'All BPO'
      ? { label: 'BPO', value: selectedBpo, onClear: () => handleBpoChange('All BPO') }
      : null,
    selectedTL && selectedTL !== 'All TL' && selectedTL !== 'All Team Leaders'
      ? { label: 'TL', value: selectedTL, onClear: () => handleTeamLeaderChange('All TL') }
      : null,
    selectedGlobalAgent && selectedGlobalAgent !== 'All Agents'
      ? { label: 'Agent', value: selectedGlobalAgent, onClear: () => setSelectedGlobalAgent('All Agents') }
      : null,
    hasCustomDateFilter
      ? {
          label: 'Tanggal',
          value: `${startDate ? formatFilterDate(startDate) : 'awal'} s/d ${endDate ? formatFilterDate(endDate) : 'akhir'}`,
          onClear: resetPeriodToCurrentMonth,
        }
      : null,
  ].filter((filter): filter is ActiveFilterChipProps => filter !== null);

  const clearAllFilters = () => {
    setSelectedBpo('All BPO');
    setSelectedTL('All TL');
    setSelectedGlobalAgent('All Agents');
    resetPeriodToCurrentMonth();
  };

  const comparisonHint = (() => {
    if (!isComparisonEnabled || !startDate) return null;
    const end = endDate || startDate;
    if (comparisonMode === 'wow' && weekRanges.length > 0) {
      return `WoW: maks. 4 minggu terakhir yang ada datanya (Senin–Minggu), sampai ${formatFilterDate(end)}`;
    }
    const prev = comparisonMode === 'mom'
      ? getPreviousMonthPeriodToDate(startDate, end, productivityLastDate)
      : getPreviousPeriod(startDate, end);
    if (!prev.start || !prev.end) return null;
    const currentLabel = `${formatFilterDate(startDate)} – ${formatFilterDate(end)}`;
    const prevLabel = `${formatFilterDate(prev.start)} – ${formatFilterDate(prev.end)}`;
    return comparisonMode === 'mom'
      ? `MoM: ${currentLabel} vs ${prevLabel}`
      : `WoW: ${currentLabel} vs ${prevLabel}`;
  })();

  const historyGapHint = (() => {
    if (!isComparisonEnabled || !missingHistoryMonths?.length) return null;
    const expected = Math.max(0, getSheetMonthHistoryKeys(selectedSheetMonth).length - 1);
    const labels = missingHistoryMonths.map((k) => getSheetMonthOption(k).label).join(', ');
    return `Perbandingan: ${missingHistoryMonths.length} dari ${expected} bulan riwayat tidak tersedia (${labels}).`;
  })();

  const syncCard = (() => {
    const hasSheets = Boolean(import.meta.env.VITE_SHEETS_API_KEY);
    const clock = lastSyncTime
      ? `${new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(lastSyncTime).replace(':', '.')} WIB`
      : '—';
    if (!hasSheets) return { title: 'Mode CSV', dot: 'bg-success', clock: 'berkas yang diunggah', note: 'Data dibaca dari berkas CSV yang kamu unggah.' };
    if (isFetchingSheets) return { title: 'Menyinkronkan…', dot: 'bg-primary animate-pulse', clock, note: 'Membaca Google Sheets bulan aktif ditambah 3 bulan riwayat.' };
    if (sheetsFetchError) return { title: 'Gagal sinkron', dot: 'bg-danger animate-pulse', clock, note: 'Data yang tampil adalah salinan terakhir. Coba Refresh.' };
    if (syncIsStale) return { title: 'Data mungkin usang', dot: 'bg-warning', clock, note: 'Sinkron terakhir sudah lama. Tekan Refresh untuk memperbarui.' };
    return { title: 'Data tersinkron', dot: 'bg-success', clock, note: 'Membaca Google Sheets bulan aktif ditambah 3 bulan riwayat.' };
  })();

  return (
    <div className="app-canvas flex h-[100dvh] w-full bg-background font-sans text-text-primary overflow-hidden relative transition-colors duration-300">
      
      {/* Mobile Top Bar */}
      <div className="md:hidden glass flex items-center justify-between p-4 text-sidebar-text border-b border-sidebar-border absolute top-0 left-0 w-full z-40 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-gradient-to-b from-brand/85 to-brand shadow-[0_2px_6px_rgb(var(--brand)/0.35)] flex items-center justify-center text-white font-semibold shrink-0 text-sm">LC</div>
          <span className="font-semibold text-sidebar-text-hover tracking-tight text-sm">Live Dashboard</span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 rounded-lg hover:bg-sidebar-bg-hover transition-colors relative w-10 h-10 flex items-center justify-center overflow-hidden"
          aria-label="Toggle menu"
        >
          <Menu className={cn("w-6 h-6 absolute transition-all duration-300 ease-out", isSidebarOpen ? "scale-0 opacity-0 rotate-90" : "scale-100 opacity-100 rotate-0")} />
          <X className={cn("w-6 h-6 absolute transition-all duration-300 ease-out", isSidebarOpen ? "scale-100 opacity-100 rotate-0" : "scale-0 opacity-0 -rotate-90")} />
        </button>
      </div>

      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden transition-opacity duration-300 ease-out",
          isSidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsSidebarOpen(false)}
        aria-modal={isSidebarOpen ? "true" : undefined}
      />

      {/* Sidebar */}
      <aside className={cn(
        "glass fixed md:relative top-0 left-0 h-full text-sidebar-text flex flex-col border-r border-sidebar-border z-[70] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform shrink-0 group/sidebar",
        isSidebarOpen ? "translate-x-0 w-[236px]" : "-translate-x-full md:translate-x-0",
        isSidebarMinimized ? "md:w-[76px] w-[236px]" : "w-[236px]"
      )}>
        {/* Toggle Button for Desktop */}
        <button
          onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
          className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-card border border-border rounded-full shadow-sm items-center justify-center text-text-muted hover:text-text-primary hover:shadow-md z-50 cursor-pointer"
          title={isSidebarMinimized ? "Expand Sidebar" : "Minimize Sidebar"}
        >
          {isSidebarMinimized ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        <div className={cn("px-4 pt-5 pb-2 overflow-hidden", isSidebarMinimized ? "md:px-4" : "")}>
        <div className={cn("flex items-center gap-3 relative z-10 group cursor-default", isSidebarMinimized ? "md:justify-center" : "")}>
          <div className="w-[42px] h-[42px] rounded-[13px] bg-gradient-to-b from-brand/85 to-brand shadow-[0_6px_16px_rgb(var(--brand)/0.32)] flex items-center justify-center text-white font-bold shrink-0 text-[15px]">LC</div>
          <div className={cn("min-w-0 whitespace-nowrap transition-all duration-300", isSidebarMinimized ? "md:opacity-0 md:w-0" : "opacity-100")}>
            <div className="text-[17px] font-bold tracking-tight text-sidebar-text-hover leading-tight">Live Dashboard</div>
            <div className="text-[13px] text-text-secondary leading-tight mt-0.5">KPI Live Chat · AFI</div>
          </div>
        </div>
      </div>
        <nav className="flex-1 px-2.5 pb-2 space-y-0 overflow-y-auto overflow-x-hidden no-scrollbar">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const prevItem = navItems[idx - 1];
            const isFirstOfSection = !prevItem || item.section !== prevItem.section;
            return (
              <React.Fragment key={item.id}>
                {isFirstOfSection && !isSidebarMinimized && (
                  <div className={cn("px-3 pb-1 text-[11.5px] font-semibold tracking-wide text-text-muted", idx > 0 ? "pt-3" : "pt-0.5")}>{item.section}</div>
                )}
                {isFirstOfSection && isSidebarMinimized && idx > 0 && <div className="mx-3 my-2 h-px bg-sidebar-border" />}
                <button
                  onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }}
                  onMouseEnter={() => prefetchTab(item.id)}
                  onFocus={() => prefetchTab(item.id)}
                  onTouchStart={() => prefetchTab(item.id)}
                  className={cn(
                    "group relative w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[14px] text-[14.5px] font-medium transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] cursor-pointer",
                    isActive
                      ? "bg-card text-sidebar-text-active ring-[2.5px] ring-primary/30 shadow-[0_6px_18px_rgb(30_40_90/0.08)]"
                      : "text-sidebar-text hover:bg-sidebar-bg-hover hover:text-sidebar-text-hover hover:translate-x-0.5",
                    isSidebarMinimized ? "md:justify-center md:px-0 md:hover:translate-x-0" : ""
                  )}
                  title={isSidebarMinimized ? item.label : undefined}
                >
                  <span
                    className="navico grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] transition-transform duration-200 group-hover:scale-105"
                    style={{ '--tint': SECTION_TINT[item.section] || '0 122 255' } as React.CSSProperties}
                  >
                    <Icon className="h-[17px] w-[17px]" />
                  </span>
                  <span className={cn("relative z-10 transition-all duration-300 whitespace-nowrap", isActive && "font-semibold", isSidebarMinimized ? "md:opacity-0 md:w-0" : "opacity-100")}>{item.label}</span>
                </button>
              </React.Fragment>
            )
          })}
        </nav>
        <div className={cn("m-2.5 mt-1.5 rounded-[18px] bg-card/85 p-3 shadow-sm", isSidebarMinimized && "md:p-2 md:flex md:justify-center")}>
          <span className={cn("hidden", isSidebarMinimized && "md:flex")} title={syncCard.title}>
            <span className={cn("h-2.5 w-2.5 rounded-full", syncCard.dot)} />
          </span>
          <div className={cn(isSidebarMinimized && "md:hidden")}>
            <div className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
              <span className={cn("h-2.5 w-2.5 rounded-full", syncCard.dot)} />
              {syncCard.title}
            </div>
            <div className="mt-1 text-[13px] text-text-secondary tabular-nums">{syncCard.clock}</div>
            <p className="mt-1.5 text-[12px] leading-snug text-text-muted [@media(max-height:860px)]:hidden">{syncCard.note}</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-3 pt-20 md:px-8 md:py-6 gap-5 overflow-y-auto overflow-x-hidden w-full relative">
        <div className="ui-card-flat rounded-[20px] px-4 py-2.5 flex flex-col relative z-50 overflow-visible">
          {/* Mobile Filter Toggle */}
          <div className="flex md:hidden items-center justify-between w-full mb-2">
            <span className="text-[11px] font-medium text-text-muted tracking-wide pl-1">Filter</span>
            <div className="flex items-center gap-2">
              {activeFilters.length > 0 && !isMobileFilterOpen && (
                <span className="inline-flex h-6 items-center rounded-full bg-primary-soft border border-primary/20 px-2 text-[11px] font-semibold text-primary">
                  {activeFilters.length} aktif
                </span>
              )}
              <button
                onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-muted transition-colors cursor-pointer"
              >
                {isMobileFilterOpen ? (
                  <>Sembunyikan <ChevronUp size={14} /></>
                ) : (
                  <>Tampilkan filter <ChevronDown size={14} /></>
                )}
              </button>
            </div>
          </div>

          {/* Filter Content — 1 baris compact di desktop agar stabil saat zoom */}
          <div className={cn(
            "flex-col gap-2",
            isMobileFilterOpen ? "flex" : "hidden md:flex"
          )}>
            <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 md:overflow-visible">
              {/* Scope */}
              <div className="flex flex-wrap md:flex-nowrap items-center gap-1.5 md:border-r md:border-border md:pr-2.5 shrink-0">
                                <div className="w-[100px] shrink-0 [&_button]:h-9 [&_button]:rounded-[12px] [&_button]:border-0 [&_button]:bg-black/[0.07] [&_button]:text-[13.5px] [&_button]:px-3">
                  <SearchableSelect 
                    options={['NSI', 'TCID', 'TCID X NSI']}
                    value={selectedBpo}
                    onChange={handleBpoChange}
                    allOptionLabel="All BPO"
                    placeholder="Cari BPO..."
                  />
                </div>
                <div className="w-[112px] shrink-0 [&_button]:h-9 [&_button]:rounded-[12px] [&_button]:border-0 [&_button]:bg-black/[0.07] [&_button]:text-[13.5px] [&_button]:px-3">
                  <SearchableSelect 
                    options={tlList}
                    value={selectedTL}
                    onChange={handleTeamLeaderChange}
                    allOptionLabel="All TL"
                    placeholder="Cari TL..."
                  />
                </div>
                <div className="w-[128px] shrink-0 [&_button]:h-9 [&_button]:rounded-[12px] [&_button]:border-0 [&_button]:bg-black/[0.07] [&_button]:text-[13.5px] [&_button]:px-3">
                  <SearchableSelect
                    options={agentList}
                    value={selectedGlobalAgent}
                    onChange={setSelectedGlobalAgent}
                    allOptionLabel="All Agents"
                    placeholder="Cari agent..."
                  />
                </div>
              </div>
              
              {/* Period */}
              <div className="flex flex-wrap md:flex-nowrap items-center gap-1.5 md:border-r md:border-border md:pr-2.5 shrink-0">
                                <MonthPicker
                  value={selectedMonthFilter || getCurrentMonthValue()}
                  options={monthOptions}
                  onChange={applyMonthFilter}
                />
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilter(v => !v)}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-[12px] px-3 text-[13.5px] font-medium transition-colors whitespace-nowrap",
                    showAdvancedFilter || hasCustomDateFilter
                      ? "bg-primary-soft text-primary-text"
                      : "bg-black/[0.07] text-text-primary hover:bg-black/[0.1]"
                  )}
                  aria-expanded={showAdvancedFilter}
                >
                  <Calendar size={14} />
                  Rentang &amp; minggu
                  {hasCustomDateFilter && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  {showAdvancedFilter ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {/* Compare — only on tabs that support comparison */}
              {comparisonTabs && (
              <div className="flex flex-wrap md:flex-nowrap items-center gap-1.5 shrink-0">
                                <button
                  type="button"
                  role="switch"
                  aria-checked={isComparisonEnabled}
                  className="flex h-9 items-center gap-2 rounded-[12px] bg-black/[0.07] pl-2.5 pr-3 transition-colors hover:bg-black/[0.1] group cursor-pointer"
                  onClick={() => setIsComparisonEnabled(!isComparisonEnabled)}
                >
                  <div className={cn("w-[42px] h-[26px] rounded-full relative transition-colors duration-200", isComparisonEnabled ? "bg-primary" : "bg-border-strong")}>
                    <div className={cn("absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.25)] transition-transform duration-200", isComparisonEnabled ? "translate-x-4" : "translate-x-0")} />
                  </div>
                  <span className="text-[13.5px] font-medium text-text-primary whitespace-nowrap">Bandingkan</span>
                </button>

                <div className={cn(
                  "flex h-9 items-center rounded-[12px] bg-black/[0.07] p-1 gap-0.5 transition-opacity",
                  isComparisonEnabled ? "opacity-100" : "opacity-70"
                )}>
                  <button
                    type="button"
                    onClick={() => {
                      setComparisonMode('wow');
                      setIsComparisonEnabled(true);
                    }}
                    className={cn(
                      "text-[12.5px] px-2.5 py-1 rounded-[9px] font-semibold transition-colors cursor-pointer",
                      comparisonMode === 'wow' && isComparisonEnabled ? "bg-card text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
                    )}
                    title="WoW membandingkan dengan periode sebelumnya dengan durasi yang sama"
                  >
                    WoW
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setComparisonMode('mom');
                      setIsComparisonEnabled(true);
                    }}
                    className={cn(
                      "text-[12.5px] px-2.5 py-1 rounded-[9px] font-semibold transition-colors cursor-pointer",
                      comparisonMode === 'mom' && isComparisonEnabled ? "bg-card text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
                    )}
                    title="MoM membandingkan dengan bulan sebelumnya"
                  >
                    MoM
                  </button>
                </div>
              </div>
              )}

              {selectedTL && selectedTL !== 'All TL' && selectedTL !== 'All Team Leaders' && (
                <div className="inline-flex h-9 items-center px-3 rounded-[12px] bg-primary-soft text-primary-text text-[13px] font-medium shrink-0 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5"></span>
                  Tim {selectedTL}
                </div>
              )}
            </div>

            {/* Advanced: custom date range + week nav — hidden by default */}
            {showAdvancedFilter && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-2">
                <span className="text-[11px] font-medium text-text-muted tracking-wide">Rentang</span>
                <input type="date" className="h-8 w-[128px] shrink-0 rounded-lg border border-border bg-surface px-2 text-xs font-medium text-text-primary transition-colors focus:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" value={startDate || ''} onChange={e => setDateRange(e.target.value, endDate)} />
                <span className="text-text-muted text-[11px] shrink-0">–</span>
                <input type="date" className="h-8 w-[128px] shrink-0 rounded-lg border border-border bg-surface px-2 text-xs font-medium text-text-primary transition-colors focus:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" value={endDate || ''} onChange={e => setDateRange(startDate, e.target.value)} />
                <button onClick={resetPeriodToCurrentMonth} className="h-8 rounded-lg px-2 text-[11px] font-semibold text-text-muted transition-colors hover:bg-primary-soft hover:text-primary whitespace-nowrap">Bulan Ini</button>
                <div className="flex h-8 items-center bg-card rounded-lg border border-border p-0.5 gap-0.5">
                  <button onClick={() => navigateWeek('prev')} className="text-[11px] hover:bg-surface-muted text-text-secondary px-1.5 py-1 rounded font-medium transition-colors cursor-pointer whitespace-nowrap">&laquo;</button>
                  <button onClick={() => navigateWeek('current')} className="text-[11px] bg-primary-soft text-primary px-2 py-1 rounded font-medium transition-colors cursor-pointer whitespace-nowrap">Minggu Ini</button>
                  <button onClick={() => navigateWeek('next')} className="text-[11px] hover:bg-surface-muted text-text-secondary px-1.5 py-1 rounded font-medium transition-colors cursor-pointer whitespace-nowrap">&raquo;</button>
                </div>
              </div>
            )}

            {/* Status strip — selalu satu baris tipis di bawah */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-1.5">
              <div className="flex min-w-0 flex-col gap-0.5 text-[12.5px] leading-tight">
                {comparisonHint ? (
                  <span className="font-medium text-primary">
                    Bandingkan · {comparisonHint}
                  </span>
                ) : null}
                {historyGapHint ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-warning">
                    <AlertTriangle size={11} className="shrink-0" />
                    {historyGapHint}
                  </span>
                ) : null}
                {import.meta.env.VITE_SHEETS_API_KEY && !showBootLoading && (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', syncDotColor)} />
                      {syncStatusText ? (
                        <span className={cn(
                          "font-medium",
                          isFetchingSheets ? "text-primary" : sheetsFetchError ? "text-danger" : syncIsStale ? "text-warning" : "text-text-secondary"
                        )}>
                          {syncStatusText}
                        </span>
                      ) : null}
                    </span>
                    {lastSyncTime && !isFetchingSheets && !sheetsFetchError && (
                      <span className={cn("text-text-muted", syncIsStale && "text-warning")}>
                        {syncIsStale ? `Data per ${formatClock(lastSyncTime)} (${formatRelativeTime(lastSyncTime)}), klik Refresh untuk update.` : `Data per ${formatClock(lastSyncTime)}`}
                      </span>
                    )}
                  </>
                )}
              </div>
              {activeFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeFilters.map((filter) => (
                    <React.Fragment key={filter.label}>
                      <ActiveFilterChip label={filter.label} value={filter.value} onClear={filter.onClear} />
                    </React.Fragment>
                  ))}
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    Hapus semua
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  type="button"
                  onClick={() => { if (isAdmin) setActiveTab('files'); }}
                  title={dataQuality.detail}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors",
                    dataQuality.status === 'ok'
                      ? "border-success/30 bg-success/10 text-success hover:bg-success/15"
                      : dataQuality.status === 'warning'
                        ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15"
                        : "border-danger/30 bg-danger-soft text-danger hover:bg-danger-soft/80"
                  )}
                >
                  {dataQuality.status === 'ok' ? (
                    <CheckCircle size={12} />
                  ) : (
                    <AlertTriangle size={12} />
                  )}
                  <span>{dataQuality.label}</span>
                </button>
                {import.meta.env.VITE_SHEETS_API_KEY && (
                  <button
                    onClick={fetchFromSheets}
                    disabled={isFetchingSheets}
                    className={`flex h-7 items-center gap-1 px-2.5 
                      rounded-lg text-[11px] font-medium transition-colors
                      border border-border shrink-0
                      ${isFetchingSheets 
                        ? 'bg-surface-muted text-text-muted cursor-not-allowed' 
                        : 'bg-card text-text-secondary hover:bg-primary-soft hover:text-primary cursor-pointer'
                      }`}
                  >
                    <RefreshCw 
                      size={11} 
                      className={isFetchingSheets ? 'animate-spin' : ''} 
                    />
                   {isFetchingSheets ? 'Menyinkronkan...' : 'Refresh'}
                 </button>
               )}
              </div>
           </div>
          </div>

        </div>

        <div className="w-full pb-8">
          {showBootLoading ? (
            <BootLoadingPanel steps={sheetsSyncProgress?.steps} subtitle={isHydrating ? 'Membaca data tersimpan' : undefined} />
          ) : (
            <React.Suspense fallback={<TabLoading />}>
            <div key={shownTab} className={cn('tab-enter transition-opacity duration-150', isTabPending && 'opacity-60')}>
              <TabErrorBoundary label={activeNavLabel}>
                <>
                  {shownTab === 'summary' && <DashboardSummary data={kpiData} previousData={previousKpiData} previousData2={previousKpiData2} previousData3={previousKpiData3} weekRanges={weekRanges} weekData={weekKpiData} previousPeriods={previousPeriods} />}
                  {shownTab === 'leaderboard' && <Leaderboard data={kpiData} />}
                  {shownTab === 'incentive' && (
                    isProcessingKpis && incentiveKpiData.length === 0
                      ? <TabLoading />
                      : <IncentiveSimulation data={incentiveKpiData} period={incentivePeriod} />
                  )}
                  {shownTab === 'productivity' && <ProductivityDetail data={kpiData} previousData={previousKpiData} previousData2={previousKpiData2} previousData3={previousKpiData3} weekCompare={weekCompare} />}
                  {shownTab === 'csat_official' && <CsatOfficialMonitor data={kpiData} previousData={previousKpiData} previousData2={previousKpiData2} previousData3={previousKpiData3} weekCompare={weekCompare} />}
                  {shownTab === 'csat' && <CsatRoom data={kpiData} previousData={previousKpiData} previousData2={previousKpiData2} previousData3={previousKpiData3} weekCompare={weekCompare} />}
                  {shownTab === 'csat_rca' && <CsatRcaMonitor data={kpiData} />}
                  {(shownTab === 'sla' || shownTab === 'whu') && <SlaWhuMonitor data={kpiData} />}
                  {shownTab === 'qa' && <QaAgent360 data={kpiData} />}
                  {shownTab === 'schedule' && <ScheduleAttendance data={kpiData} />}
                  {shownTab === 'weekly_export' && <WeeklyExport weekCompare={weekCompare} weekRanges={weekRanges} weekData={weekKpiData} monthRanges={monthRanges} monthData={extraKpiData} />}
                  {shownTab === 'files' && isAdmin && <FileCenter />}
                </>
              </TabErrorBoundary>
            </div>
            </React.Suspense>
          )}
        </div>
      </main>

    </div>
  );
}

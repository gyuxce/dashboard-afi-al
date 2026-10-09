import React from 'react';
import Papa from 'papaparse';
import { useShallow } from 'zustand/react/shallow';
import { useStore, AppState } from '../../store';
import { CheckCircle2, FileText, DownloadCloud, Loader2, DatabaseBackup, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getSheetConfigForMonth, getSheetMonthOption, getSheetMonthOptions } from '../../lib/sheetsApi';
import { 
  countDataRows,
  validateCsidFile, 
  validateProductivityFile, 
  validateCsatScFile, 
  validateSlaFile, 
  validateScheduleFile, 
  validateQaFile,
  ValidationResult
} from '../../lib/csvValidator';
import { formatRelativeTime, isStaleSync } from '../../lib/dataQuality';

const validators: Record<string, (data: any[][]) => ValidationResult> = {
  csidFile: validateCsidFile,
  productivityFile: validateProductivityFile,
  csatScFile: validateCsatScFile,
  slaFile: validateSlaFile,
  scheduleFile: validateScheduleFile,
  qaFile: validateQaFile,
};

const dataSources = [
  { label: 'Master CSID', fileKey: 'csidFile', dataKey: 'csidData' },
  { label: 'Productivity, CSAT, WHU', fileKey: 'productivityFile', dataKey: 'productivityData' },
  { label: 'CSAT SC Raw Data', fileKey: 'csatScFile', dataKey: 'csatScData' },
  { label: 'SLA Responses', fileKey: 'slaFile', dataKey: 'slaData' },
  { label: 'Agent Scheduling', fileKey: 'scheduleFile', dataKey: 'scheduleData' },
  { label: 'QA Score', fileKey: 'qaFile', dataKey: 'qaData' },
] as const;

type HealthStatus = 'ok' | 'warning' | 'error' | 'missing';

const getHealthStyles = (status: HealthStatus) => {
  switch (status) {
    case 'ok':
      return {
        icon: <CheckCircle2 className="w-4 h-4 text-success" />,
        label: 'OK',
        className: 'border-success/20 bg-success/5 text-success',
      };
    case 'warning':
      return {
        icon: <AlertTriangle className="w-4 h-4 text-warning" />,
        label: 'Warning',
        className: 'border-warning/20 bg-warning/5 text-warning',
      };
    case 'error':
      return {
        icon: <AlertCircle className="w-4 h-4 text-danger" />,
        label: 'Error',
        className: 'border-danger/20 bg-danger/5 text-danger',
      };
    default:
      return {
        icon: <FileText className="w-4 h-4 text-text-muted" />,
        label: 'Missing',
        className: 'border-border bg-surface/40 text-text-muted',
      };
  }
};

const DataHealthPanel = ({ isSheetMode }: { isSheetMode: boolean }) => {
  const store = useStore(useShallow((s) => ({
    csidData: s.csidData,
    productivityData: s.productivityData,
    csatScData: s.csatScData,
    slaData: s.slaData,
    scheduleData: s.scheduleData,
    qaData: s.qaData,
    activeMonthRowCounts: s.activeMonthRowCounts,
    fileValidations: s.fileValidations,
  }))) as any;

  const healthItems = React.useMemo(() => {
    return dataSources.map((source) => {
      const data = (store[source.dataKey] || []) as any[][];
      const rows = store.activeMonthRowCounts?.[source.dataKey] ?? countDataRows(data);
      const hasData = data.length > 0 && rows > 0;
      const persistedValidation = store.fileValidations?.[source.fileKey] as ValidationResult | null | undefined;
      const validation = hasData
        ? (isSheetMode ? validators[source.fileKey](data) : persistedValidation || validators[source.fileKey](data))
        : null;
      const status: HealthStatus = !hasData
        ? 'missing'
        : validation?.severity === 'error'
          ? 'error'
          : validation?.severity === 'warning'
            ? 'warning'
            : 'ok';

      return {
        ...source,
        rows,
        status,
        message: validation?.message || '',
        errorType: validation?.errorType || '',
        fileName: store.fileNames?.[source.fileKey] || '',
      };
    });
  }, [
    isSheetMode,
    store.csidData,
    store.productivityData,
    store.csatScData,
    store.slaData,
    store.scheduleData,
    store.qaData,
    store.fileValidations,
    store.fileNames,
  ]);

  const summary = healthItems.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      acc.rows += item.rows;
      return acc;
    },
    { ok: 0, warning: 0, error: 0, missing: 0, rows: 0 } as Record<HealthStatus, number> & { rows: number },
  );

  const agentCount = React.useMemo(() => Object.keys(store.agentDictionary || {}).length, [store.agentDictionary]);

  return (
    <div className="bg-card border border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-text-primary">Data Health</h2>
          <p className="text-[11px] text-text-muted mt-1">
            Status input data bulan aktif sebelum KPI diproses.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 text-[11px] font-bold">
          <span className="px-2 py-1 rounded-lg bg-success/5 text-success border border-success/20">OK {summary.ok}</span>
          <span className="px-2 py-1 rounded-lg bg-warning/5 text-warning border border-warning/20">Warning {summary.warning}</span>
          <span className="px-2 py-1 rounded-lg bg-danger/5 text-danger border border-danger/20">Error {summary.error}</span>
          <span className="px-2 py-1 rounded-lg bg-surface text-text-muted border border-border">Missing {summary.missing}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border-b border-border bg-surface/30">
        <div>
          <div className="text-[11px] tracking-wide text-text-muted font-medium">Total baris</div>
          <div className="text-lg font-semibold text-text-primary mt-0.5">{summary.rows}</div>
          <div className="text-[10px] text-text-muted mt-0.5">Bulan aktif saja</div>
        </div>
        <div>
          <div className="text-[11px] tracking-wide text-text-muted font-medium">Agent dikenal</div>
          <div className="text-lg font-semibold text-text-primary mt-0.5">{agentCount}</div>
        </div>
        <div>
          <div className="text-[11px] tracking-wide text-text-muted font-medium">Mode</div>
          <div className="text-lg font-semibold text-text-primary mt-0.5">{isSheetMode ? 'Google Sheets' : 'CSV Upload'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
        {healthItems.map((item) => {
          const style = getHealthStyles(item.status);
          return (
            <div key={item.fileKey} className="border border-border rounded-lg p-3 bg-surface/20">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-text-primary truncate">{item.label}</div>
                  <div className="text-[10px] text-text-muted mt-1">
                    {item.rows > 0 ? `${item.rows} rows detected bulan aktif` : 'No data detected'}
                  </div>
                  {item.fileName && (
                    <div className="text-[10px] text-text-muted mt-1 truncate" title={item.fileName}>
                      {item.fileName}
                    </div>
                  )}
                </div>
                <div className={cn('shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold', style.className)}>
                  {style.icon}
                  {style.label}
                </div>
              </div>
              {item.message && (
                <div className="mt-3 text-[10px] leading-relaxed text-text-secondary bg-card border border-border rounded-lg p-2">
                  {item.errorType && <span className="font-bold">{item.errorType}: </span>}
                  {item.message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const UploadCard = ({ title, fileKey }: { title: string, fileKey: keyof AppState }) => {
  const store = useStore(useShallow((s) => ({
    [fileKey]: (s as any)[fileKey],
    setFile: s.setFile,
    persistedKeys: s.persistedKeys,
    fileValidations: s.fileValidations,
    isPersisting: s.isPersisting,
    fileNames: s.fileNames,
  }))) as any;
  const file = store[fileKey] as File | null;
  const setFile = store.setFile;
  const persistedKeys = store.persistedKeys || [];
  const fileValidations = store.fileValidations || {};
  const validation = fileValidations[fileKey];
  
  const isPersisted = persistedKeys.includes(fileKey as string);
  const isPersisting = store.isPersisting;
  const fileName = store.fileNames?.[fileKey] || (file ? file.name : null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    Papa.parse(selectedFile, {
      complete: (results) => {
        const validator = validators[fileKey];
        const valResult = validator ? validator(results.data as any[][]) : { isValid: true, severity: 'ok' };
        if (valResult && valResult.severity !== 'ok') {
           console.warn(`Validation warning for ${fileKey}:`, valResult);
        }
        setFile(fileKey, selectedFile, results.data as string[][], valResult);
      },
      error: (error) => {
        console.error('Error parsing CSV: ' + error.message);
        setFile(fileKey, selectedFile, [], { 
          isValid: false, 
          errorType: 'PARSE_ERROR', 
          message: 'Error membaca file: ' + error.message,
          severity: 'error'
        });
      }
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] relative overflow-hidden group">
      {/* Saved Indicator */}
      {isPersisted && (
        <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-bold text-success  px-1.5 py-0.5 rounded tracking-wide backdrop-blur-sm mt-0.5">
           <DatabaseBackup className="w-3 h-3" />
           Saved
        </div>
      )}
      
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors",
        file ? "text-success" : "bg-primary-soft text-primary group-hover:bg-primary-soft-hover"
      )}>
        {file ? <CheckCircle2 className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
      </div>
      <h3 className="text-13px font-bold text-text-primary mb-1">{title}</h3>
      <p className="text-[11px] text-text-muted mb-4 h-8 flex flex-col items-center justify-center" title={fileName || ''}>
        {fileName ? (
          <span className="line-clamp-2">{fileName}</span>
        ) : (
          'Pilih file CSV yang sesuai.'
        )}
      </p>
      
      {/* Validation Badge */}
      {validation && validation.severity !== 'ok' && (
        <div className={cn(
          "mb-3 px-2 py-1 rounded text-left flex items-start gap-1.5 w-full",
          validation.severity === 'warning' ? "text-warning" : "text-danger"
        )}>
          <div className="mt-0.5 shrink-0">
            {validation.severity === 'warning' ? <AlertTriangle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          </div>
          <div className="text-[10px] leading-tight">
            <strong>{validation.errorType}:</strong> {validation.message}
          </div>
        </div>
      )}
      
      <label className={cn(
        "relative cursor-pointer border text-text-primary px-3 py-1.5 rounded-lg w-full font-bold text-[11px] transition-colors flex justify-center",
        file ? "bg-surface border-border hover:bg-border/50" : "bg-card border-border hover:bg-surface hover:text-primary"
      )}>
        <input type="file" accept=".csv" className="sr-only" onChange={handleUpload} />
        <span className="flex items-center gap-2">
          {isPersisting && file ? (
             <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
             <DownloadCloud className="w-3.5 h-3.5" />
          )}
          {file ? 'Replace File' : 'Browse File'}
        </span>
      </label>
    </div>
  );
};

export const FileCenter = () => {
  const {
    clearFiles,
    fetchFromSheets,
    isFetchingSheets,
    sheetsFetchError,
    lastSyncTime,
    selectedSheetMonth,
    setSelectedSheetMonth,
  } = useStore(useShallow((s) => ({
    clearFiles: s.clearFiles,
    fetchFromSheets: s.fetchFromSheets,
    isFetchingSheets: s.isFetchingSheets,
    sheetsFetchError: s.sheetsFetchError,
    lastSyncTime: s.lastSyncTime,
    selectedSheetMonth: s.selectedSheetMonth,
    setSelectedSheetMonth: s.setSelectedSheetMonth,
  })));

  const [isConfirming, setIsConfirming] = React.useState(false);

  const handleClear = () => {
    if (isConfirming) {
       clearFiles();
       setIsConfirming(false);
    } else {
       setIsConfirming(true);
       setTimeout(() => setIsConfirming(false), 3000);
    }
  };

  const isSheetMode = !!import.meta.env.VITE_SHEETS_API_KEY;
  const activeMonth = getSheetMonthOption(selectedSheetMonth);
  const activeSheetConfig = getSheetConfigForMonth(selectedSheetMonth);
  const sheetMonthOptions = getSheetMonthOptions();
  const failedSheetName = sheetsFetchError?.match(/"([^"]+)"/)?.[1] || null;
  const hasSuccessfulSync = !!lastSyncTime && !sheetsFetchError;
  const syncStatusText = isFetchingSheets
    ? 'Menyinkronkan data...'
    : hasSuccessfulSync
      ? ''
      : `Sheet belum aktif: ${activeMonth.label}`;
  const syncIsStale = isStaleSync(lastSyncTime);

  const sheetNames = [
    { label: 'Master CSID', tabName: activeSheetConfig.csidSheetName },
    { label: 'Productivity, CSAT, WHU', tabName: activeSheetConfig.productivitySheetName },
    { label: 'CSAT SC Raw Data', tabName: activeSheetConfig.csatScSheetName },
    { label: 'SLA Responses', tabName: activeSheetConfig.slaSheetName },
    { label: 'Agent Scheduling', tabName: activeSheetConfig.scheduleSheetName },
    { label: 'QA Score', tabName: activeSheetConfig.qaSheetName },
  ];

  if (isSheetMode) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              Data Integration Center
            </h2>
            <p className="text-text-muted text-sm mt-1">
              Data otomatis diambil dari Google Sheets
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
              <span className="whitespace-nowrap">Data Bulan</span>
              <select
                value={selectedSheetMonth}
                onChange={(event) => setSelectedSheetMonth(event.target.value)}
                disabled={isFetchingSheets}
                className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-text-primary outline-none transition-colors hover:border-primary/40 focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sheetMonthOptions.map(option => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button 
              onClick={handleClear}
              className="px-3 py-1.5 border-danger/20 border text-danger text-xs hover:bg-danger-soft transition-colors rounded-lg font-bold"
            >
               {isConfirming ? 'Click Again to Confirm Reset' : 'Reset Data'}
            </button>
            <button 
              onClick={fetchFromSheets} 
              disabled={isFetchingSheets}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors
                ${isFetchingSheets ? 'bg-primary/70 cursor-not-allowed' : 'bg-primary hover:bg-primary/90'}`}
            >
              <RefreshCw className={`w-4 h-4 ${isFetchingSheets ? 'animate-spin' : ''}`} />
              {isFetchingSheets ? 'Menyinkronkan...' : 'Sync sekarang'}
            </button>
          </div>
        </div>
        
        {/* Error state */}
        {sheetsFetchError && (
          <div className="bg-danger-soft border border-danger/50 rounded-xl p-4 text-danger text-sm flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p>{sheetsFetchError}</p>
              <p className="text-xs mt-1 text-danger/80">
                Data yang sedang tampil tidak dihapus. Setelah tab dibuat, klik Sync sekarang lagi.
              </p>
            </div>
          </div>
        )}

        <div className={cn(
          "rounded-xl p-4 text-sm border",
          hasSuccessfulSync
            ? syncIsStale
              ? "bg-warning/10 border-warning/30"
              : "bg-success/10 border-success/30"
            : "bg-warning/10 border-warning/30"
        )}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <p className={cn(
                "font-medium",
                isFetchingSheets ? "text-primary" : syncIsStale ? "text-warning" : "text-text-primary"
              )}>
                {syncStatusText || (syncIsStale ? 'Data perlu di-refresh' : 'Data tersinkron')}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {isFetchingSheets
                  ? 'Mohon tunggu, dashboard sedang membaca tab Google Sheets.'
                  : hasSuccessfulSync
                    ? syncIsStale
                      ? `Data terakhir sync ${formatRelativeTime(lastSyncTime)}, klik Sync sekarang untuk update.`
                      : `Sinkron ${formatRelativeTime(lastSyncTime)}. ${activeMonth.description}`
                    : 'Dashboard akan otomatis sync saat dibuka. Klik Sync sekarang jika ingin memaksa update manual.'}
              </p>
            </div>
            <span className={cn(
              "text-[11px] font-medium tracking-wide px-2 py-1 rounded-lg border",
              hasSuccessfulSync
                ? syncIsStale
                  ? "text-warning border-warning/30 bg-warning/10"
                  : "text-success border-success/30 bg-success/10"
                : "text-warning border-warning/30 bg-warning/10"
            )}>
              {isFetchingSheets ? 'Menyinkronkan' : hasSuccessfulSync ? syncIsStale ? 'Perlu refresh' : 'Synced' : 'Belum sync'}
            </span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-text-primary">Monthly Sheet Setup</h3>
                <p className="text-xs text-text-muted mt-1">
                  {activeMonth.suffix
                    ? 'Buat tab berikut sebelum sync bulan baru. Sync memuat bulan aktif + 3 bulan sebelumnya (cukup untuk Bandingkan MoM & Insentif).'
                    : 'Mei 2026 masih memakai nama tab dari env Vercel, jadi tidak perlu rename tab.'}
                </p>
              </div>
              <span className={cn(
                "text-[10px] font-medium tracking-wide px-2 py-1 rounded-lg border",
                hasSuccessfulSync
                  ? "text-success border-success/30 bg-success/10"
                  : activeMonth.suffix
                    ? "text-warning border-warning/30 bg-warning/10"
                    : "text-success border-success/30 bg-success/10"
              )}>
                {hasSuccessfulSync ? 'Synced' : activeMonth.suffix ? 'Setup needed' : 'Ready'}
              </span>
            </div>

            {activeMonth.suffix ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {sheetNames.map(sheet => (
                    <div
                      key={sheet.tabName}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs",
                        failedSheetName === sheet.tabName
                          ? "border-danger/40 bg-danger-soft text-danger"
                          : "border-border bg-surface/40 text-text-secondary"
                      )}
                    >
                      <span className="font-medium truncate">{sheet.label}</span>
                      <span className="font-bold text-text-primary truncate max-w-[180px]" title={sheet.tabName}>
                        {sheet.tabName}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-text-muted">
                  <div className="rounded-lg bg-surface/50 border border-border px-3 py-2">1. Copy tab bulan sebelumnya.</div>
                  <div className="rounded-lg bg-surface/50 border border-border px-3 py-2">2. Rename sesuai nama tab di atas.</div>
                  <div className="rounded-lg bg-surface/50 border border-border px-3 py-2">3. Kosongkan data lama, header jangan diubah.</div>
                </div>
              </>
            ) : (
              <div className="rounded-lg bg-surface/50 border border-border px-3 py-2 text-xs text-text-muted">
                Dashboard akan membaca tab env default yang sudah tersimpan di Vercel.
              </div>
            )}
          </div>
        </div>
        
        {/* Loading state */}
        {isFetchingSheets && (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted bg-card/50 rounded-xl border border-border mt-4">
            <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary"/>
            <p className="font-medium text-text-primary">Menyinkronkan data dari Google Sheets...</p>
            <p className="text-xs mt-1">Mohon tunggu sebentar</p>
          </div>
        )}

        <DataHealthPanel isSheetMode={isSheetMode} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Data Integration Center</h1>
          <p className="text-xs text-text-muted mt-1">Upload CSV files across modules to power the 360-degree dashboard.</p>
        </div>
        <button 
          onClick={handleClear}
          className="text-danger font-bold text-[11px] px-3 py-1.5 bg-danger-soft hover:bg-danger-soft/80 border border-danger/20 rounded-lg transition-colors flex items-center gap-1.5 relative z-20 cursor-pointer pointer-events-auto"
        >
          {isConfirming ? 'Click Again to Confirm' : 'Reset All Data'}
        </button>
      </div>

      <DataHealthPanel isSheetMode={isSheetMode} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <UploadCard title="Master CSID" fileKey="csidFile" />
        <UploadCard title="Productivity, CSAT, WHU" fileKey="productivityFile" />
        <UploadCard title="CSAT SC Raw Data" fileKey="csatScFile" />
        <UploadCard title="SLA Responses" fileKey="slaFile" />
        <UploadCard title="Agent Scheduling" fileKey="scheduleFile" />
        <UploadCard title="QA Score" fileKey="qaFile" />
      </div>
    </div>
  );
};

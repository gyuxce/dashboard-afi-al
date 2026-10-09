import { startTransition, useEffect, useRef, useState } from 'react';
import { processKPIs, type AgentKPI } from '../lib/dataProcessor';
import type { KpiWorkerRequest, KpiWorkerResponse } from '../workers/kpiProtocol';

export type ProcessedKpiBundle = {
  rawData: AgentKPI[];
  previousRawData: AgentKPI[];
  previousRawData2: AgentKPI[];
  previousRawData3: AgentKPI[];
  pilotRawData: AgentKPI[];
};

const EMPTY_BUNDLE: ProcessedKpiBundle = {
  rawData: [],
  previousRawData: [],
  previousRawData2: [],
  previousRawData3: [],
  pilotRawData: [],
};

type PeriodRange = { start: string; end: string } | null;

type Args = {
  productivityData: any[][];
  csatScData: any[][];
  slaData: any[][];
  scheduleData: any[][];
  qaData: any[][];
  startDate: string;
  endDate: string;
  agentDictionary: Record<string, { name: string; bpo: string; teamLeader: string }>;
  agentDictionaryByMonth: Record<string, Record<string, { name: string; bpo: string; teamLeader: string }>>;
  needsComparisonData: boolean;
  prev1: PeriodRange;
  prev2: PeriodRange;
  prev3: PeriodRange;
  /** Optional extra period the Pilot CSAT tab needs (batch window + baseline),
   *  processed alongside the rest instead of a separate main-thread pass. */
  pilotPeriod: PeriodRange;
  /** Skip heavy work while bootstrapping empty state */
  enabled?: boolean;
};

const yieldToPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// One worker for the whole app. The raw dataset is shipped into it once per
// sync/upload; filter/month changes only send a tiny {periods} message, so the
// multi-MB structuredClone doesn't run on every keystroke.
let sharedWorker: Worker | null = null;
let workerUnavailable = false;

function getKpiWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (sharedWorker) return sharedWorker;
  try {
    sharedWorker = new Worker(new URL('../workers/kpi.worker.ts', import.meta.url), {
      type: 'module',
    });
    sharedWorker.onerror = () => {
      workerUnavailable = true;
      sharedWorker?.terminate();
      sharedWorker = null;
    };
    return sharedWorker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

/**
 * Runs processKPIs in a Web Worker (falls back to a yielding main-thread pass
 * if workers are unavailable or crash) so loading/filtering never freezes the UI.
 */
export function useProcessedKpis(args: Args): {
  bundle: ProcessedKpiBundle;
  isProcessing: boolean;
} {
  const {
    productivityData,
    csatScData,
    slaData,
    scheduleData,
    qaData,
    startDate,
    endDate,
    agentDictionary,
    agentDictionaryByMonth,
    needsComparisonData,
    prev1,
    prev2,
    prev3,
    pilotPeriod,
    enabled = true,
  } = args;

  const [bundle, setBundle] = useState<ProcessedKpiBundle>(EMPTY_BUNDLE);
  const [isProcessing, setIsProcessing] = useState(false);
  const genRef = useRef(0);
  const dataVersionRef = useRef(0);
  const sentDataRef = useRef<unknown[] | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBundle(EMPTY_BUNDLE);
      setIsProcessing(false);
      return;
    }

    const gen = ++genRef.current;
    let cancelled = false;

    // Stale-while-revalidate: keep showing the previous bundle (if any) while
    // this generation runs instead of wiping it to empty. A tab switch that
    // merely adds/removes the "pilot" period (or any other filter/date tweak)
    // must not blank out data the user is already looking at — that's what
    // caused the whole app to flash back to the full boot screen on every
    // nav click. Only `enabled: false` below clears the bundle outright.

    const hasAnySource =
      productivityData.length > 0 ||
      csatScData.length > 0 ||
      slaData.length > 0 ||
      scheduleData.length > 0 ||
      qaData.length > 0;

    if (!hasAnySource) {
      // Genuinely nothing to show (e.g. after Reset Data) — clear for real.
      setBundle(EMPTY_BUNDLE);
      setIsProcessing(false);
      return;
    }
    setIsProcessing(true);

    const periods = {
      current: { start: startDate || '', end: endDate || '' },
      prev1: needsComparisonData ? prev1 : null,
      prev2: needsComparisonData ? prev2 : null,
      prev3: needsComparisonData ? prev3 : null,
      pilot: pilotPeriod && pilotPeriod.start ? pilotPeriod : null,
    };

    const finish = (next: ProcessedKpiBundle) => {
      if (cancelled || gen !== genRef.current) return;
      startTransition(() => {
        if (cancelled || gen !== genRef.current) return;
        setBundle(next);
        setIsProcessing(false);
      });
    };

    const computeOnMainThread = async () => {
      await yieldToPaint();
      if (cancelled || gen !== genRef.current) return;

      const rawData = processKPIs(
        productivityData,
        csatScData,
        slaData,
        scheduleData,
        qaData,
        startDate,
        endDate,
        agentDictionary,
        agentDictionaryByMonth,
      );

      const runPrev = async (p: PeriodRange): Promise<AgentKPI[] | null> => {
        if (!p) return [];
        await yieldToPaint();
        if (cancelled || gen !== genRef.current) return null;
        return processKPIs(
          productivityData,
          csatScData,
          slaData,
          scheduleData,
          qaData,
          p.start,
          p.end,
          agentDictionary,
          agentDictionaryByMonth,
        );
      };

      const previousRawData = await runPrev(periods.prev1);
      if (previousRawData === null) return;
      const previousRawData2 = await runPrev(periods.prev2);
      if (previousRawData2 === null) return;
      const previousRawData3 = await runPrev(periods.prev3);
      if (previousRawData3 === null) return;
      const pilotRawData = await runPrev(periods.pilot);
      if (pilotRawData === null) return;

      finish({ rawData, previousRawData, previousRawData2, previousRawData3, pilotRawData });
    };

    const worker = getKpiWorker();
    if (!worker) {
      void computeOnMainThread();
      return () => {
        cancelled = true;
      };
    }

    // Ship the raw dataset only when its identity actually changed.
    const identity: unknown[] = [
      productivityData,
      csatScData,
      slaData,
      scheduleData,
      qaData,
      agentDictionary,
      agentDictionaryByMonth,
    ];
    const prevIdentity = sentDataRef.current;
    const identityChanged =
      !prevIdentity || identity.some((value, i) => value !== prevIdentity[i]);
    if (identityChanged) {
      dataVersionRef.current += 1;
      sentDataRef.current = identity;
      worker.postMessage({
        type: 'setData',
        dataVersion: dataVersionRef.current,
        payload: {
          productivityData,
          csatScData,
          slaData,
          scheduleData,
          qaData,
          agentDictionary,
          agentDictionaryByMonth,
        },
      } as KpiWorkerRequest);
    }

    let settled = false;
    const onMessage = (ev: MessageEvent<KpiWorkerResponse>) => {
      const msg = ev.data;
      if (msg.type !== 'result' || msg.reqId !== gen) return;
      settled = true;
      cleanup();
      finish(msg.bundle);
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      void computeOnMainThread();
    };
    const timeoutId = setTimeout(onError, 20000);
    function cleanup() {
      clearTimeout(timeoutId);
      worker!.removeEventListener('message', onMessage);
      worker!.removeEventListener('error', onError);
    }

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({
      type: 'process',
      reqId: gen,
      dataVersion: dataVersionRef.current,
      periods,
    } as KpiWorkerRequest);

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [
    enabled,
    productivityData,
    csatScData,
    slaData,
    scheduleData,
    qaData,
    startDate,
    endDate,
    agentDictionary,
    agentDictionaryByMonth,
    needsComparisonData,
    prev1,
    prev2,
    prev3,
    pilotPeriod,
  ]);

  return { bundle, isProcessing };
}

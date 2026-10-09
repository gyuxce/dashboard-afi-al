import { processKPIs } from '../lib/dataProcessor';
import type {
  KpiRawData,
  KpiWorkerRequest,
  KpiWorkerResponse,
  PeriodRange,
} from './kpiProtocol';

// Typed just enough for a dedicated worker without pulling the "WebWorker"
// lib (which clashes with "DOM" in this project's tsconfig).
type WorkerScope = {
  onmessage: ((ev: MessageEvent<KpiWorkerRequest>) => void) | null;
  postMessage: (msg: KpiWorkerResponse) => void;
};
const ctx = self as unknown as WorkerScope;

// Raw dataset lives here across many `process` calls, so filter / month
// changes only send a tiny {periods} message instead of re-cloning MBs.
let data: KpiRawData | null = null;
let dataVersion = 0;

const runPeriod = (
  d: KpiRawData,
  period: PeriodRange | { start: string; end: string },
) => {
  if (!period) return [];
  return processKPIs(
    d.productivityData as unknown[][],
    d.csatScData as unknown[][],
    d.slaData as unknown[][],
    d.scheduleData as unknown[][],
    d.qaData as unknown[][],
    period.start,
    period.end,
    d.agentDictionary,
    d.agentDictionaryByMonth,
  );
};

ctx.onmessage = (ev) => {
  const msg = ev.data;

  if (msg.type === 'setData') {
    data = msg.payload;
    dataVersion = msg.dataVersion;
    return;
  }

  if (msg.type === 'process') {
    const d = data;
    // No data yet (or the client's data moved on) — stay silent; the client
    // always resends `setData` right before `process` when identity changes.
    if (!d) return;

    ctx.postMessage({
      type: 'result',
      reqId: msg.reqId,
      dataVersion,
      bundle: {
        rawData: runPeriod(d, msg.periods.current),
        previousRawData: runPeriod(d, msg.periods.prev1),
        previousRawData2: runPeriod(d, msg.periods.prev2),
        previousRawData3: runPeriod(d, msg.periods.prev3),
        pilotRawData: runPeriod(d, msg.periods.pilot),
      },
    });
  }
};

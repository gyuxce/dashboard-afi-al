import {
  cell,
  pickColumn,
  resolveSlaColumns,
  resolveRowCsId,
} from '../sheetHeaders';
import {
  normalizeDateStr,
  ticketOccurrenceKey,
  transactionKey,
} from '../dataProcessor';
import type { ProcessorContext } from './context';

/**
 * Step 3: SLA — SLA 1m / 3m averages and daily history.
 * Extracted verbatim from processKPIs.
 */
export function processSla(
  ctx: ProcessorContext,
  slaData: any[][],
): void {
  const { getAgent, isWithin } = ctx;

  if (slaData.length <= 1) return;

  const slaColumns = resolveSlaColumns(slaData);

  for (let i = 1; i < slaData.length; i++) {
    const row = slaData[i];
    if (!row || row.length < 2) continue;

    const resolvedId = resolveRowCsId(row, slaColumns.csId);
    if (!resolvedId.id) continue;
    const idIdx = resolvedId.index;

    const agentId = resolvedId.id;
    const dateIdx = pickColumn(slaColumns.date, idIdx > 0 ? 0 : -1);
    const dateStr = cell(row, dateIdx);
    let normDate = dateStr ? normalizeDateStr(dateStr) : null;
    const hour = ctx.extractTimestampHour(dateStr);
    normDate = ctx.getShiftAdjustedDate(agentId, normDate, hour);
    if (!isWithin(normDate)) continue;

    const agent = getAgent(agentId);
    if (!agent) continue;
    const targetDateLabel = dateStr
      ? normDate
        ? ctx.getScheduleDateLabel(agentId, normDate)
        : dateStr
      : dateStr;

    const parseSla = (val: string) => {
      let clean = val.replace(",", ".").trim();
      if (!clean) return null;
      if (clean.includes("%")) return parseFloat(clean.replace("%", ""));
      const n = parseFloat(clean);
      return isNaN(n) ? null : n * 100;
    };

    const sla1ValueIdx = pickColumn(slaColumns.sla1m, idIdx >= 0 ? idIdx + 11 : -1);
    const sla3ValueIdx = pickColumn(slaColumns.sla3m, idIdx >= 0 ? idIdx + 13 : -1);
    const sla1Raw = cell(row, sla1ValueIdx);
    const sla3Raw = cell(row, sla3ValueIdx);
    const sla1 = parseSla(sla1Raw);
    const sla3 = parseSla(sla3Raw);
    const ticketId = cell(row, slaColumns.ticketId);

    const slaTicketKey = ticketOccurrenceKey(agentId, normDate, dateStr, ticketId);
    if (slaTicketKey && ctx.seenSlaTickets.has(slaTicketKey)) continue;
    if (slaTicketKey) ctx.seenSlaTickets.add(slaTicketKey);

    const slaEntryKey = transactionKey([
      ticketId,
      agentId,
      normDate || dateStr.trim(),
      sla1Raw,
      sla3Raw,
    ]);

    if (ctx.seenSlaEntries.has(slaEntryKey)) continue;
    ctx.seenSlaEntries.add(slaEntryKey);

    if (sla1 !== null && !isNaN(sla1)) {
      if (!ctx.sla1mSum[agent.csId]) ctx.sla1mSum[agent.csId] = { sum: 0, count: 0 };
      ctx.sla1mSum[agent.csId].sum += sla1;
      ctx.sla1mSum[agent.csId].count += 1;
      agent.dailyHistory.sla1m.push({ date: targetDateLabel, normDate, value: sla1 });
    }
    if (sla3 !== null && !isNaN(sla3)) {
      if (!ctx.sla3mSum[agent.csId]) ctx.sla3mSum[agent.csId] = { sum: 0, count: 0 };
      ctx.sla3mSum[agent.csId].sum += sla3;
      ctx.sla3mSum[agent.csId].count += 1;
      agent.dailyHistory.sla3m.push({ date: targetDateLabel, normDate, value: sla3 });
    }
  }
}

import {
  cell,
  pickColumn,
  resolveQaColumns,
  resolveRowCsId,
} from '../sheetHeaders';
import {
  normalizeDateStr,
  ticketOccurrenceKey,
  transactionKey,
} from '../dataProcessor';
import type { ProcessorContext } from './context';

/**
 * Step 4: QA — qaHistory, score sum/count (once per ticket).
 * Extracted verbatim from processKPIs.
 */
export function processQa(
  ctx: ProcessorContext,
  qaData: any[][],
): void {
  const { getAgent, isWithin } = ctx;

  if (qaData.length <= 1) return;

  const qaColumns = resolveQaColumns(qaData[0] || []);

  for (let i = 1; i < qaData.length; i++) {
    const row = qaData[i];
    if (!row || row.length < 2) continue;

    const resolvedId = resolveRowCsId(row, pickColumn(qaColumns.csId, 0));
    if (!resolvedId.id) continue;
    const agentId = resolvedId.id;

    const dateIdx = pickColumn(qaColumns.date, 13);
    const dateStr = cell(row, dateIdx);
    const normDate = dateStr ? normalizeDateStr(dateStr) : null;
    if (dateStr && normDate && !isWithin(normDate)) continue;
    const targetDateLabel = normDate || dateStr;

    const agent = getAgent(agentId);
    if (!agent) continue;

    const ticketId = cell(row, pickColumn(qaColumns.ticketId, 4));
    const uid = cell(row, pickColumn(qaColumns.uid, 5));
    const chatId = cell(row, pickColumn(qaColumns.chatId, 6));
    const caseDate = cell(row, pickColumn(qaColumns.caseDate, 8));
    const systemCheckingType = cell(row, pickColumn(qaColumns.systemCheckingType, 12));
    const qcName = cell(row, pickColumn(qaColumns.qcName, 14));
    const mistakeLevel = cell(row, pickColumn(qaColumns.mistakeLevel, 15));
    const category = cell(row, pickColumn(qaColumns.category, 30));
    const remarks = cell(row, pickColumn(qaColumns.remarks, 32));
    const crmKode = cell(row, pickColumn(qaColumns.crmKode, 28));

    const scoreStr = cell(row, pickColumn(qaColumns.score, 17)).replace(",", ".");
    let score = Number.NaN;
    if (scoreStr.includes("%")) {
      score = parseFloat(scoreStr.replace("%", ""));
    } else if (scoreStr !== "") {
      score = parseFloat(scoreStr);
    }

    const qaTicketKey = ticketOccurrenceKey(
      agentId,
      normDate,
      dateStr,
      ticketId,
      [chatId, uid],
    );

    const qaEntryKey = transactionKey([
      ticketId,
      agentId,
      normalizeDateStr(dateStr) || dateStr.trim(),
      uid,
      chatId,
      caseDate,
      systemCheckingType,
      qcName,
      mistakeLevel,
      category,
      remarks,
      crmKode,
      scoreStr,
    ]);

    if (ctx.seenQaEntries.has(qaEntryKey)) continue;
    ctx.seenQaEntries.add(qaEntryKey);

    const rowHasScore = !isNaN(score);
    const alreadyScored = Boolean(qaTicketKey && ctx.seenQaTicketScores.has(qaTicketKey));
    const countScore = rowHasScore && !alreadyScored;
    if (countScore) {
      if (qaTicketKey) ctx.seenQaTicketScores.add(qaTicketKey);
      agent.qaScoreSum += score;
      agent.qaScoreCount += 1;
    }

    agent.qaHistory.push({
      date: targetDateLabel,
      normDate,
      systemCheckingType,
      ticketId,
      uid,
      chatId,
      caseDate,
      qcName,
      mistakeLevel,
      category,
      remarks,
      score: rowHasScore ? score : 0,
      hasScore: countScore,
      crmKode,
    });
  }
}

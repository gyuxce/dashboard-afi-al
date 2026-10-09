import {
  cell,
  pickColumn,
  resolveCsatScColumns,
  resolveRowCsId,
} from '../sheetHeaders';
import {
  normalizeDateStr,
  isCsatTakeoutCategory,
  isValidCsatScScore,
  ticketOccurrenceKey,
  transactionKey,
} from '../dataProcessor';
import type { ProcessorContext } from './context';

/**
 * Step 2: CSAT SC — survey history, RCA aggregates, hourly productivity,
 * score distribution, full/fair CSAT SC %. Extracted verbatim from processKPIs.
 */
export function processCsatSc(
  ctx: ProcessorContext,
  csatData: any[][],
): void {
  const { getAgent, isWithin } = ctx;

  if (csatData.length <= 1) return;

  const headerRow = csatData[0] || [];
  const csatColumns = resolveCsatScColumns(headerRow);

  for (let i = 1; i < csatData.length; i++) {
    const row = csatData[i];
    if (!row || row.length < 2) continue;

    const resolvedId = resolveRowCsId(row, csatColumns.csId);
    if (!resolvedId.id) continue;
    const idIdx = resolvedId.index;

    const agentId = resolvedId.id;
    const dateIdx = pickColumn(csatColumns.date, idIdx > 0 ? 0 : -1);
    const dateStr = cell(row, dateIdx);
    let normDate = dateStr ? normalizeDateStr(dateStr) : null;
    const timestampIdx = pickColumn(csatColumns.timestamp, 22);
    const timestampStr = cell(row, timestampIdx);
    const hour = ctx.extractTimestampHour(timestampStr);
    normDate = ctx.getShiftAdjustedDate(agentId, normDate, hour);
    if (!isWithin(normDate)) continue;

    const agent = getAgent(agentId);
    if (!agent) continue;
    const targetDateLabel = dateStr
      ? normDate
        ? ctx.getScheduleDateLabel(agentId, normDate)
        : dateStr
      : dateStr;

    const scoreIdx = pickColumn(csatColumns.score, idIdx >= 0 ? idIdx + 11 : -1);
    const categoryIdx = pickColumn(csatColumns.category, idIdx >= 0 ? idIdx + 8 : -1);
    const responseIdx = pickColumn(csatColumns.response, idIdx >= 0 ? idIdx + 15 : -1);
    const ticketIdx = pickColumn(csatColumns.ticketId, idIdx >= 0 ? idIdx + 1 : -1);
    const chatIdx = pickColumn(csatColumns.chatId, idIdx > 0 ? idIdx - 1 : -1);
    const uidIdx = pickColumn(csatColumns.uid, idIdx >= 0 ? idIdx + 5 : -1);

    const scoreStr = cell(row, scoreIdx).replace(",", ".");
    const score = parseFloat(scoreStr);

    const category = cell(row, categoryIdx).toLowerCase();
    const response = cell(row, responseIdx);
    const ticketId = cell(row, ticketIdx);
    const chatId = cell(row, chatIdx);
    const uid = cell(row, uidIdx);

    if (timestampStr) {
      if (hour >= 0 && hour < 24) {
        const hr = hour;
        agent.hourlyProductivity[hr] += 1;
        const categoryLabel = category
          ? category.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
          : "Unknown Case";
        agent.hourlyCategoryCounts[hr][categoryLabel] = (agent.hourlyCategoryCounts[hr][categoryLabel] || 0) + 1;
      }
    }

    const rcaAgent = cell(row, csatColumns.rcaAgent);
    const rcaCustomer = cell(row, csatColumns.rcaCustomer);
    const rcaAkulaku = cell(row, csatColumns.rcaAkulaku);

    const csatTicketKey = ticketOccurrenceKey(
      agentId,
      normDate,
      dateStr,
      ticketId,
      [chatId, uid],
    );
    if (csatTicketKey && ctx.seenCsatTickets.has(csatTicketKey)) continue;
    if (csatTicketKey) ctx.seenCsatTickets.add(csatTicketKey);

    const csatScEntryKey = transactionKey([
      ticketId,
      agentId,
      normDate || dateStr.trim(),
      chatId,
      uid,
      scoreStr,
      category,
      response,
      rcaAgent,
      rcaCustomer,
      rcaAkulaku,
      timestampStr,
    ]);

    if (ctx.seenCsatScEntries.has(csatScEntryKey)) continue;
    ctx.seenCsatScEntries.add(csatScEntryKey);

    const isTakeoutRecord = isCsatTakeoutCategory(category);

    if (dateStr) {
      agent.csatHistory.push({
        date: targetDateLabel,
        normDate,
        ticketId,
        chatId,
        uid,
        score: isNaN(score) ? 0 : score,
        category: category.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        response,
        isTakeout: isTakeoutRecord,
        rcaAgent,
        rcaCustomer,
        rcaAkulaku,
        agentName: agent.name,
        csId: agent.csId,
      });
    }

    if (rcaAgent) {
      if (!agent.rcaAgentAreaCounts[rcaAgent]) agent.rcaAgentAreaCounts[rcaAgent] = 0;
      agent.rcaAgentAreaCounts[rcaAgent] += 1;
      agent.rcaTotalCases += 1;
    }
    if (rcaCustomer) {
      if (!agent.rcaCustomerAreaCounts[rcaCustomer]) agent.rcaCustomerAreaCounts[rcaCustomer] = 0;
      agent.rcaCustomerAreaCounts[rcaCustomer] += 1;
      if (!rcaAgent) agent.rcaTotalCases += 1;
    }
    if (rcaAkulaku) {
      if (!agent.rcaAkulakuProcessCounts[rcaAkulaku]) agent.rcaAkulakuProcessCounts[rcaAkulaku] = 0;
      agent.rcaAkulakuProcessCounts[rcaAkulaku] += 1;
      if (!rcaAgent && !rcaCustomer) agent.rcaTotalCases += 1;
    }

    const cleanCatForDist = category
      ? category
          .split(" ")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : "Unknown Case";
    let scoreKey = "No Survey";
    if (!isNaN(score) && score >= 1 && score <= 5) {
      scoreKey = String(score);
    }
    if (!agent.csatScScoreDistribution[scoreKey]) {
      agent.csatScScoreDistribution[scoreKey] = {};
    }
    if (!agent.csatScScoreDistribution[scoreKey][cleanCatForDist]) {
      agent.csatScScoreDistribution[scoreKey][cleanCatForDist] = 0;
    }
    agent.csatScScoreDistribution[scoreKey][cleanCatForDist] += 1;

    if (isValidCsatScScore(score)) {
      agent.csatScFullCount += 1;

      if (score >= 4) {
        agent.csatScGoodCount += 1;
      } else {
        agent.csatScBadCount += 1;
      }
      agent.csatScTotalValid += 1;

      let fullDay = agent.dailyHistory.csatScFull.find(
        (h) => (normDate && h.normDate === normDate) || h.date === targetDateLabel,
      );
      if (!fullDay) {
        fullDay = { date: targetDateLabel, normDate, score: 0, count: 0 };
        agent.dailyHistory.csatScFull.push(fullDay);
      } else if (!fullDay.normDate && normDate) {
        fullDay.normDate = normDate;
      }
      if (score >= 4) fullDay.score += 1;
      fullDay.count += 1;

      const isTakeout = isCsatTakeoutCategory(category);

      if (!isTakeout) {
        agent.csatScFairCount += 1;

        if (score >= 4) {
          agent.csatScFairGoodCount += 1;
        } else {
          agent.csatScFairBadCount += 1;
        }
        agent.csatScFairTotalValid += 1;

        let fairDay = agent.dailyHistory.csatScFair.find(
          (h) => (normDate && h.normDate === normDate) || h.date === targetDateLabel,
        );
        if (!fairDay) {
          fairDay = { date: targetDateLabel, normDate, score: 0, count: 0 };
          agent.dailyHistory.csatScFair.push(fairDay);
        } else if (!fairDay.normDate && normDate) {
          fairDay.normDate = normDate;
        }
        if (score >= 4) fairDay.score += 1;
        fairDay.count += 1;
      }

      if (score === 1 || score === 2) {
        agent.csatScBadScoreFullCount += 1;
        if (!isTakeout) agent.csatScBadScoreFairCount += 1;

        if (category) {
          const cleanCat = category
            .split(" ")
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
          if (!agent.csatScCategoriesFull[cleanCat])
            agent.csatScCategoriesFull[cleanCat] = 0;
          agent.csatScCategoriesFull[cleanCat] += 1;

          if (!isTakeout) {
            if (!agent.csatScCategoriesFair[cleanCat])
              agent.csatScCategoriesFair[cleanCat] = 0;
            agent.csatScCategoriesFair[cleanCat] += 1;
          }
        }
      }
    }
  }
}

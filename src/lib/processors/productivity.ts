import {
  cell,
  pickColumn,
  resolveProductivityColumns,
  resolveRowCsId,
} from '../sheetHeaders';
import {
  normalizeDateStr,
  readStarCount,
  productivityDataStartRow,
} from '../dataProcessor';
import type { ProcessorContext } from './context';

/**
 * Step 1: Productivity sheet — productivity base/total, official CSAT
 * star counts, CSAT Asli daily, WHU daily. Extracted verbatim from processKPIs.
 */
export function processProductivity(
  ctx: ProcessorContext,
  prodData: any[][],
): void {
  const { getAgent, isWithin } = ctx;
  const prodColumns = resolveProductivityColumns(prodData);
  const prodStartRow = productivityDataStartRow(prodData);

  if (prodData.length <= prodStartRow) return;

  for (let i = prodStartRow; i < prodData.length; i++) {
    const row = prodData[i];
    if (!row || row.length < 2) continue;

    const resolvedId = resolveRowCsId(row, prodColumns.csId);
    if (!resolvedId.id) continue;
    const idIdx = resolvedId.index;

    const dateIdx = pickColumn(prodColumns.date, idIdx > 0 ? 0 : -1);
    const rawDateStr = cell(row, dateIdx);
    let normDate = rawDateStr ? normalizeDateStr(rawDateStr) : null;
    if (!rawDateStr || !normDate) continue;

    let targetDateLabel = rawDateStr;
    const hour = ctx.extractTimestampHour(rawDateStr);

    const agentId = resolvedId.id;
    const agent = getAgent(agentId);
    if (!agent) continue;

    normDate = ctx.getShiftAdjustedDate(agentId, normDate, hour);
    targetDateLabel = ctx.getScheduleDateLabel(agentId, normDate);

    if (!isWithin(normDate)) continue;

    const prodIdx = pickColumn(prodColumns.productivity, idIdx >= 0 ? idIdx + 8 : -1);
    const csatIdx = pickColumn(prodColumns.csatAsli, idIdx >= 0 ? idIdx + 1 : -1);
    const whuIdx = pickColumn(prodColumns.whu, idIdx >= 0 ? idIdx + 15 : -1);

    const prodBase = parseFloat(cell(row, prodIdx).replace(",", ".")) || 0;
    let csatAsliStr = cell(row, csatIdx);
    let whuStr = cell(row, whuIdx);

    if (csatAsliStr.includes("%")) csatAsliStr = csatAsliStr.replace("%", "");
    csatAsliStr = csatAsliStr.replace(",", ".");

    whuStr = whuStr.replace(",", ".");
    const whuNum = parseFloat(whuStr);

    const dVal = readStarCount(row, pickColumn(prodColumns.star5, 3));
    const eVal = readStarCount(row, pickColumn(prodColumns.star4, 4));
    const fVal = readStarCount(row, pickColumn(prodColumns.star3, 5));
    const gVal = readStarCount(row, pickColumn(prodColumns.star2, 6));
    const hVal = readStarCount(row, pickColumn(prodColumns.star1, 7));

    const sourceKey = [
      agentId,
      normDate,
      prodBase,
      csatAsliStr,
      whuStr,
      dVal,
      eVal,
      fVal,
      gVal,
      hVal,
    ].join("|");
    if (ctx.seenProductivityEntries.has(sourceKey)) continue;
    ctx.seenProductivityEntries.add(sourceKey);
    const totalRes = dVal + eVal + fVal + gVal + hVal;

    agent.csatRespondents += totalRes;
    agent.csat5Count += dVal;
    agent.csat4Count += eVal;
    agent.csat3Count += fVal;
    agent.csat2Count += gVal;
    agent.csat1Count += hVal;

    agent.productivityBase += prodBase;

    let existingProd = agent.dailyHistory.productivity.find(
      (h) => h.normDate === normDate || h.date === targetDateLabel,
    );
    if (existingProd) {
      existingProd.value += prodBase;
      if (!existingProd.normDate) existingProd.normDate = normDate;
    } else {
      agent.dailyHistory.productivity.push({
        date: targetDateLabel,
        normDate,
        value: prodBase,
      });
    }

    const pointsAsli = (dVal * 5) + (eVal * 4) + (fVal * 3) + (gVal * 2) + (hVal * 1);
    const totalResAsli = dVal + eVal + fVal + gVal + hVal;

    const csatDaily = totalResAsli > 0
      ? (pointsAsli / totalResAsli)
      : null;

    if (csatDaily !== null) {
      if (!ctx.totalProdCsatAsliSum[agent.csId])
        ctx.totalProdCsatAsliSum[agent.csId] = { sum: 0, count: 0 };

      ctx.totalProdCsatAsliSum[agent.csId].sum += pointsAsli;
      ctx.totalProdCsatAsliSum[agent.csId].count += totalResAsli;

      let existingCsat = agent.dailyHistory.csat.find(
        (h) => h.normDate === normDate || h.date === targetDateLabel,
      );
      if (existingCsat) {
        const existingCount = existingCsat.count || 0;
        const existingSum = existingCsat.sum ?? existingCsat.value * existingCount;
        existingCsat.count = existingCount + totalResAsli;
        existingCsat.sum = existingSum + pointsAsli;
        existingCsat.value = existingCsat.sum / existingCsat.count;
        if (!existingCsat.normDate) existingCsat.normDate = normDate;
      } else {
        agent.dailyHistory.csat.push({
          date: targetDateLabel,
          normDate,
          value: csatDaily,
          count: totalResAsli,
          sum: pointsAsli,
        });
      }
    }

    if (!isNaN(whuNum)) {
      let val = whuNum;
      if (whuStr.includes("%")) {
        val = parseFloat(whuStr.replace("%", ""));
      } else {
        val = whuNum * 100;
      }
      if (!ctx.totalWhuSum[agent.csId])
        ctx.totalWhuSum[agent.csId] = { sum: 0, count: 0 };
      ctx.totalWhuSum[agent.csId].sum += val;
      ctx.totalWhuSum[agent.csId].count += 1;

      let existingWhu = agent.dailyHistory.whu.find(
        (h) => h.normDate === normDate || h.date === targetDateLabel,
      );
      if (existingWhu) {
        // True running mean (sum/count) — the old `(prev + val) / 2` skewed
        // toward the last entry once a day had 3+ WHU rows.
        const prevCount = existingWhu.count ?? 1;
        const prevSum = existingWhu.sum ?? existingWhu.value * prevCount;
        existingWhu.count = prevCount + 1;
        existingWhu.sum = prevSum + val;
        existingWhu.value = existingWhu.sum / existingWhu.count;
        if (!existingWhu.normDate) existingWhu.normDate = normDate;
      } else {
        agent.dailyHistory.whu.push({
          date: targetDateLabel,
          normDate,
          value: val,
          count: 1,
          sum: val,
        });
      }
    }
  }
}

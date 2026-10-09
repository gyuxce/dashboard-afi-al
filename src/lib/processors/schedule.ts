import { cell, resolveScheduleIdentityColumns } from '../sheetHeaders';
import { normalizeDateStr, normalizeScheduleStatus, isScheduleManDay } from '../dataProcessor';
import type { ProcessorContext } from './context';

/**
 * Step 0: Schedule — man-days, attendance, and the schedule index used
 * by shift-22 overnight adjustment. Extracted verbatim from processKPIs.
 */
export function processSchedule(
  ctx: ProcessorContext,
  schedData: any[][],
): void {
  const { getAgent, isWithin, periodDictionary } = ctx;
  const scheduleColumns = resolveScheduleIdentityColumns(schedData[0] || []);

  if (schedData.length <= 1) return;

  // Pre-pass: index schedule statuses for shift-22 lookup.
  const scheduleHeaders = schedData[0] || [];
  for (let c = scheduleColumns.firstDateColumn; c < scheduleHeaders.length; c++) {
    const dateLabel = String(scheduleHeaders[c] || "").trim();
    const normDate = dateLabel ? normalizeDateStr(dateLabel) : null;
    if (!normDate) continue;

    for (let r = 1; r < schedData.length; r++) {
      const row = schedData[r];
      const agentId = cell(row, scheduleColumns.csId);
      if (!agentId) continue;

      const status = String(row?.[c] || "").trim().toUpperCase();
      if (!status) continue;

      const key = ctx.getScheduleKey(agentId, normDate);
      ctx.scheduleStatusByAgentDate.set(key, status);
      ctx.scheduleDateLabelByAgentDate.set(key, dateLabel);
    }
  }

  // Main pass: attendance and man-days.
  const headers = schedData[0] || [];
  for (let c = scheduleColumns.firstDateColumn; c < headers.length; c++) {
    const hd = String(headers[c]).trim();
    if (!hd) continue;

    const normDate = normalizeDateStr(hd);
    if (!normDate || !isWithin(normDate)) continue;

    for (let r = 1; r < schedData.length; r++) {
      const row = schedData[r];
      if (!row) continue;
      const agentId = cell(row, scheduleColumns.csId);
      const agent = getAgent(agentId);
      if (!agent) continue;

      const schedName = cell(row, scheduleColumns.name);
      const schedTL = cell(row, scheduleColumns.teamLeader);
      const schedBPO = cell(row, scheduleColumns.bpo);

      if (schedName && !agent.name) agent.name = schedName;
      if (schedTL && !agent.teamLeader) agent.teamLeader = schedTL;
      if (schedBPO && !agent.bpo && !periodDictionary?.[agentId]?.bpo) {
        agent.bpo = schedBPO;
      }

      const statusRaw = String(row[c] || "").trim();
      if (!statusRaw) continue;

      const normalizedStatus = normalizeScheduleStatus(statusRaw);
      const isManDay = isScheduleManDay(statusRaw);
      const isPresence =
        normalizedStatus === "PULLOUT" ||
        (isManDay && normalizedStatus !== "S");

      const existingSched = agent.dailyHistory.schedule.find(
        (s) => s.normDate === normDate || s.date === hd,
      );

      if (!existingSched) {
        agent.attendanceTotalDays += 1;

        if (isManDay || normalizedStatus === "PULLOUT")
          agent.attendanceDuty += 1;
        if (isPresence) agent.attendancePresence += 1;

        if (normalizedStatus === "OFF") agent.attendanceOff += 1;
        if (normalizedStatus === "S") agent.attendanceS += 1;
        if (normalizedStatus === "C") agent.attendanceC += 1;
        if (normalizedStatus === "PULLOUT") agent.attendancePullout += 1;

        agent.dailyHistory.schedule.push({
          date: hd,
          status: normalizedStatus,
          isManDay,
          normDate,
        });

        if (isManDay) {
          agent.manDays += 1;
        }
        continue;
      }

      if (isManDay && !existingSched.isManDay) {
        const prev = existingSched.status;
        const prevWasDuty = prev === "PULLOUT";

        existingSched.status = normalizedStatus;
        existingSched.isManDay = true;
        existingSched.date = hd;

        agent.manDays += 1;
        if (!prevWasDuty) agent.attendanceDuty += 1;
        if (isPresence) agent.attendancePresence += 1;
        if (normalizedStatus === "S") agent.attendanceS += 1;
        if (prev === "OFF") agent.attendanceOff = Math.max(0, agent.attendanceOff - 1);
        if (prev === "C") agent.attendanceC = Math.max(0, agent.attendanceC - 1);
      }
    }
  }
}

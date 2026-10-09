/**
 * Regression checks for man-days off-by-one bugs.
 * Run: node scripts/verify-mandays.mjs
 *
 * Mirrors the fixed logic from dataProcessor (isScheduleManDay + normDate dedupe).
 */

function normalizeDateStr(raw) {
  if (!raw) return null;
  const rawKey = String(raw).trim();
  let result = null;
  const dashMatch = rawKey.match(/^(\d{1,2})[-\s]([A-Za-z]+)(?:[-\s](\d{4}))?$/);
  if (dashMatch) {
    const [, day, monthStr, yearStr] = dashMatch;
    const monthMap = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const mNum = monthMap[monthStr.toLowerCase()];
    if (mNum !== undefined) {
      const y = yearStr ? parseInt(yearStr, 10) : 2026;
      result = `${y}-${String(mNum).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    }
  }
  if (!result) {
    const clean = rawKey.split(" ")[0];
    const parts = clean.split(/[-/]/);
    if (parts.length >= 3 && parts[2].length === 4) {
      const y = parseInt(parts[2], 10);
      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);
      let d, m;
      if (p1 > 12) { d = p1; m = p2; }
      else if (p2 > 12) { m = p1; d = p2; }
      else { d = p1; m = p2; }
      result = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    }
  }
  return result;
}

function isScheduleManDay(statusRaw) {
  const status = String(statusRaw || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!status) return false;
  if (status === "S") return true;
  if (status === "OFF" || status === "C" || status === "PULLOUT") return false;
  if (/^\d+([.,]\d+)?$/.test(status)) return true;
  if (/^\d{1,2}:\d{2}/.test(status)) return true;
  return false;
}

function countManDays(headers, row, startDate, endDate) {
  let manDays = 0;
  const seen = new Set();
  for (let c = 5; c < headers.length; c++) {
    const hd = String(headers[c] || "").trim();
    if (!hd) continue;
    const normDate = normalizeDateStr(hd);
    if (!normDate) continue;
    if (startDate && normDate < startDate) continue;
    if (endDate && normDate > endDate) continue;
    if (seen.has(normDate)) continue;
    const statusRaw = String(row[c] || "").trim();
    if (!statusRaw) continue;
    if (isScheduleManDay(statusRaw)) {
      seen.add(normDate);
      manDays += 1;
    } else {
      seen.add(normDate); // still mark day as seen so duplicate header can't double-count later
    }
  }
  return manDays;
}

function oldBuggyCount(headers, row, startDate, endDate) {
  // Old logic: match by raw header string + parseFloat isNumber + include unparseable headers
  let manDays = 0;
  const seenDates = new Set();
  for (let c = 5; c < headers.length; c++) {
    const hd = String(headers[c] || "").trim();
    if (!hd) continue;
    const normDate = normalizeDateStr(hd);
    if (normDate && startDate && normDate < startDate) continue;
    if (normDate && endDate && normDate > endDate) continue;
    if (seenDates.has(hd)) continue;
    seenDates.add(hd);
    const status = String(row[c] || "").trim().toUpperCase();
    const isNumber = !isNaN(parseFloat(status.replace(",", "."))) && status !== "";
    if (status === "S" || isNumber) manDays += 1;
  }
  return manDays;
}

let failed = 0;
function assert(name, cond, detail = "") {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", name, detail);
  } else {
    console.log("PASS:", name);
  }
}

// Case 1: duplicate date formats for same calendar day should not double-count
{
  const headers = ["No","CS ID","Name","TL","BPO","1/7/2026","01/07/2026","2/7/2026"];
  const row = ["1","3-1-001","A","TL1","BPO1","7","7","OFF"];
  const old = oldBuggyCount(headers, row, "2026-07-01", "2026-07-31");
  const neu = countManDays(headers, row, "2026-07-01", "2026-07-31");
  assert("duplicate date headers overcount in old logic", old === 2);
  assert("duplicate date headers fixed to 1 man-day", neu === 1, `got ${neu}`);
}

// Case 2: non-date trailing column with number must not add man-day
{
  const headers = ["No","CS ID","Name","TL","BPO","1/7/2026","Total"];
  const row = ["1","3-1-001","A","TL1","BPO1","7","15"];
  const old = oldBuggyCount(headers, row, "2026-07-01", "2026-07-31");
  const neu = countManDays(headers, row, "2026-07-01", "2026-07-31");
  assert("non-date Total column overcount in old logic", old === 2);
  assert("non-date Total column ignored", neu === 1, `got ${neu}`);
}

// Case 3: time-format shift still counts
{
  const headers = ["No","CS ID","Name","TL","BPO","1/7/2026","2/7/2026"];
  const row = ["1","3-1-001","A","TL1","BPO1","07:00","OFF"];
  assert("HH:MM shift counts", countManDays(headers, row, "2026-07-01", "2026-07-31") === 1);
}

// Case 4: S counts, OFF/C/PULLOUT do not
{
  const headers = ["No","CS ID","Name","TL","BPO","1/7/2026","2/7/2026","3/7/2026","4/7/2026"];
  const row = ["1","3-1-001","A","TL1","BPO1","S","OFF","C","PULLOUT"];
  assert("only S counts among leave codes", countManDays(headers, row, "2026-07-01", "2026-07-31") === 1);
}

// Case 5: first empty duplicate then real shift — still 1
{
  const headers = ["No","CS ID","Name","TL","BPO","1/7/2026","01/07/2026"];
  const row = ["1","3-1-001","A","TL1","BPO1","","22"];
  // Fixed loop skips empty then counts 22 once
  assert("empty then shift on duplicate date = 1", countManDays(headers, row, "2026-07-01", "2026-07-31") === 1);
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll man-days regression checks passed.");

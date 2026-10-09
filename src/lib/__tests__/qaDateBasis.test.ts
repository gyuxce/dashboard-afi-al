import { describe, it, expect } from 'vitest';
import { processKPIs } from '../dataProcessor';

// Column order matches the real QA sheet: I = Tanggal Case, N = Checking Date.
const header = ['CSID', 'Company Name', 'CS Name', 'CS ID (CRM)', 'Ticket ID', 'UID', 'CHATID', 'Tagg', 'Tanggal Case', 'Category', 'Sub Type Ticket', 'CSAT', 'Type of System Checking', 'Checking Date', 'QC Name', 'Mistake Level', 'Nilai Pengurang', 'QC Score'];
const row = (ticket: string, caseDate: string, checkingDate: string, score: string) =>
  ['3-1-1001', 'TIN', 'Agent One', 'Agent One', ticket, `uid${ticket}`, `chat${ticket}`, '', caseDate, 'General', 'Info', 'N/A', 'LIVECHAT', checkingDate, 'QC', 'NO MISTAKE', '0', score];

const qaData = [
  header,
  // case + checked in Aug
  row('1', '10-Agu-2026', '12-Agu-2026', '100'),
  // case in Aug, checked in Sep (late check) — belongs to Aug incentive
  row('2', '30-Agu-2026', '2-Sep-2026', '80'),
  // case in Jul, checked in Aug — belongs to July incentive, not Aug
  row('3', '28-Jul-2026', '3-Agu-2026', '60'),
  // no case date → falls back to the checking date
  row('4', '', '20-Agu-2026', '90'),
];

const schedule = [
  ['', 'CSID', 'Name', 'Team Leader', 'BPO', '1-Agu-2026'],
  ['', '3-1-1001', 'Agent One', 'Fandi', 'TIN', '08:00'],
];
const dict = { '3-1-1001': { name: 'Agent One', bpo: 'TIN', teamLeader: 'Fandi' } };

const run = (basis: 'checking' | 'case') =>
  processKPIs([], [], [], schedule, qaData, '2026-08-01', '2026-08-31', dict, undefined, { qaDateBasis: basis })
    .find((a) => a.csId === '3-1-1001')!;

describe('QA date basis', () => {
  it('daily views bucket by Checking Date (col N)', () => {
    const agent = run('checking');
    // tickets 1, 3, 4 were checked in Aug; ticket 2 was checked in Sep
    expect(agent.qaScoreCount).toBe(3);
    expect(agent.qaScoreSum).toBe(100 + 60 + 90);
  });

  it('incentive buckets by Tanggal Case (col I)', () => {
    const agent = run('case');
    // tickets 1, 2 (late check) and 4 (no case date → checking date) are Aug cases; ticket 3 is a July case
    expect(agent.qaScoreCount).toBe(3);
    expect(agent.qaScoreSum).toBe(100 + 80 + 90);
  });

  it('keeps the Checking Date on each entry for reconciliation', () => {
    const entry = run('case').qaHistory.find((q) => q.ticketId === '2')!;
    expect(entry.normDate).toBe('2026-08-30');
    expect(entry.checkingNormDate).toBe('2026-09-02');
  });
});

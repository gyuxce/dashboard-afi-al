import { describe, it, expect } from 'vitest';
import { processKPIs } from '../dataProcessor';

// Minimal sheet fixtures — just enough to verify the pipeline
// produces agents with correct identity, man-days, and QA scores.

const scheduleData = [
  ['', 'CSID', 'Name', 'Team Leader', 'BPO', '1-Agu-2026', '2-Agu-2026'],
  ['', '3-1-1001', 'Agent One', 'Fandi', 'TIN', '08:00', 'OFF'],
  ['', '3-1-1002', 'Agent Two', 'Yuge', 'TCID', 'OFF', '08:00'],
];

const productivityData: string[][] = [];

const csatScData: string[][] = [];

const slaData: string[][] = [];

const qaData = [
  ['CSID', 'Company Name', 'CS Name', 'CS ID (CRM)', 'Ticket ID', 'UID', 'CHATID', 'Tagg', 'Tanggal Case', 'Category', 'Sub Type Ticket', 'CSAT', 'Type of System Checking', 'Checking Date', 'QC Name', 'Mistake Level', 'Nilai Pengurang', 'QC Score'],
  ['3-1-1001', 'TIN', 'Agent One', 'Agent One', '24093396', '123', 'chat1', '', '1-Agu-2026', 'General', 'Info', 'N/A', 'LIVECHAT', '1-Agu-2026', 'QC Person', 'NO MISTAKE', '0', '100'],
  ['3-1-1001', 'TIN', 'Agent One', 'Agent One', '24093396', '123', 'chat1', '', '1-Agu-2026', 'General', 'Info', 'N/A', 'LIVECHAT', '1-Agu-2026', 'QC Person', 'MEDIUM', '10', ''],
];

const agentDictionary = {
  '3-1-1001': { name: 'Agent One', bpo: 'TIN', teamLeader: 'Fandi' },
  '3-1-1002': { name: 'Agent Two', bpo: 'TCID', teamLeader: 'Yuge' },
};

describe('processKPIs', () => {
  const result = processKPIs(
    productivityData,
    csatScData,
    slaData,
    scheduleData,
    qaData,
    '2026-08-01',
    '2026-08-31',
    agentDictionary,
  );

  it('creates agents from CSID dictionary', () => {
    expect(result.length).toBe(2);
    const agent1 = result.find(a => a.csId === '3-1-1001');
    const agent2 = result.find(a => a.csId === '3-1-1002');
    expect(agent1).toBeDefined();
    expect(agent2).toBeDefined();
  });

  it('applies roster identity (name, BPO, TL) from dictionary', () => {
    const agent1 = result.find(a => a.csId === '3-1-1001')!;
    expect(agent1.name).toBe('Agent One');
    expect(agent1.bpo).toBe('TIN');
    expect(agent1.teamLeader).toBe('Fandi');
  });

  it('counts man-days from schedule', () => {
    const agent1 = result.find(a => a.csId === '3-1-1001')!;
    // 1-Agu has "08:00" (man-day), 2-Agu has "OFF" (not man-day)
    expect(agent1.manDays).toBe(1);
  });

  it('counts QA score once per ticket even with multiple line-items', () => {
    const agent1 = result.find(a => a.csId === '3-1-1001')!;
    // Ticket 24093396 has two rows: one with score 100, one empty.
    // Score should be counted once → avg = 100, count = 1.
    expect(agent1.qaScoreCount).toBe(1);
    expect(agent1.qaScoreSum).toBe(100);
  });

  it('keeps all QA line-items in history for defect analysis', () => {
    const agent1 = result.find(a => a.csId === '3-1-1001')!;
    // Both rows should be in qaHistory (NO MISTAKE + MEDIUM)
    expect(agent1.qaHistory.length).toBe(2);
    const mistakes = agent1.qaHistory.filter(q => q.mistakeLevel === 'MEDIUM');
    expect(mistakes.length).toBe(1);
  });

  it('sorts results by CS ID', () => {
    expect(result[0].csId).toBe('3-1-1001');
    expect(result[1].csId).toBe('3-1-1002');
  });
});

describe('processKPIs — shift-22 overnight attribution', () => {
  // 3-1-2001 works shift 22 on 1-Agu, so a chat logged at 03:30 on 2-Agu
  // belongs to 1-Agu. 3-1-2002 works 08:00 that day, so their 03:30 chat
  // stays on 2-Agu.
  const schedule = [
    ['', 'CSID', 'Name', 'Team Leader', 'BPO', '1-Agu-2026', '2-Agu-2026'],
    ['', '3-1-2001', 'Night Owl', 'Fandi', 'TIN', '22', 'OFF'],
    ['', '3-1-2002', 'Day Shift', 'Fandi', 'TIN', '08:00', 'OFF'],
  ];

  const productivity = [
    ['Date', 'CS ID', 'CSAT', 'csat 5', 'csat 4', 'csat 3', 'csat 2', 'csat 1', 'Productivity', 'WHU'],
    ['2-Agu-2026 03:30', '3-1-2001', '', '0', '0', '0', '0', '0', '10', ''],
    ['2-Agu-2026 03:30', '3-1-2002', '', '0', '0', '0', '0', '0', '10', ''],
  ];

  const qa = [
    ['CSID', 'Company Name', 'CS Name', 'CS ID (CRM)', 'Ticket ID', 'UID', 'CHATID', 'Tagg', 'Tanggal Case', 'Category', 'Sub Type Ticket', 'CSAT', 'Type of System Checking', 'Checking Date', 'QC Name', 'Mistake Level', 'Nilai Pengurang', 'QC Score'],
    ['3-1-2001', 'TIN', 'Night Owl', 'Night Owl', 'T900', 'u1', 'c1', '', '1-Agu-2026', 'General', 'Info', 'N/A', 'LIVECHAT', '2-Agu-2026', 'QC', 'NO MISTAKE', '0', '100'],
  ];

  const dict = {
    '3-1-2001': { name: 'Night Owl', bpo: 'TIN', teamLeader: 'Fandi' },
    '3-1-2002': { name: 'Day Shift', bpo: 'TIN', teamLeader: 'Fandi' },
  };

  const result = processKPIs(productivity, [], [], schedule, qa, '2026-08-01', '2026-08-31', dict);
  const nightOwl = result.find((a) => a.csId === '3-1-2001')!;
  const dayShift = result.find((a) => a.csId === '3-1-2002')!;

  it('moves an overnight chat back a day when yesterday was shift 22', () => {
    expect(nightOwl.dailyHistory.productivity).toHaveLength(1);
    expect(nightOwl.dailyHistory.productivity[0].normDate).toBe('2026-08-01');
    expect(nightOwl.dailyHistory.productivity[0].value).toBe(10);
  });

  it('leaves the chat on its own day when yesterday was a normal shift', () => {
    expect(dayShift.dailyHistory.productivity).toHaveLength(1);
    expect(dayShift.dailyHistory.productivity[0].normDate).toBe('2026-08-02');
  });

  it('does NOT shift QA — it stays bucketed by Checking Date', () => {
    expect(nightOwl.qaHistory).toHaveLength(1);
    expect(nightOwl.qaHistory[0].normDate).toBe('2026-08-02');
  });
});

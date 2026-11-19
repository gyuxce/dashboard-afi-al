import { describe, expect, it } from 'vitest';
import { processKPIs } from '../dataProcessor';
import { respondentStats } from '../csatWeekly';

// Same placeholder-header layout as csatScTicketUid.test.ts.
const header = ['Tanggal', ...Array.from({ length: 33 }, (_, i) => `Column${i + 1}`), 'Agent Name', 'BPO', 'RCA Agent Area', 'RCA Customer Area', 'RCA Akulaku Process'];
let seq = 0;
const row = (o: { score: string; category?: string; date?: string; rcaCustomer?: string }) => {
  seq += 1;
  const r = Array(40).fill('');
  r[0] = o.date ?? '1 Agustus 2026';
  r[1] = 'AFI';
  r[2] = `2-${1000000000 + seq}-3-1_${seq}`;
  r[3] = '3-1-1001';
  r[4] = String(1000000000 + seq);
  r[8] = String(24500000 + seq);
  r[11] = o.category ?? 'Informasi Terkait Pembayaran';
  r[14] = o.score;
  r[37] = o.rcaCustomer ?? '';
  return r;
};
const schedule = [['', 'CSID', 'Name', 'Team Leader', 'BPO', '1-Agu-2026', '2-Agu-2026'], ['', '3-1-1001', 'Agent One', 'Fandi', 'TIN', '08:00', '08:00']];
const dictionary = { '3-1-1001': { name: 'Agent One', bpo: 'TIN', teamLeader: 'Fandi' } };
const run = (rows: string[][]) => processKPIs([], [header, ...rows], [], schedule, [], '2026-08-01', '2026-08-31', dictionary)[0];

describe('chats without a survey are folded per day', () => {
  const agent = run([
    row({ score: '' }), row({ score: '' }), row({ score: '' }),
    row({ score: '5.0' }),
    row({ score: '', date: '2 Agustus 2026' }),
    row({ score: '', category: 'Pengajuan Limit Kredit Ditolak' }), // takeout: folded apart from the normal ones
  ]);

  it('keeps one entry per day and takeout flag, with the number of chats', () => {
    const folded = agent.csatHistory.filter((h) => h.score === 0);
    expect(folded).toHaveLength(3);
    expect(folded.map((h) => `${h.isTakeout ? 'takeout' : 'normal'}:${h.count}`).sort()).toEqual(['normal:1', 'normal:3', 'takeout:1']);
    expect(new Set(folded.filter((h) => !h.isTakeout).map((h) => h.date)).size).toBe(2); // two different days
    expect(folded.every((h) => h.ticketId === '' && h.chatId === '' && h.response === '')).toBe(true);
  });

  it('keeps every rated chat as its own entry with its details', () => {
    const rated = agent.csatHistory.filter((h) => h.score > 0);
    expect(rated).toHaveLength(1);
    expect(rated[0].ticketId).not.toBe('');
  });

  it('does not change the score distribution, which still counts every chat', () => {
    expect(agent.csatScScoreDistribution['No Survey']).toBeDefined();
    const noSurvey = Object.values(agent.csatScScoreDistribution['No Survey']).reduce((a, b) => a + b, 0);
    expect(noSurvey).toBe(5);
  });

  it('gives the same processed / respondent counts as one entry per chat', () => {
    const folded = respondentStats([agent], 'full');
    const expanded = respondentStats(
      [{ ...agent, csatHistory: agent.csatHistory.flatMap((h) => Array.from({ length: h.count ?? 1 }, () => ({ ...h, count: undefined }))) }],
      'full',
    );
    expect(folded).toEqual(expanded);
    expect(folded.processed).toBe(6);
    expect(folded.respondents).toBe(1);
    expect(respondentStats([agent], 'fair').processed).toBe(5); // the takeout chat leaves the Fair view
  });
});

describe('rows with RCA are never folded', () => {
  it('keeps an unrated chat that carries an RCA label as a full entry', () => {
    const agent = run([row({ score: '', rcaCustomer: 'Verification Process' }), row({ score: '' })]);
    const withRca = agent.csatHistory.filter((h) => h.rcaCustomer);
    expect(withRca).toHaveLength(1);
    expect(withRca[0].ticketId).not.toBe('');
    expect(agent.rcaCustomerAreaCounts['Verification Process']).toBe(1);
  });
});

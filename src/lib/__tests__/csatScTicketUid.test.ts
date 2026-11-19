import { describe, expect, it } from 'vitest';
import { isCsatTakeoutCategory, processKPIs } from '../dataProcessor';
import { splitTicketAndUid } from '../processors/csatSc';

// A CSAT SC tab with placeholder headers ("Column1", ...), laid out like the real Aug-Oct 2026 tabs:
// 0 date, 2 chat id, 3 CS ID, 4 customer UID (also inside the chat id), 8 ticket number, 11 category, 14 score.
const header = ['Tanggal', ...Array.from({ length: 33 }, (_, i) => `Column${i + 1}`), 'Agent Name', 'BPO'];
const row = (o: { chat: string; uid: string; ticket: string; score: string; category?: string; date?: string }) => {
  const r = Array(40).fill('');
  r[0] = o.date ?? '1 Agustus 2026';
  r[1] = 'AFI';
  r[2] = o.chat;
  r[3] = '3-1-1001';
  r[4] = o.uid;
  r[8] = o.ticket;
  r[11] = o.category ?? 'Informasi Terkait Pembayaran';
  r[14] = o.score;
  return r;
};
const schedule = [
  ['', 'CSID', 'Name', 'Team Leader', 'BPO', '1-Agu-2026'],
  ['', '3-1-1001', 'Agent One', 'Fandi', 'TIN', '08:00'],
];
const dictionary = { '3-1-1001': { name: 'Agent One', bpo: 'TIN', teamLeader: 'Fandi' } };
const run = (rows: string[][]) =>
  processKPIs([], [header, ...rows], [], schedule, [], '2026-08-01', '2026-08-31', dictionary)[0];

describe('CSAT SC ticket and UID columns', () => {
  it('reads the ticket number as Ticket and the customer id as UID', () => {
    const agent = run([row({ chat: '2-2034264485-3-1_1790818307', uid: '2034264485', ticket: '24528938', score: '5.0' })]);
    expect(agent.csatHistory[0]).toMatchObject({ ticketId: '24528938', uid: '2034264485' });
  });

  it('counts every chat of a returning customer (same agent, same day, same UID) once per ticket', () => {
    const agent = run([
      row({ chat: '2-2034264485-3-1_1', uid: '2034264485', ticket: '24528938', score: '1.0' }),
      row({ chat: '2-2034264485-3-1_2', uid: '2034264485', ticket: '24528940', score: '2.0' }),
      row({ chat: '2-2034264485-3-1_3', uid: '2034264485', ticket: '24528951', score: '5.0' }),
    ]);
    expect(agent.csatHistory).toHaveLength(3);
    expect(agent.csatScFullCount).toBe(3);
    expect(agent.csatScGoodCount).toBe(1);
  });

  it('still drops a real duplicate: same agent, same day, same ticket', () => {
    const agent = run([
      row({ chat: '2-2034264485-3-1_1', uid: '2034264485', ticket: '24528938', score: '1.0' }),
      row({ chat: '2-2034264485-3-1_9', uid: '2034264485', ticket: '24528938', score: '1.0' }),
    ]);
    expect(agent.csatHistory).toHaveLength(1);
  });
});

describe('splitTicketAndUid', () => {
  it('takes whichever neighbour is embedded in the chat id as the UID', () => {
    expect(splitTicketAndUid('2034264485', '24528938', '2-2034264485-3-1_17')).toEqual({ ticketId: '24528938', uid: '2034264485' });
    // older layout with the two columns the other way round
    expect(splitTicketAndUid('24528938', '2034264485', '2-2034264485-3-1_17')).toEqual({ ticketId: '24528938', uid: '2034264485' });
  });

  it('falls back to the current sheet layout without a usable chat id', () => {
    expect(splitTicketAndUid('2034264485', '24528938', '')).toEqual({ ticketId: '24528938', uid: '2034264485' });
  });
});

describe('CSAT takeout categories', () => {
  it('covers exactly the three agreed categories (candidates live in the takeout simulation, not here)', () => {
    for (const c of [
      'Tidak Bisa Transaksi Namun Memiliki Limit',
      'Pengajuan Limit Kredit Ditolak',
      '  Pertanyaan Belum  Bisa Diidentifikasi ',
    ]) expect(isCsatTakeoutCategory(c)).toBe(true);
    for (const c of ['Kendala Qris', 'Chat/call Terputus', 'Grey Out Problem', 'Informasi Tentang Limit']) expect(isCsatTakeoutCategory(c)).toBe(false);
  });

  it('leaves takeout categories out of Fair but keeps them in Full', () => {
    const agent = run([
      row({ chat: '2-1111111111-3-1_1', uid: '1111111111', ticket: '24500001', score: '1.0', category: 'Pengajuan Limit Kredit Ditolak' }),
      row({ chat: '2-2222222222-3-1_1', uid: '2222222222', ticket: '24500002', score: '5.0', category: 'Informasi Terkait Pembayaran' }),
    ]);
    expect(agent.csatScFullCount).toBe(2);
    expect(agent.csatScFairCount).toBe(1);
  });
});

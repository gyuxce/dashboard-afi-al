import { describe, it, expect } from 'vitest';
import type { AgentKPI, CSATEntry } from '../dataProcessor';
import { buildTakeoutSimulation } from '../csatTakeoutSim';

const entry = (category: string, score: number): CSATEntry => ({
  date: '2026-09-01',
  normDate: '2026-09-01',
  ticketId: 't',
  chatId: 'c',
  uid: 'u',
  score,
  category,
  response: '',
  isTakeout: false,
});

const agent = (csId: string, rows: Array<[string, number, number]>): AgentKPI => {
  const csatHistory: CSATEntry[] = [];
  for (const [category, good, bad] of rows) {
    for (let i = 0; i < good; i++) csatHistory.push(entry(category, 5));
    for (let i = 0; i < bad; i++) csatHistory.push(entry(category, 1));
  }
  return { csId, name: `Agent ${csId}`, bpo: 'TIN', teamLeader: 'TL', csatHistory } as unknown as AgentKPI;
};

// Official takeout: "Tidak Bisa Transaksi Namun Memiliki Limit".
const A = agent('A', [
  ['Tidak Bisa Transaksi Namun Memiliki Limit', 2, 8],
  ['Chat/call Terputus', 1, 3],
  ['Permintaan Kode Pembayaran', 9, 1],
]);
const B = agent('B', [
  ['Tidak Bisa Transaksi Namun Memiliki Limit', 5, 5],
  ['Chat/call Terputus', 0, 2],
  ['Permintaan Kode Pembayaran', 8, 2],
]);

describe('buildTakeoutSimulation', () => {
  it('computes before / official totals', () => {
    const sim = buildTakeoutSimulation([A, B], new Set());
    expect(sim.before).toMatchObject({ valid: 46, good: 25 });
    // official = minus the 20 "Tidak Bisa Transaksi" ratings (7 good)
    expect(sim.official).toMatchObject({ valid: 26, good: 18 });
    expect(sim.simulated).toMatchObject({ valid: 26, good: 18 });
    expect(sim.extraCount).toBe(0);
  });

  it('removes an extra category from the simulated total only', () => {
    const sim = buildTakeoutSimulation([A, B], new Set(['chat/call terputus']));
    expect(sim.official).toMatchObject({ valid: 26, good: 18 });
    expect(sim.simulated).toMatchObject({ valid: 20, good: 17 });
    expect(sim.extraCount).toBe(1);
  });

  it('computes the per-category "alone" delta against the official total', () => {
    const sim = buildTakeoutSimulation([A, B], new Set());
    const chat = sim.categories.find((c) => c.key === 'chat/call terputus')!;
    expect(chat.valid).toBe(6);
    expect(chat.good).toBe(1);
    expect(chat.aloneDelta).toBeCloseTo((17 / 20) * 100 - (18 / 26) * 100, 6);
  });

  it('keeps official categories first, locked and selected', () => {
    const sim = buildTakeoutSimulation([A, B], new Set(['permintaan kode pembayaran']));
    expect(sim.categories[0].isOfficial).toBe(true);
    expect(sim.categories[0].selected).toBe(true);
    expect(sim.categories[0].aloneDelta).toBeNull();
  });

  it('ignores extra keys that are already official', () => {
    const sim = buildTakeoutSimulation([A, B], new Set(['tidak bisa transaksi namun memiliki limit']));
    expect(sim.extraCount).toBe(0);
    expect(sim.simulated).toEqual(sim.official);
  });

  it('shapes per-agent rows with the removed categories', () => {
    const sim = buildTakeoutSimulation([A, B], new Set(['chat/call terputus']));
    const a = sim.agents.find((r) => r.csId === 'A')!;
    expect(a.valid).toBe(24);
    expect(a.extras).toEqual([
      { key: 'chat/call terputus', label: 'Chat/call Terputus', valid: 4, good: 1, csat: 25 },
    ]);
    // official: 10 good out of 14; simulated: 9/10 (dropping 1 good of 4)
    expect(a.official).toBeCloseTo((10 / 14) * 100, 6);
    expect(a.simulated).toBeCloseTo((9 / 10) * 100, 6);
    expect(a.delta).toBeCloseTo((9 / 10) * 100 - (10 / 14) * 100, 6);
  });

  it('treats an empty category as Unknown Case and skips invalid scores', () => {
    const odd = agent('C', [['', 3, 1]]);
    odd.csatHistory.push(entry('', 3), entry('', 0));
    const sim = buildTakeoutSimulation([odd], new Set());
    const unknown = sim.categories.find((c) => c.key === '')!;
    expect(unknown.label).toBe('Unknown Case');
    expect(unknown.valid).toBe(4);
  });

  it('drops agents with no valid ratings', () => {
    const empty = { csId: 'Z', name: 'Z', bpo: '', teamLeader: '', csatHistory: [] } as unknown as AgentKPI;
    expect(buildTakeoutSimulation([empty], new Set()).agents).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { candidateImpacts, collectRatings, csatStats, negativeUsers, simulateTakeout } from '../csatTakeoutSim';

type E = { uid: string; category: string; score: number; isTakeout?: boolean };
const agent = (csId: string, entries: E[]): Pick<AgentKPI, 'csId' | 'csatHistory'> => ({
  csId,
  csatHistory: entries.map((e) => ({ date: '1', normDate: '2026-10-01', ticketId: 't', chatId: 'c', uid: e.uid, score: e.score, category: e.category, response: '', isTakeout: !!e.isTakeout })),
});

// Fair = everything that is not an agreed takeout category.
const data = [
  agent('a', [
    { uid: 'u1', category: 'Kendala Qris', score: 1 },
    { uid: 'u1', category: 'Informasi Limit', score: 1 },
    { uid: 'u1', category: 'Informasi Limit', score: 2 },
    { uid: 'u1', category: 'Informasi Limit', score: 1 },
    { uid: 'u2', category: 'Informasi Limit', score: 5 },
    { uid: 'u3', category: 'Kendala  QRIS', score: 4 },
    { uid: 'u4', category: 'Informasi Limit', score: 3 }, // score 3 is not a valid rating
    { uid: 'u5', category: 'Pengajuan Limit Kredit Ditolak', score: 1, isTakeout: true },
  ]),
  agent('b', [
    { uid: 'u1', category: 'Chat/call Terputus', score: 1 },
    { uid: 'u6', category: 'Informasi Limit', score: 5 },
    { uid: 'u7', category: 'Informasi Limit', score: 4 },
  ]),
];
const ratings = collectRatings(data);

describe('collectRatings / csatStats', () => {
  it('keeps only valid ratings and normalises category spelling', () => {
    expect(ratings).toHaveLength(10);
    expect(ratings.some((r) => r.score === 3)).toBe(false);
    expect(ratings.find((r) => r.uid === 'u3')?.category).toBe('kendala qris');
  });

  it('computes CSAT as the share that is not DSAT', () => {
    expect(csatStats([])).toEqual({ valid: 0, dsat: 0, csat: 0 });
    expect(csatStats(ratings)).toEqual({ valid: 10, dsat: 6, csat: 40 });
  });
});

describe('negativeUsers', () => {
  it('lists customers by number of DSAT over all valid ratings, takeout categories included', () => {
    expect(negativeUsers(ratings, 3)).toEqual([{ uid: 'u1', dsat: 5, ratings: 5, agents: 2, topCategory: 'informasi limit' }]);
    expect(negativeUsers(ratings, 1).map((u) => u.uid)).toEqual(['u1', 'u5']);
    expect(negativeUsers(ratings, Infinity)).toEqual([]);
  });

  it('ignores ratings without a UID', () => {
    expect(negativeUsers(collectRatings([agent('x', [{ uid: '', category: 'a', score: 1 }])]), 1)).toEqual([]);
  });
});

describe('simulateTakeout', () => {
  it('without any extra option the simulation equals the official Fair', () => {
    const r = simulateTakeout(ratings, { categories: [], negativeUsers: 'off' });
    expect(r.simulated).toEqual(r.fair);
    expect(r.fair).toEqual({ valid: 9, dsat: 5, csat: (4 / 9) * 100 });
    expect(r.full.valid).toBe(10);
    expect(r.removedRatings).toBe(0);
  });

  it('drops the chosen candidate categories from Fair', () => {
    const r = simulateTakeout(ratings, { categories: ['kendala qris'], negativeUsers: 'off' });
    expect(r.removedRatings).toBe(2);
    expect(r.removedDsat).toBe(1);
    expect(r.simulated).toEqual({ valid: 7, dsat: 4, csat: (3 / 7) * 100 });
  });

  it('drops every rating of a negative customer, good ones too, and counts them once even with overlapping options', () => {
    const r = simulateTakeout(ratings, { categories: ['kendala qris', 'chat/call terputus'], negativeUsers: 'gt3' });
    expect(r.negativeUserCount).toBe(1);
    // u1 has 5 ratings (all DSAT); u3 (good, kendala qris) also leaves through the category.
    expect(r.simulated).toEqual({ valid: 3, dsat: 0, csat: 100 });
    expect(r.removedRatings).toBe(6);
  });

  it('rule thresholds: 3x or more vs more than 3x', () => {
    const three = [agent('a', [{ uid: 'x', category: 'c', score: 1 }, { uid: 'x', category: 'c', score: 1 }, { uid: 'x', category: 'c', score: 2 }, { uid: 'y', category: 'c', score: 5 }])];
    const rr = collectRatings(three);
    expect(simulateTakeout(rr, { categories: [], negativeUsers: 'gte3' }).negativeUserCount).toBe(1);
    expect(simulateTakeout(rr, { categories: [], negativeUsers: 'gt3' }).negativeUserCount).toBe(0);
  });
});

describe('candidateImpacts', () => {
  it('reports each candidate alone against the official Fair', () => {
    const impacts = candidateImpacts(ratings);
    const qris = impacts.find((i) => i.key === 'kendala qris')!;
    expect(qris).toMatchObject({ valid: 2, dsat: 1, csat: 50 });
    expect(qris.fairIfRemoved).toBeCloseTo((3 / 7) * 100);
    expect(impacts.find((i) => i.key === 'grey out problem')).toMatchObject({ valid: 0, dsat: 0 });
  });
});

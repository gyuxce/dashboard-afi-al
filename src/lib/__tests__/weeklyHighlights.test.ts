import { describe, expect, it } from 'vitest';
import {
  agentHeadline,
  categoryHeadline,
  headcountHeadline,
  overviewHeadline,
  positiveRateHeadline,
  respondentHeadline,
  takeoutSimHeadline,
  tlHeadline,
  agentHighlights,
  categoryHighlights,
  headcountHighlights,
  overviewHighlights,
  positiveRateHighlights,
  respondentHighlights,
  takeoutSimHighlights,
  tlSamplingHighlights,
} from '../weeklyHighlights';

describe('weekly highlights (Indonesian)', () => {
  it('describes the positive rate and the gap to target', () => {
    const lines = positiveRateHighlights(
      [
        { label: 'W4 Okt', full: 65.72, fair: 78.03 },
        { label: 'W5 Okt', full: 66.44, fair: 72.61 },
      ],
      { full: 75, fair: 92 },
    );
    expect(lines).toEqual([
      'Positive rate W5 Okt: Before Takeout 66.44%, After Takeout 72.61%.',
      'Before Takeout naik 0.72 poin dari W4 Okt (65.72% ke 66.44%).',
      'After Takeout turun 5.42 poin dari W4 Okt (78.03% ke 72.61%).',
      'Kedua angka masih di bawah target (75% dan 92%).',
    ]);
  });

  it('says respondents fell with the from/to numbers', () => {
    const lines = respondentHighlights(
      [
        { label: 'W4 Okt', respondents: 1446, rate: 12.7 },
        { label: 'W5 Okt', respondents: 1394, rate: 12.3 },
      ],
      [{ label: '29 Okt', respondents: 152 }, { label: '30 Okt', respondents: 225 }],
    );
    expect(lines).toEqual([
      'Total responden W5 Okt turun dari 1446 ke 1394 (-52).',
      'Response rate 12.3% (W4 Okt: 12.7%).',
      'Hari tersibuk 30 Okt (225), tersepi 29 Okt (152).',
    ]);
  });

  it('reports top category, takeout share and the biggest mover', () => {
    const cat = (name: string, count: number) => ({ rank: 1, name, count, goodPct: null, isTakeout: false });
    const lines = categoryHighlights([
      { label: 'W4 Okt', top: [cat('Kendala QRIS', 14)], totalBad: 400, takeoutBad: 300 },
      { label: 'W5 Okt', top: [cat('Tidak Bisa Transaksi', 259), cat('Kendala QRIS', 18)], totalBad: 400, takeoutBad: 300 },
    ]);
    expect(lines[0]).toBe('Kategori DSAT terbanyak W5 Okt: Tidak Bisa Transaksi, 259 rating buruk (64.8% dari 400).');
    expect(lines[1]).toBe('Kategori takeout menyumbang 75.0% rating buruk (300 dari 400).');
    expect(lines[2]).toBe('Kendala QRIS naik dari 14 ke 18 dibanding W4 Okt.');
  });

  it('flags agents that repeat from the previous week', () => {
    const agent = (csId: string, badCount: number) => ({ csId, name: csId, badCount, topCategories: [{ name: 'X', count: badCount }] });
    const lines = agentHighlights([
      { label: 'W4 Okt', agents: [agent('a', 30), agent('b', 20)] },
      { label: 'W5 Okt', agents: [agent('b', 25), agent('c', 22)] },
    ]);
    expect(lines).toEqual([
      'b paling banyak rating 1–2 di W5 Okt: 25, terutama X (25).',
      'Masuk lima teratas juga di W4 Okt: b.',
      'X jadi penyebab utama 2 dari 2 agent.',
    ]);
  });

  it('writes the headcount lines', () => {
    const lines = headcountHighlights('AFI TIN', [{ label: 'W5 Okt', agents: 14, teamLeaders: 4, turnover: 0 }], 1, 0, 5);
    expect(lines).toEqual(['Turn over W5 Okt: 0%.', 'Total 14 agent Live Chat AFI TIN, 1 QC & 4 TL.']);
    expect(headcountHighlights('AFI NSI', [{ label: 'W5 Okt', agents: 14, teamLeaders: 4, turnover: null }], 1, 0, 5)[0]).toBe('Turn over W5 Okt: belum diisi.');
  });

  it('summarises the overview: targets met, misses, biggest moves', () => {
    const lines = overviewHighlights('W5 Okt', 'W4 Okt', [
      { label: 'CSAT SC Full', text: '66.44%', miss: true, hasTarget: true, delta: 0.72 },
      { label: 'SLA 1 Menit', text: '98,73%', miss: false, hasTarget: true, delta: -0.18 },
      { label: 'Total Productivity', text: '13518', miss: false, hasTarget: false, delta: null },
    ]);
    expect(lines).toEqual([
      '1 dari 2 KPI bertarget sudah tercapai di W5 Okt.',
      'Di bawah target: CSAT SC Full 66.44%.',
      'Naik terbesar dari W4 Okt: CSAT SC Full (+0.72 poin).',
      'Turun terbesar dari W4 Okt: SLA 1 Menit (-0.18 poin).',
    ]);
  });

  it('handles TL sampling with and without entered data', () => {
    expect(tlSamplingHighlights('W5 Okt', [{ name: 'Fandi', dsat: 40, analyzed: null }])).toEqual([
      'Total DSAT W5 Okt: 40.',
      'Belum ada DSAT yang dianalisis TL minggu ini.',
    ]);
    const lines = tlSamplingHighlights('W5 Okt', [
      { name: 'Fandi', dsat: 40, analyzed: 10 },
      { name: 'Agra', dsat: 60, analyzed: 45 },
      { name: 'Yuge', dsat: 20, analyzed: null },
    ]);
    expect(lines[0]).toBe('Total DSAT W5 Okt: 120, sudah dianalisis TL 55 (45.8%).');
    expect(lines[1]).toBe('Terendah: Fandi 25.0%, tertinggi: Agra 75.0%.');
    expect(lines[2]).toBe('Belum ada data sampling: Yuge.');
  });

  it('summarises the takeout simulation', () => {
    const lines = takeoutSimHighlights(
      'chat/call terputus dan kendala QRIS',
      [
        { label: 'Agustus', rows: [{ label: 'Full', a: 69.5, b: 66.9 }, { label: 'After', a: 79.42, b: 77.26 }, { label: 'Semua', a: 80.71, b: 78.85 }] },
        { label: 'Oktober', rows: [{ label: 'Full', a: 68, b: 65.2 }, { label: 'After', a: 77.71, b: 75.28 }, { label: 'Semua', a: 78.68, b: 76.58 }] },
      ],
      92,
    );
    expect(lines[0]).toBe('Menambah chat/call terputus dan kendala QRIS ke takeout menaikkan After Takeout 0.97–1.29 poin (rumus A).');
    expect(lines[2]).toBe('Target After Takeout 92% belum tercapai di skenario mana pun.');
  });
});

describe('slide headlines', () => {
  it('flags a drop in After Takeout as bad and a rise below target as a warning', () => {
    const cols = [
      { label: 'W4 Okt', full: 65.72, fair: 78.03 },
      { label: 'W5 Okt', full: 66.44, fair: 72.61 },
    ];
    expect(positiveRateHeadline(cols, { full: 75, fair: 92 })).toEqual({ text: 'After Takeout turun 5.42 poin ke 72.61%', tone: 'bad' });
    expect(positiveRateHeadline([cols[1], { label: 'W6', full: 70, fair: 80 }], { full: 75, fair: 92 })?.tone).toBe('warn');
  });

  it('keeps respondents neutral and names the change', () => {
    expect(
      respondentHeadline([
        { label: 'W4 Okt', respondents: 787, rate: 12.6 },
        { label: 'W5 Okt', respondents: 776, rate: 11.9 },
      ]),
    ).toEqual({ text: 'Responden turun 11 menjadi 776', tone: 'neutral' });
  });

  it('names the top category, repeating agents and TL sampling state', () => {
    const cat = { rank: 1, name: 'Tidak Bisa Transaksi', count: 147, goodPct: null, isTakeout: true };
    expect(categoryHeadline([{ label: 'W5', top: [cat], totalBad: 254, takeoutBad: 162 }])).toEqual({
      text: '64% rating buruk berasal dari kategori takeout (162 dari 254)',
      tone: 'warn',
    });
    expect(categoryHeadline([{ label: 'W5', top: [cat], totalBad: 254, takeoutBad: 40 }])?.tone).toBe('bad');

    const agent = (csId: string, badCount: number) => ({ csId, name: csId, badCount, topCategories: [] });
    expect(agentHeadline([{ label: 'W4', agents: [agent('a', 9)] }, { label: 'W5', agents: [agent('a', 8)] }])?.text).toBe(
      '1 agent berulang dari W4; a tertinggi (8 rating 1–2)',
    );

    expect(tlHeadline('W5', [{ name: 'Fandi', dsat: 40, analyzed: null }])).toEqual({
      text: 'Belum ada sampling TL; 40 DSAT menunggu dianalisis',
      tone: 'warn',
    });
    expect(tlHeadline('W5', [{ name: 'Fandi', dsat: 40, analyzed: 40 }])?.tone).toBe('good');
  });

  it('writes the headcount and overview headlines', () => {
    expect(headcountHeadline('W5 Okt', 14, 0, 5)).toEqual({ text: 'Turn over W5 Okt 0%, 14 agent aktif', tone: 'good' });
    expect(headcountHeadline('W5 Okt', 14, 8, 5).tone).toBe('bad');
    expect(headcountHeadline('W5 Okt', 14, null, 5)).toEqual({ text: '14 agent aktif di W5 Okt; turn over belum diisi', tone: 'warn' });
    const item = (miss: boolean) => ({ label: 'x', text: '1', miss, hasTarget: true, delta: null });
    expect(overviewHeadline('W5 Okt', [item(true), item(false), item(false)])).toEqual({
      text: '1 dari 3 KPI di bawah target di W5 Okt',
      tone: 'warn',
    });
    expect(overviewHeadline('W5 Okt', [item(false)])?.tone).toBe('good');
  });

  it('summarises the takeout simulation gain', () => {
    const months = [
      { rows: [{ label: 'Full', a: 69, b: 66 }, { label: 'After', a: 79.42, b: 77 }, { label: 'Semua', a: 80.71, b: 78 }] },
    ];
    expect(takeoutSimHeadline(months, 92)?.text).toBe('Tambahan takeout hanya menaikkan After Takeout 1.29–1.29 poin; target 92% tetap jauh');
  });
});

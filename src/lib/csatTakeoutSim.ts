import type { AgentKPI } from './dataProcessor';

/**
 * What-if for CSAT SC takeout. Nothing here changes the official Full / Fair numbers (see BUSINESS_RULES.md section 2):
 * it only re-counts the ratings of the selected period with extra exclusions switched on.
 */

export const TAKEOUT_CANDIDATES = [
  { key: 'kendala qris', label: 'Kendala Qris', note: 'Sistem / produk' },
  { key: 'chat/call terputus', label: 'Chat/call Terputus', note: 'Koneksi putus' },
  { key: 'grey out problem', label: 'Grey Out Problem', note: 'Sistem / aplikasi' },
] as const;

export type CandidateKey = (typeof TAKEOUT_CANDIDATES)[number]['key'];

/** DSAT (score 1 or 2) given by one customer in the period: `off`, `3 or more`, or `more than 3` (4 or more). */
export type NegativeUserRule = 'off' | 'gte3' | 'gt3';
export const NEGATIVE_USER_MIN: Record<NegativeUserRule, number> = { off: Infinity, gte3: 3, gt3: 4 };

type Rating = {
  csId: string;
  uid: string;
  category: string;
  score: number;
  isTakeout: boolean;
};

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const isValidScore = (score: number) => score === 1 || score === 2 || score === 4 || score === 5;
const isDsat = (r: Rating) => r.score === 1 || r.score === 2;

/** Every valid rating (1, 2, 4, 5) of the given agents, as shown in the dashboard (after dedupe). */
export function collectRatings(agents: Pick<AgentKPI, 'csId' | 'csatHistory'>[]): Rating[] {
  const out: Rating[] = [];
  for (const a of agents) {
    for (const h of a.csatHistory || []) {
      if (!isValidScore(h.score)) continue;
      out.push({ csId: a.csId, uid: (h.uid || '').trim(), category: normalize(h.category || ''), score: h.score, isTakeout: h.isTakeout });
    }
  }
  return out;
}

export type SimStats = { valid: number; dsat: number; csat: number };

export function csatStats(ratings: Rating[]): SimStats {
  const dsat = ratings.filter(isDsat).length;
  return { valid: ratings.length, dsat, csat: ratings.length > 0 ? ((ratings.length - dsat) / ratings.length) * 100 : 0 };
}

export type NegativeUserRow = { uid: string; dsat: number; ratings: number; agents: number; topCategory: string };

/** Customers with at least `min` DSAT in the ratings. DSAT is counted over ALL valid ratings, takeout categories included. */
export function negativeUsers(ratings: Rating[], min: number): NegativeUserRow[] {
  if (!Number.isFinite(min)) return [];
  const byUid = new Map<string, { dsat: number; ratings: number; agents: Set<string>; categories: Map<string, number> }>();
  for (const r of ratings) {
    if (!r.uid) continue;
    let u = byUid.get(r.uid);
    if (!u) byUid.set(r.uid, (u = { dsat: 0, ratings: 0, agents: new Set(), categories: new Map() }));
    u.ratings += 1;
    u.agents.add(r.csId);
    if (isDsat(r)) {
      u.dsat += 1;
      u.categories.set(r.category, (u.categories.get(r.category) || 0) + 1);
    }
  }
  const rows: NegativeUserRow[] = [];
  byUid.forEach((u, uid) => {
    if (u.dsat < min) return;
    const top = [...u.categories.entries()].sort((a, b) => b[1] - a[1])[0];
    rows.push({ uid, dsat: u.dsat, ratings: u.ratings, agents: u.agents.size, topCategory: top ? top[0] : '' });
  });
  return rows.sort((a, b) => b.dsat - a.dsat || b.ratings - a.ratings || a.uid.localeCompare(b.uid));
}

export type TakeoutScenario = { categories: CandidateKey[]; negativeUsers: NegativeUserRule };

export type SimResult = {
  full: SimStats;
  /** The official Fair number: only the agreed takeout categories are out. */
  fair: SimStats;
  /** Fair with the scenario's extra exclusions. */
  simulated: SimStats;
  removedRatings: number;
  removedDsat: number;
  negativeUserCount: number;
};

export function simulateTakeout(ratings: Rating[], scenario: TakeoutScenario): SimResult {
  const fairRatings = ratings.filter((r) => !r.isTakeout);
  const extra = new Set<string>(scenario.categories);
  const negative = new Set(negativeUsers(ratings, NEGATIVE_USER_MIN[scenario.negativeUsers]).map((u) => u.uid));
  const kept = fairRatings.filter((r) => !extra.has(r.category) && !(r.uid && negative.has(r.uid)));
  const fair = csatStats(fairRatings);
  const simulated = csatStats(kept);
  return {
    full: csatStats(ratings),
    fair,
    simulated,
    removedRatings: fair.valid - simulated.valid,
    removedDsat: fair.dsat - simulated.dsat,
    negativeUserCount: negative.size,
  };
}

export type CandidateImpact = { key: CandidateKey; label: string; note: string; valid: number; dsat: number; csat: number; fairIfRemoved: number };

/** Each candidate category on its own, on top of the official Fair. They overlap with nothing, so the effects roughly add up. */
export function candidateImpacts(ratings: Rating[]): CandidateImpact[] {
  const fairRatings = ratings.filter((r) => !r.isTakeout);
  return TAKEOUT_CANDIDATES.map((c) => {
    const inGroup = fairRatings.filter((r) => r.category === c.key);
    const group = csatStats(inGroup);
    return { key: c.key, label: c.label, note: c.note, valid: group.valid, dsat: group.dsat, csat: group.csat, fairIfRemoved: csatStats(fairRatings.filter((r) => r.category !== c.key)).csat };
  });
}

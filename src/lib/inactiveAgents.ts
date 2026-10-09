import { normalizeAgentName } from './teamLeaderRows';

export type InactiveAgentRule = {
  /** Agent name, matched case- and whitespace-insensitively. */
  name: string;
  /** Inclusive `YYYY-MM`. The agent is hidden for any period ending in this month or later. */
  inactiveFrom: string;
};

/**
 * Single source of truth for agents who left partway through the tracked
 * history. Both the Leaderboard and the Insentif simulation exclude them.
 *
 * To retire an agent, add ONE line here — no other file needs to change.
 * Follow-up: read this from a `Status` column in the CSID sheet so retiring
 * an agent needs no code change / redeploy at all.
 */
export const INACTIVE_AGENT_RULES: readonly InactiveAgentRule[] = [
  { name: 'edgar gasita adhigama', inactiveFrom: '2026-06' },
];

/** True when `agent` should be excluded from ranking/incentive for a period ending on `periodEnd`. */
export const isInactiveAgent = (
  agent: { name?: string | null },
  periodEnd: string,
): boolean => {
  const periodMonth = String(periodEnd || '').slice(0, 7);
  const name = normalizeAgentName(agent.name || '');
  if (!name) return false;
  return INACTIVE_AGENT_RULES.some(
    (rule) => name === rule.name && periodMonth >= rule.inactiveFrom,
  );
};

import { findHeader } from './sheetHeaders';

export type AgentDictionary = Record<string, {
  name: string;
  bpo: string;
  teamLeader: string;
}>;

export function isAgentDictionaryPopulated(
  dictionary?: AgentDictionary | null,
): dictionary is AgentDictionary {
  return !!dictionary && Object.keys(dictionary).length > 0;
}

/** Resolve the aliases accepted by CSV validation before parsing CSID rows. */
export function resolveCsidColumns(headers: unknown[]) {
  return {
    id: findHeader(headers, ['CS ID', 'csid', 'id', 'cs_id']),
    name: findHeader(headers, ['Agent Name', 'name', 'Nama']),
    bpo: findHeader(headers, ['BPO', 'company', 'Perusahaan']),
    teamLeader: findHeader(headers, ['Team Leader', 'TL', 'leader', 'supervisor']),
  };
}

/**
 * Builds a roster without assuming a fixed CSID column order.
 * Invalid/header-like IDs are ignored, while non-legacy ID formats are kept
 * so a new company ID convention does not silently erase all agents.
 */
export function buildAgentDictionary(data: unknown[][]): AgentDictionary {
  if (!data.length) return {};
  const columns = resolveCsidColumns(data[0] || []);
  if (columns.id < 0) return {};

  const dictionary: AgentDictionary = {};
  for (const row of data.slice(1)) {
    if (!row) continue;
    const id = String(row[columns.id] || '').trim();
    if (!id || ['cs id', 'csid', 'id', 'undefined', '-'].includes(id.toLowerCase())) continue;

    const name = columns.name >= 0 ? String(row[columns.name] || '').trim() : '';
    const bpo = columns.bpo >= 0 ? String(row[columns.bpo] || '').trim() : '';
    const teamLeader = columns.teamLeader >= 0
      ? String(row[columns.teamLeader] || '').trim()
      : '';

    const existing = dictionary[id];
    dictionary[id] = {
      name: name || existing?.name || '',
      bpo: bpo || existing?.bpo || '',
      teamLeader: teamLeader || existing?.teamLeader || '',
    };
  }
  return dictionary;
}

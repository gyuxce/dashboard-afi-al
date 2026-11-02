import { describe, expect, it } from 'vitest';
import { canonicalBpoName, isSmallBpoName } from '../bpoNames';
import { matchesAgentScope } from '../dataProcessor';
import { buildAgentDictionary } from '../csid';

describe('BPO rename TIN → NSI', () => {
  it('shows old sheet values as NSI', () => {
    expect(canonicalBpoName('TIN')).toBe('NSI');
    expect(canonicalBpoName('TCID X TIN')).toBe('TCID X NSI');
    expect(canonicalBpoName('TCID')).toBe('TCID');
    expect(canonicalBpoName('Tinggi')).toBe('Tinggi');
  });

  it('treats TCID and TCID × NSI as the small BPO views', () => {
    expect(isSmallBpoName('TCID')).toBe(true);
    expect(isSmallBpoName('TCID X NSI')).toBe(true);
    expect(isSmallBpoName('TCID X TIN')).toBe(true);
    expect(isSmallBpoName('NSI')).toBe(false);
    expect(isSmallBpoName('All BPO')).toBe(false);
  });

  it('filters old and new spellings alike', () => {
    const agent = (bpo: string) => ({ bpo, teamLeader: 'Fandi', name: 'A', csId: '1' });
    const scope = (bpo: string) => ({ bpo, teamLeader: 'All TL', agent: 'All Agents' });
    expect(matchesAgentScope(agent('TIN'), scope('NSI'))).toBe(true);
    expect(matchesAgentScope(agent('NSI'), scope('NSI'))).toBe(true);
    expect(matchesAgentScope(agent('TCID X TIN'), scope('TCID X NSI'))).toBe(true);
    expect(matchesAgentScope(agent('TCID'), scope('NSI'))).toBe(false);
  });

  it('builds the roster with the new name', () => {
    const dict = buildAgentDictionary([
      ['CS ID', 'AGENT NAME', 'BPO', 'TL'],
      ['3-1-1', 'Agent', 'TIN', 'Fandi'],
    ]);
    expect(dict['3-1-1'].bpo).toBe('NSI');
  });
});

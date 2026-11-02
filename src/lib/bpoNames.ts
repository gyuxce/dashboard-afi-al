/**
 * The vendor TIN was renamed NSI. Sheets from before the rename still say "TIN" (and
 * "TCID X TIN"), so both spellings are accepted everywhere and shown as NSI.
 */
export function canonicalBpoName(value: string): string {
  return String(value ?? '').replace(/\bTIN\b/gi, 'NSI');
}

/** Smallest BPO views (TCID alone or shared with NSI) show fewer categories and agents. */
export function isSmallBpoName(value: string): boolean {
  const upper = canonicalBpoName(value).trim().toUpperCase();
  return upper === 'TCID' || upper === 'TCID X NSI' || upper === 'NSI X TCID';
}

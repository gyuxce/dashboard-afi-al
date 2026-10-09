import { describe, expect, it } from 'vitest';
import { parseSpreadsheetIdMap } from '../sheetsApi';

describe('parseSpreadsheetIdMap', () => {
  it('reads a month -> spreadsheet id JSON map', () => {
    expect(parseSpreadsheetIdMap('{"nov_2026":" abc ","DEC_2026":"def"}')).toEqual({
      NOV_2026: 'abc',
      DEC_2026: 'def',
    });
  });

  it('ignores empty, invalid, or non-object values', () => {
    expect(parseSpreadsheetIdMap(undefined)).toEqual({});
    expect(parseSpreadsheetIdMap('')).toEqual({});
    expect(parseSpreadsheetIdMap('not json')).toEqual({});
    expect(parseSpreadsheetIdMap('["a"]')).toEqual({});
    expect(parseSpreadsheetIdMap('{"NOV_2026":"","DEC_2026":5}')).toEqual({});
  });
});

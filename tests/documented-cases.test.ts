import { describe, expect, it } from 'vitest';
import { by, geneRows, scanCsv } from './helpers';

// Cases reported in the literature on Excel gene-name errors (Ziemann et al.; Retraction Watch 2023),
// plus the standard English month forms. Each row is: what the spreadsheet shows -> original symbol.
const CASES: [string, string][] = [
  ['2-Sep', 'SEPT2'],
  ['1-Mar', 'MARCH1'],
  ['1-Dec', 'DEC1'],
  ['4-Oct', 'OCT4'],
  ['15-Sep', 'SEP15'],
  ['2-ago', 'AGO2'], // Spanish setup: AGO2 became Aug-02
  ['1-mei', 'MEI1'], // Dutch setup: MEI1 became May-01
  ['Jan-41', 'TAMM41'], // Finnish setup: TAMM41 became Jan-41
];

describe('documented real-world gene-name errors', () => {
  for (const [shown, original] of CASES) {
    it(`${shown} is traced back to ${original}`, () => {
      const hits = by(scanCsv(geneRows([shown])), 'gene-date');
      expect(hits).toHaveLength(1);
      expect(hits[0].confidence).toBe('high');
      expect(hits[0].likely).toContain(original);
    });
  }
  it('a clean gene list produces no gene-date findings', () => {
    expect(by(scanCsv(geneRows(['PTEN', 'NRAS'])), 'gene-date')).toHaveLength(0);
  });
  it('a real date column is not treated as damaged gene names', () => {
    const csv = ['Visit,Count', '2-Sep,1', '3-Sep,2', '4-Sep,3', '5-Sep,4', '6-Sep,5', '7-Sep,6'].join('\n');
    expect(by(scanCsv(csv), 'gene-date')).toHaveLength(0);
  });
  it('a re-imported date number in a gene column is flagged', () => {
    const hits = by(scanCsv(geneRows(['44076'])), 'gene-number');
    expect(hits).toHaveLength(1);
    expect(hits[0].likely).toContain('SEPT2');
  });
});

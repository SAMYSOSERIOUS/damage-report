import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { by, scanCsv } from './helpers';

// These CSV files were exported by LibreOffice (see testbench/fixtures/libreoffice/VERSION.txt) from the
// openpyxl-written .xlsx fixtures. Different program, different date style: the damage has to be found anyway.
const read = (n: string) =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'testbench', 'fixtures', 'libreoffice', n), 'utf8');

describe('CSV exported by another spreadsheet program (LibreOffice)', () => {
  it('traces dates in the gene column back to gene names', () => {
    const hits = by(scanCsv(read('gene-dates.csv')), 'gene-date');
    const likely = hits.map((h) => h.likely ?? '').join(' | ');
    for (const g of ['SEPT2', 'MARCH1', 'DEC1', 'OCT4', 'TAMM41']) expect(likely).toContain(g);
    expect(hits).toHaveLength(5);
    expect(by(scanCsv(read('gene-dates.csv')), 'gene-number')).toHaveLength(1);
  });
  it('finds the other damage types in the customer file', () => {
    const r = scanCsv(read('customers.csv'));
    expect(by(r, 'long-id').length).toBeGreaterThanOrEqual(5);
    expect(by(r, 'leading-zeros')).toHaveLength(2);
    expect(by(r, 'mixed-dates').length).toBeGreaterThanOrEqual(1);
    expect(by(r, 'mojibake')).toHaveLength(1);
  });
  it('is quiet on the clean file', () => {
    expect(scanCsv(read('clean.csv')).totals.flaggedAny).toBe(0);
  });
});

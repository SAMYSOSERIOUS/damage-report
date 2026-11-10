import { describe, expect, it } from 'vitest';
import { readTables } from '../src/core';
import { by, fixture, scanFile } from './helpers';

describe('xlsx reader (files written by openpyxl, not by this project)', () => {
  it('reads sheets, headers, strings, numbers and dates with their formats', () => {
    const [t] = readTables('gene-dates.xlsx', fixture('gene-dates.xlsx'));
    expect(t.headers).toEqual(['Gene', 'Count']);
    expect(t.rows[0][0]).toMatchObject({ t: 'text', text: 'TP53' });
    expect(t.rows[2][0]).toMatchObject({ t: 'date', text: '2-Sep', fmt: 'd-mmm' });
    expect(t.rows[12][0]).toMatchObject({ t: 'date', text: 'Jan-41' });
    expect(t.rows[0][1]).toMatchObject({ t: 'number', num: 120 });
    expect(t.rowNums[0]).toBe(2);
  });
  it('finds every mangled gene name in the Excel file', () => {
    const r = scanFile('gene-dates.xlsx');
    const dates = by(r, 'gene-date');
    expect(dates.map((f) => f.address)).toEqual(['A4', 'A5', 'A6', 'A11', 'A14']);
    expect(dates.every((f) => f.confidence === 'high')).toBe(true);
    const likely = dates.map((f) => f.likely).join(' | ');
    for (const g of ['SEPT2', 'MARCH1', 'DEC1', 'OCT4', 'TAMM41']) expect(likely).toContain(g);
    expect(by(r, 'gene-number').map((f) => f.address)).toEqual(['A18']);
  });
  it('finds long IDs, lost zeros, mixed dates, garbled text and text numbers', () => {
    const r = scanFile('customers.xlsx');
    expect(by(r, 'long-id').length).toBeGreaterThanOrEqual(5);
    expect(by(r, 'leading-zeros').map((f) => f.address)).toEqual(['B3', 'B5']);
    expect(by(r, 'mixed-dates').length).toBeGreaterThanOrEqual(1);
    expect(by(r, 'mojibake').map((f) => f.likely)).toContain('José García');
    expect(by(r, 'number-text').map((f) => f.stored)).toContain('1 200');
  });
  it('reports nothing on a clean Excel file with real dates', () => {
    const r = scanFile('clean.xlsx');
    expect(r.totals.flaggedAny).toBe(0);
  });
  it('gives a clear message for old .xls files and unknown types', () => {
    expect(() => readTables('a.xls', new Uint8Array())).toThrow(/Old \.xls/);
    expect(() => readTables('a.pdf', new Uint8Array())).toThrow(/Unsupported/);
  });
});

import { scanFile as _sf, by as _b } from './helpers';
describe('text columns in Excel (found while making the test files)', () => {
  it('does not flag a ZIP column that is deliberately stored as text', () => {
    expect(_b(_sf('clean-text-zip.xlsx'), 'number-text')).toHaveLength(0);
  });
});

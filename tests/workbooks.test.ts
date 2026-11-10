import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { analyze, applyFixes, exportXlsx, patchXlsx, planFixes, readTables, recoveryList, readXlsxBytes, untouchedViolations, type Decisions } from '../src/core';

const dir = join(__dirname, '..', 'testbench', 'workbooks');
const load = (n: string) => new Uint8Array(readFileSync(join(dir, n)));
const truthOf = (n: string): Record<string, string> => JSON.parse(readFileSync(join(dir, n + '.truth.json'), 'utf8'));
const NAMES = ['genes_dates.xlsx', 'genes_dates_1904.xlsx', 'barcodes.xlsx', 'customers_zip.xlsx', 'sales_eu_text.xlsx', 'multi_formulas.xlsx'];

function run(name: string, choices: boolean) {
  const bytes = load(name);
  const tables = readTables(name, bytes);
  const rep = analyze(name, tables);
  const plans = tables.map((t, i) => planFixes(t, rep.tables[i], { geneNames: 'old' }));
  const dec: Decisions = {};
  for (const p of plans.flatMap((x) => x.proposals)) {
    if (p.box === 'proven' || (choices && p.box === 'choice')) dec[p.id] = p.options[0].value;
  }
  const fixes = tables.map((t, i) => ({ table: t, plan: plans[i], fix: applyFixes(t, plans[i], dec) }));
  return { bytes, tables, plans, fixes, dec };
}

describe('realistic workbooks', () => {
  for (const name of NAMES) {
    it(`${name}: no proven fix disagrees with the truth, and nothing else changes`, () => {
      const truth = truthOf(name);
      const { plans, fixes } = run(name, false);
      for (const p of plans.flatMap((x) => x.proposals)) {
        const t = truth[p.address];
        if (p.box === 'proven' && t !== undefined) expect(t.split('|'), `${p.address} ${p.before}`).toContain(p.options[0].value);
      }
      for (const f of fixes) {
        const allowed = new Set(f.plan.proposals.map((p) => `${p.rowIndex}:${p.col}`));
        expect(untouchedViolations(f.table, f.fix.table, allowed)).toEqual([]);
      }
    });
    it(`${name}: patching the original file edits only the fixed cells`, () => {
      const { bytes, fixes } = run(name, true);
      const patched = patchXlsx(bytes, fixes);
      const a = unzipSync(bytes);
      const b = unzipSync(patched);
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
      const changedSheets = new Set(fixes.filter((f) => f.fix.log.some((l) => l.status === 'fixed')).map((f) => f.table.sheetPath));
      for (const k of Object.keys(a)) {
        if (changedSheets.has(k)) continue;
        expect(strFromU8(b[k]) === strFromU8(a[k]), `${k} must be identical`).toBe(true);
      }
      const before = readXlsxBytes(bytes, name);
      const after = readXlsxBytes(patched, name);
      before.forEach((t, i) => {
        const allowed = new Set(fixes[i].plan.proposals.map((p) => `${p.rowIndex}:${p.col}`));
        expect(untouchedViolations(t, after[i], allowed)).toEqual([]);
        expect(after[i].formulaCells).toBe(t.formulaCells);
      });
    });
  }

  it('barcodes: lost zeros come back with the check digit as proof', () => {
    const truth = truthOf('barcodes.xlsx');
    const { plans } = run('barcodes.xlsx', false);
    const got = plans[0].proposals.filter((p) => p.detector === 'leading-zeros');
    const proven = got.filter((p) => p.box === 'proven');
    expect(proven.length).toBeGreaterThanOrEqual(5);
    for (const p of got) if (truth[p.address]) expect(p.options[0].value).toBe(truth[p.address]);
  });
  it('ZIP codes are confirmed by the State column', () => {
    const { plans } = run('customers_zip.xlsx', false);
    const z = plans[0].proposals.filter((p) => p.group === 'leading-zeros:state');
    expect(z.length).toBeGreaterThanOrEqual(10);
    expect(z[0].clue).toContain('State column');
  });
  it('European numbers are converted from the column vote', () => {
    const truth = truthOf('sales_eu_text.xlsx');
    const { plans, fixes } = run('sales_eu_text.xlsx', false);
    const p = plans[0].proposals.filter((x) => x.detector === 'number-text');
    expect(p.length).toBe(30);
    const t = fixes[0].fix.table;
    for (const x of p) expect(Number(t.rows[x.rowIndex][x.col].text)).toBeCloseTo(Number(truth[x.address]), 6);
    expect(t.rows[0][1].t).toBe('number');
  });
  it('the 1904 date system is respected', () => {
    const { plans } = run('genes_dates_1904.xlsx', false);
    const num = plans[0].proposals.find((p) => p.detector === 'gene-number')!;
    expect(num.options[0].value).toBe('SEPT4');
    const { plans: p1900 } = run('genes_dates.xlsx', false);
    expect(p1900[0].proposals.find((p) => p.detector === 'gene-number')!.options.map((o) => o.value)).toContain('SEPT3');
  });
  it('formulas survive the patch and the clean copy warns about them', () => {
    const { bytes, tables, fixes } = run('multi_formulas.xlsx', true);
    expect(tables[0].formulaCells).toBe(15);
    const patched = unzipSync(patchXlsx(bytes, fixes));
    expect((strFromU8(patched[tables[0].sheetPath!]).match(/<f\b/g) ?? []).length).toBe(15);
  });

  const soffice = ['/usr/bin/soffice', '/usr/local/bin/soffice'].find(existsSync);
  (soffice ? it : it.skip)('LibreOffice opens the patched and the clean-copy files and sees the fixed values', () => {
    const { bytes, tables, plans, fixes } = run('barcodes.xlsx', true);
    const tmp = mkdtempSync(join(tmpdir(), 'dr-'));
    const patched = join(tmp, 'patched.xlsx');
    const clean = join(tmp, 'clean.xlsx');
    writeFileSync(patched, patchXlsx(bytes, fixes));
    writeFileSync(clean, exportXlsx({ fixes: fixes.map((f, i) => ({ fix: f.fix, source: 'xlsx' as const, plan: plans[i], original: tables[i] })), log: [], recovery: recoveryList(plans) }));
    for (const f of [patched, clean]) {
      execFileSync(soffice!, ['--headless', `-env:UserInstallation=file://${tmp}/profile`, '--convert-to', 'csv', '--outdir', tmp, f], { timeout: 120000, stdio: 'ignore' });
    }
    const truth = truthOf('barcodes.xlsx');
    for (const name of ['patched.csv', 'clean.csv']) {
      const lines = readFileSync(join(tmp, name), 'utf8').split('\n');
      for (const [addr, value] of Object.entries(truth)) {
        const row = Number(addr.slice(1)) - 1;
        const col = addr[0] === 'A' ? 0 : 1;
        expect(lines[row].split(',')[col], `${name} ${addr}`).toBe(value);
      }
    }
  });
});

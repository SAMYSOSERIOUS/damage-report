import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze, applyFixes, exportXlsx, patchXlsx, planFixes, readTables, readXlsxBytes, recoveryList, untouchedViolations, type Decisions } from '../src/core';

const dir = join(__dirname, '..', 'testbench', 'workbooks');
const files = readdirSync(dir).filter((f) => f.startsWith('adv_') && f.endsWith('.xlsx'));
const soffice = ['/usr/bin/soffice', '/usr/local/bin/soffice'].find(existsSync);

describe('odd workbooks never break the fixer', () => {
  for (const f of files) {
    it(`${f}: reads, plans, applies, patches and exports without error`, () => {
      const bytes = new Uint8Array(readFileSync(join(dir, f)));
      const tables = readTables(f, bytes);
      const rep = analyze(f, tables);
      const plans = tables.map((t, i) => planFixes(t, rep.tables[i], { geneNames: 'current' }));
      const dec: Decisions = {};
      for (const p of plans.flatMap((x) => x.proposals)) if (p.options.length) dec[p.id] = p.options[0].value;
      const fixes = tables.map((t, i) => ({ table: t, plan: plans[i], fix: applyFixes(t, plans[i], dec) }));
      const patched = patchXlsx(bytes, fixes);
      const back = readXlsxBytes(patched, f);
      back.forEach((t, i) => expect(untouchedViolations(tables[i], t, new Set(plans[i].proposals.map((p) => `${p.rowIndex}:${p.col}`)))).toEqual([]));
      const clean = exportXlsx({ fixes: fixes.map((x) => ({ fix: x.fix, source: 'xlsx' as const, plan: x.plan, original: x.table })), log: fixes.flatMap((x) => x.fix.log), recovery: recoveryList(plans) });
      expect(readXlsxBytes(clean, f).length).toBeGreaterThan(0);
      if (soffice) {
        const tmp = mkdtempSync(join(tmpdir(), 'adv-'));
        for (const [n, b] of [['p.xlsx', patched], ['c.xlsx', clean]] as const) {
          writeFileSync(join(tmp, n), b);
          execFileSync(soffice, ['--headless', `-env:UserInstallation=file://${tmp}/prof`, '--convert-to', 'csv', '--outdir', tmp, join(tmp, n)], { timeout: 120000, stdio: 'ignore' });
          expect(existsSync(join(tmp, n.replace('.xlsx', '.csv'))), `LibreOffice could not open ${n}`).toBe(true);
        }
      }
    });
  }
  it('a clean gene list yields no proposals', () => {
    const t = readTables('adv_clean_genes.xlsx', new Uint8Array(readFileSync(join(dir, 'adv_clean_genes.xlsx'))));
    expect(planFixes(t[0], analyze('x', t).tables[0]).proposals).toHaveLength(0);
  });
  it('title rows above the header do not hide the header or the damage', () => {
    const t = readTables('adv_title_rows.xlsx', new Uint8Array(readFileSync(join(dir, 'adv_title_rows.xlsx'))))[0];
    expect(t.headers.slice(0, 2)).toEqual(['Gene', 'Count']);
    const p = planFixes(t, analyze('x', [t]).tables[0]);
    expect(p.proposals.some((x) => x.address === 'A11')).toBe(true);
  });
  it('data that starts at C5 is read with its own header', () => {
    const t = readTables('adv_offset.xlsx', new Uint8Array(readFileSync(join(dir, 'adv_offset.xlsx'))))[0];
    expect(t.headers.filter(Boolean)).toEqual(['Customer ID', 'ZIP', 'State']);
  });
});

(soffice ? describe : describe.skip)('files written by LibreOffice (a different program than openpyxl)', () => {
  for (const f of ['genes_dates.xlsx', 'customers_zip.xlsx', 'barcodes.xlsx']) {
    it(`${f}: read, fix and patch a LibreOffice-saved copy`, () => {
      const tmp = mkdtempSync(join(tmpdir(), 'lo-'));
      const out = join(tmp, 'out');
      execFileSync(soffice!, ['--headless', `-env:UserInstallation=file://${tmp}/prof`, '--convert-to', 'xlsx', '--outdir', out, join(dir, f)], { timeout: 120000, stdio: 'ignore' });
      const bytes = new Uint8Array(readFileSync(join(out, f)));
      const tables = readTables(f, bytes);
      const rep = analyze(f, tables);
      const plans = tables.map((t, i) => planFixes(t, rep.tables[i]));
      expect(plans[0].proposals.length).toBeGreaterThan(3);
      const dec: Decisions = {};
      for (const p of plans.flatMap((x) => x.proposals)) if (p.box === 'proven') dec[p.id] = p.options[0].value;
      const fixes = tables.map((t, i) => ({ table: t, plan: plans[i], fix: applyFixes(t, plans[i], dec) }));
      const back = readXlsxBytes(patchXlsx(bytes, fixes), f);
      back.forEach((t, i) => expect(untouchedViolations(tables[i], t, new Set(plans[i].proposals.map((p) => `${p.rowIndex}:${p.col}`)))).toEqual([]));
      const fixed = plans[0].proposals.filter((p) => dec[p.id]);
      expect(fixed.length).toBeGreaterThan(0);
      for (const p of fixed) expect(back[0].rows[p.rowIndex][p.col].text).toBe(dec[p.id]);
    });
  }
});

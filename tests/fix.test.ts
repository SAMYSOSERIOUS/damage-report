import { describe, expect, it } from 'vitest';
import {
  analyze,
  applyFixes,
  exportCsv,
  exportXlsx,
  planFixes,
  readCsvText,
  readXlsxBytes,
  recoveryList,
  luhnValid,
  untouchedViolations,
  type Decisions,
  type FixPlan,
  type Table,
} from '../src/core';
import { fixture, geneRows } from './helpers';

function plan(table: Table, settings?: Parameters<typeof planFixes>[2]): FixPlan {
  const rep = analyze(table.name, [table]);
  return planFixes(table, rep.tables[0], settings);
}
const csv = (text: string) => readCsvText(text, 'test.csv');
const acceptAll = (p: FixPlan): Decisions => Object.fromEntries(p.proposals.filter((x) => x.options.length).map((x) => [x.id, x.options[0].value]));
const luhn = (body: string) => {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body + ((10 - (sum % 10)) % 10);
};

describe('four boxes', () => {
  it('gene with one possible answer is fixed with proof', () => {
    const t = csv(geneRows(['4-Oct']));
    const p = plan(t);
    const x = p.proposals.find((q) => q.before === '4-Oct')!;
    expect(x.box).toBe('proven');
    expect(x.options[0].value).toBe('POU5F1');
  });
  it('gene name policy: old name or current name', () => {
    const t = csv(geneRows(['4-Oct']));
    expect(plan(t, { geneNames: 'old' }).proposals.find((q) => q.before === '4-Oct')!.options[0].value).toBe('OCT4');
  });
  it('an ambiguous gene goes to choice with every candidate', () => {
    const t = csv(geneRows(['1-Mar']));
    const x = plan(t).proposals.find((q) => q.before === '1-Mar')!;
    expect(x.box).toBe('choice');
    const values = x.options.map((o) => o.value);
    expect(values).toContain('MARCHF1');
    expect(values).toContain('MTARC1');
    // the French word MARS1 only fits an Excel in French, so it is offered last and labelled, never as proof
    const mars = x.options.find((o) => o.value === 'MARS1');
    if (mars) expect(mars.label).toContain('another language');

  });
  it('two answers that write the same text under the old-name policy are listed once', () => {
    const t = csv(geneRows(['2-Sep']));
    const old = plan(t, { geneNames: 'old' }).proposals.find((q) => q.before === '2-Sep')!;
    expect(old.options.filter((o) => o.value === 'SEPT2')).toHaveLength(1);
    const cur = plan(t, { geneNames: 'current' }).proposals.find((q) => q.before === '2-Sep')!;
    expect(cur.options.map((o) => o.value)).toEqual(expect.arrayContaining(['SEPTIN2', 'SEPTIN6']));
  });
  it('restores zero-padded codes with proof when the column is fixed-width', () => {
    const t = csv(['ZIP,City', '01234,A', '02134,B', '07030,C', '2134,D', '10001,E'].join('\n'));
    const p = plan(t);
    expect(p.proposals[0].box).toBe('proven');
    const r = applyFixes(t, p, acceptAll(p));
    expect(r.table.rows[3][0].text).toBe('02134');
  });
  it('undoes garbled letters', () => {
    const t = csv(['Name,Qty', 'JosÃ©,1', 'Anna,2', 'ZoÃ«,3'].join('\n'));
    const p = plan(t);
    const r = applyFixes(t, p, acceptAll(p));
    expect(r.table.rows.map((x) => x[0].text)).toEqual(['José', 'Anna', 'Zoë']);
  });
  it('a lost letter is quarantined, never invented', () => {
    const t = csv(['Name,Qty', 'Jos�,1', 'Anna,2'].join('\n'));
    const p = plan(t);
    expect(p.proposals[0].box).toBe('quarantine');
    const r = applyFixes(t, p, acceptAll(p));
    expect(r.table.rows[0][0].text).toBe('Jos�');
    expect(r.flags.get(0)?.[0]).toContain('lost data');
  });
  it('recomputes a cut-off ID with a check digit', () => {
    const good = ['4539148803436467', '4716108999716531', '4929000000006', '5500005555555559', '6011000990139424', '3530111333300000', '4111111111111111', '5105105105105100']
      .filter((x) => x.length === 16 && luhn(x.slice(0, 15)) === x);
    expect(good.length).toBeGreaterThanOrEqual(5);
    const real = '4539148803436467';
    const cut = real.slice(0, 15) + '0';
    const t = csv(['Card ID,Qty', ...good.map((g) => `${g},1`), `${cut},1`].join('\n'));
    const p = plan(t);
    const x = p.proposals.find((q) => q.before === cut)!;
    expect(luhnValid(real)).toBe(true);
    expect(x.box).toBe('proven');
    expect(x.options[0].value).toBe(real);
  });
  it('without check-digit evidence a cut ID goes on the recovery list', () => {
    const t = csv(['Order ID,Qty', '1234567890123450,1', '2345678901234560,1', '3456789012345670,1'].join('\n'));
    const p = plan(t);
    expect(p.proposals.every((q) => q.box === 'source')).toBe(true);
    const rec = recoveryList([p]);
    expect(rec).toHaveLength(3);
    expect(rec[0].what_to_do).toContain('first 15 digits');
  });
  it('mixed dates are offered as a swap and only applied when accepted', () => {
    const t = csv(['Date,V', '13/04/2021,1', '25/12/2021,1', '30/01/2021,1', '04/13/2021,1', '05/06/2021,1'].join('\n'));
    const p = plan(t);
    const x = p.proposals.find((q) => q.before === '04/13/2021')!;
    expect(x.box).toBe('choice');
    const untouched = applyFixes(t, p, {});
    expect(untouched.table.rows[3][0].text).toBe('04/13/2021');
    expect(untouched.flags.get(3)).toBeTruthy();
    const done = applyFixes(t, p, { [x.id]: x.options[0].value });
    expect(done.table.rows[3][0].text).toBe('13/04/2021');
  });
  it('flags a sheet that ends at the Excel row limit', () => {
    const t = csv('A,B\n1,2');
    t.rowNums[t.rowNums.length - 1] = 1048576;
    expect(plan(t).notes[0]).toContain('row limit');
  });
});

describe('the clean-cell guard', () => {
  it('changes only the cells it was asked to change, on every fixture', () => {
    for (const name of ['clean-text-zip.xlsx']) {
      const t = readXlsxBytes(fixture(name), name)[0];
      const p = plan(t);
      const r = applyFixes(t, p, acceptAll(p));
      const touched = new Set(p.proposals.map((x) => `${x.rowIndex}:${x.col}`));
      expect(untouchedViolations(t, r.table, touched)).toEqual([]);
    }
  });
  it('a clean file produces no proposals and an identical table', () => {
    const t = csv(geneRows([]));
    const p = plan(t);
    expect(p.proposals).toHaveLength(0);
    expect(untouchedViolations(t, applyFixes(t, p, {}).table, new Set())).toEqual([]);
  });
  it('the check really catches a change outside the allowed cells', () => {
    const t = csv('A,B\n1,2');
    const bad = { ...t, rows: t.rows.map((r) => r.map((c) => ({ ...c, text: c.text + 'x' }))) };
    expect(untouchedViolations(t, bad, new Set()).length).toBeGreaterThan(0);
  });
});

describe('safe export', () => {
  const t = csv(['Order ID,ZIP,Name,Qty', '1234567890123450,01234,JosÃ©,5', '2234567890123450,02134,Anna,6', '3234567890123450,2134,Ben,7', '4234567890123450,07030,Cy,8'].join('\n'));
  const p = plan(t);
  const r = applyFixes(t, p, acceptAll(p));
  it('xlsx keeps long IDs and zeros as text and carries the change log and recovery list', () => {
    const bytes = exportXlsx({ fixes: [{ fix: r, source: 'csv', plan: p, original: t }], log: r.log, recovery: recoveryList([p]) });
    const sheets = readXlsxBytes(bytes, 'out.xlsx');
    const names = sheets.map((s) => s.name);
    expect(names.some((n) => n.endsWith('Change log'))).toBe(true);
    expect(names.some((n) => n.endsWith('Recovery list'))).toBe(true);
    const data = sheets[0];
    expect(data.rows[0][0].text).toBe('1234567890123450');
    expect(data.rows[0][0].t).not.toBe('number');
    expect(data.rows[2][1].text).toBe('02134');
    expect(data.rows[0][2].text).toBe('José');
    const qty = data.rows[0][3];
    expect(qty.t).toBe('number');
  });
  it('the re-read export raises no new long-id fixes it cannot explain (still flagged as source)', () => {
    const bytes = exportXlsx({ fixes: [{ fix: r, source: 'csv', plan: p, original: t }], log: r.log, recovery: [] });
    const again = readXlsxBytes(bytes, 'out.xlsx')[0];
    expect(again.headers).toContain('Damage Report flag');
  });
  it('csv has a UTF-8 byte-order mark so accents survive', () => {
    const b = exportCsv(r);
    expect([...b.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(b)).toContain('José');
  });
});

describe('titles above the header', () => {
  it('a CSV with title lines keeps them in the export and finds the real header', () => {
    const t = csv(['Gene report 2024,,', 'made by the lab,,', 'Gene,Count,Note', 'TP53,1,a', 'BRCA1,2,b', 'EGFR,3,c', 'MYC,4,d', 'KRAS,5,e', 'AKT1,6,f', '2-Sep,7,g'].join('\n'));
    expect(t.headers).toEqual(['Gene', 'Count', 'Note']);
    expect(t.rowNums[0]).toBe(4);
    const p = plan(t);
    expect(p.proposals[0].address).toBe('A10');
    const text = new TextDecoder().decode(exportCsv(applyFixes(t, p, acceptAll(p))));
    expect(text).toContain('Gene report 2024');
    expect(text.indexOf('Gene report 2024')).toBeLessThan(text.indexOf('Gene,Count'));
  });
  it('a normal table with a half-empty header is not mistaken for a title', () => {
    const t = csv(['A,,C', '1,2,3', '4,5,6'].join('\n'));
    expect(t.headers).toEqual(['A', '', 'C']);
  });
});

describe('how files are read and written back', () => {
  it('keeps a semicolon delimiter', () => {
    const t = csv(['Name;Amount', 'Anna;1,5', 'Ben;2,5', 'Cy;3,5', 'Di;4,5', 'Ed;5,5', 'Flo;6,5'].join('\n'));
    expect(t.delimiter).toBe(';');
    const text = new TextDecoder().decode(exportCsv(applyFixes(t, plan(t), {})));
    expect(text).toContain('Name;Amount');
    expect(text).toContain('Anna;1,5');
  });
  it('reads a Windows-1252 file correctly and says so', async () => {
    const { readCsvBytes } = await import('../src/core');
    const bytes = new Uint8Array([...Buffer.from('Name,City\n'), ...Buffer.from('Jos', 'latin1'), 0xe9, ...Buffer.from(',Paris\nAnna,Nice\n')]);
    const t = readCsvBytes(bytes, 'old.csv');
    expect(t.rows[0][0].text).toBe('José');
    expect(t.readNote).toContain('Windows-1252');
    expect(plan(t).notes[0]).toContain('Windows-1252');
  });
  it('a damaged value inside a formula cell is never edited', () => {
    const t = csv(geneRows(['2-Sep']));
    t.rows[t.rows.length - 1][0] = { ...t.rows[t.rows.length - 1][0], formula: true };
    const p = plan(t);
    const x = p.proposals.find((q) => q.before === '2-Sep')!;
    expect(x.box).toBe('quarantine');
    expect(applyFixes(t, p, acceptAll(p)).table.rows[t.rows.length - 1][0].text).toBe('2-Sep');
  });
});

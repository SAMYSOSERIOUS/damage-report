import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyze, readCsvText, readTables, type Finding, type Report } from '../src/core';

const here = dirname(fileURLToPath(import.meta.url));
export const fixture = (name: string) => new Uint8Array(readFileSync(join(here, '..', 'testbench', 'fixtures', name)));

export function scanCsv(text: string): Report {
  return analyze('test.csv', [readCsvText(text, 'test.csv')]);
}
export function scanFile(name: string): Report {
  return analyze(name, readTables(name, fixture(name)));
}
export const all = (r: Report): Finding[] => r.tables.flatMap((t) => t.findings);
export const by = (r: Report, detector: string): Finding[] => all(r).filter((f) => f.detector === detector);
export const geneRows = (extra: string[]) =>
  ['Gene,Count', 'TP53,1', 'BRCA1,2', 'EGFR,3', 'MYC,4', 'KRAS,5', 'AKT1,6', ...extra.map((g) => `${g},9`)].join('\n');

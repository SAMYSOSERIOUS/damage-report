/** Command line: npm run scan -- file1.xlsx file2.csv [--json] */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { analyze, readTables, DETECTOR_NAMES } from '../src/core';

const args = process.argv.slice(2);
const json = args.includes('--json');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('Usage: npm run scan -- <file.csv|file.xlsx> [more files] [--json]');
  process.exit(2);
}
let exit = 0;
const all = [];
for (const f of files) {
  try {
    const rep = analyze(basename(f), readTables(basename(f), new Uint8Array(readFileSync(f))));
    all.push(rep);
    if (rep.totals.flaggedHigh > 0) exit = 1;
    if (!json) {
      console.log(`\n${f}: ${rep.totals.cells} cells, ${rep.totals.flaggedHigh} very likely damaged, ${rep.totals.flaggedAny} flagged in all`);
      for (const t of rep.tables) for (const x of t.findings.filter((y) => y.confidence !== 'info')) console.log(`  [${x.confidence}] ${t.name}!${x.address} "${x.stored}"  ${DETECTOR_NAMES[x.detector]}${x.likely ? ' -> ' + x.likely : ''}`);
    }
  } catch (e) {
    console.error(`${f}: ${e instanceof Error ? e.message : e}`);
    exit = 2;
  }
}
if (json) console.log(JSON.stringify(all, null, 2));
process.exit(exit);

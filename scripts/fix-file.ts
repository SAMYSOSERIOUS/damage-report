/** Command line: apply the fixes to a file the same way the page does. 
 *  npx tsx scripts/fix-file.ts in.xlsx out.xlsx [--old-names] [--accept-choices-first]  */
import { readFileSync, writeFileSync } from 'node:fs';
import { analyze, applyFixes, exportXlsx, planFixes, readTables, recoveryList, type Decisions } from '../src/core';

const [inp, outp, ...flags] = process.argv.slice(2);
const bytes = new Uint8Array(readFileSync(inp));
const tables = readTables(inp, bytes);
const rep = analyze(inp, tables);
const geneNames = flags.includes('--old-names') ? 'old' : 'current';
const plans = tables.map((t, i) => planFixes(t, rep.tables[i], { geneNames }));
const dec: Decisions = {};
for (const p of plans.flatMap((x) => x.proposals)) {
  if (p.box === 'proven') dec[p.id] = p.options[0].value;
  else if (p.box === 'choice' && flags.includes('--accept-choices-first')) dec[p.id] = p.options[0].value;
}
const fixes = tables.map((t, i) => ({ fix: applyFixes(t, plans[i], dec), source: t.source, plan: plans[i], original: t }));
writeFileSync(outp, exportXlsx({ fixes, log: fixes.flatMap((f) => f.fix.log), recovery: recoveryList(plans) }));
const counts = plans.map((p) => `${p.sheet}: ${JSON.stringify(p.counts)}`);
console.log(counts.join('\n'));

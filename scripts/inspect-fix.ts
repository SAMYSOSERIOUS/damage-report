/** For each testbench/workbooks/*.xlsx with a .truth.json: what did the fixer propose, and is it right? */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { analyze, planFixes, readTables } from '../src/core';

const dir = 'testbench/workbooks';
for (const f of readdirSync(dir).filter((x) => x.endsWith('.xlsx') && x !== 'big.xlsx')) {
  const tp = `${dir}/${f}.truth.json`;
  if (!existsSync(tp)) continue;
  const truth: Record<string, string> = JSON.parse(readFileSync(tp, 'utf8'));
  const tables = readTables(f, new Uint8Array(readFileSync(`${dir}/${f}`)));
  const rep = analyze(f, tables);
  console.log(`\n== ${f}  (${Object.keys(truth).length} damaged cells in truth)`);
  const seen = new Set<string>();
  tables.forEach((t, i) => {
    const plan = planFixes(t, rep.tables[i], { geneNames: 'old' });
    for (const p of plan.proposals) {
      seen.add(p.address);
      const tr = truth[p.address];
      const vals = p.options.map((o) => o.value);
      const verdict = tr === undefined ? 'FALSE ALARM' : p.box === 'proven' ? (vals[0] === tr ? 'ok' : 'WRONG PROVEN') : vals.some((v) => tr.split('|').includes(v)) ? 'ok(choice has truth)' : p.box === 'source' || p.box === 'quarantine' ? 'ok(not fixable)' : 'TRUTH NOT OFFERED';
      if (verdict !== 'ok' || process.argv.includes('-v')) console.log(`  ${p.address} [${p.box}] ${p.detector} "${p.before}" -> ${vals.slice(0, 3).join(' | ') || '-'}  truth=${tr ?? '-'}  ${verdict}`);
    }
  });
  const missed = Object.keys(truth).filter((a) => /^[A-Z]+\d+$/.test(a) && !seen.has(a));
  console.log(`  missed (no proposal): ${missed.length} ${missed.slice(0, 12).join(' ')}`);
}

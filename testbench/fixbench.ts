/**
 * Fix bench. Same synthetic damage as the main bench (an imitation of Excel, not real Excel).
 * Question: after the fixes, are there fewer wrong cells than before, and did we ever break a cell that was fine?
 * Pass bars were fixed before the first run:
 *   - clean cells broken by any fix: exactly 0
 *   - wrong "proven" fixes: at most 1 in 200
 *   - wrong cells after / wrong cells before (error drop): at most 0.6 when a person also answers the choices
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { analyze, applyFixes, planFixes, readCsvText, type Decisions } from '../src/core';
import { makeClean, toCsv, type Kind } from './corpus';
import { damage } from './damage';
import { makeRng } from './rng';

const KINDS: Kind[] = ['genes', 'customers', 'lab', 'survey'];

function run(seed: number, n: number) {
  const rng = makeRng(seed);
  let wrongBefore = 0, wrongAutoAfter = 0, wrongWithPersonAfter = 0;
  let cleanBroken = 0, provenApplied = 0, provenWrong = 0, choiceOffered = 0, choiceHadTruth = 0;
  const boxes = { proven: 0, choice: 0, source: 0, quarantine: 0 };
  const examples: string[] = [];
  let choiceGroups = 0;
  for (let i = 0; i < n; i++) {
    const clean = makeClean(rng, KINDS[i % KINDS.length]);
    const d = damage(clean, rng);
    const table = readCsvText(toCsv(d.headers, d.rows), 'd.csv');
    const plan = planFixes(table, analyze('d.csv', [table]).tables[0], { geneNames: 'old' });
    choiceGroups += new Set(plan.proposals.filter((p) => p.box === 'choice').map((p) => (p.options.length === 1 ? p.group : p.group + '|' + p.before))).size;
    const auto: Decisions = {};
    const person: Decisions = {};
    for (const p of plan.proposals) {
      boxes[p.box]++;
      const truth = clean.rows[p.rowIndex][p.col];
      if (p.box === 'proven') {
        auto[p.id] = person[p.id] = p.options[0].value;
        provenApplied++;
        if (p.options[0].value !== truth) {
          provenWrong++;
          if (examples.length < 8) examples.push(`proven wrong ${p.detector} ${p.address} "${p.before}" -> "${p.options[0].value}" (truth "${truth}")`);
        }
      } else if (p.box === 'choice') {
        choiceOffered++;
        const right = p.options.find((o) => o.value === truth);
        if (right) {
          choiceHadTruth++;
          person[p.id] = right.value; // a person who knows the answer picks it
        }
      }
    }
    const a = applyFixes(table, plan, auto).table;
    const b = applyFixes(table, plan, person).table;
    for (let r = 0; r < clean.rows.length; r++) {
      for (let c = 0; c < clean.headers.length; c++) {
        const t = clean.rows[r][c];
        const was = d.rows[r][c];
        if (was !== t) wrongBefore++;
        if (a.rows[r][c].text !== t) wrongAutoAfter++;
        if (b.rows[r][c].text !== t) wrongWithPersonAfter++;
        if (was === t && (a.rows[r][c].text !== t || b.rows[r][c].text !== t)) {
          cleanBroken++;
          if (examples.length < 8) examples.push(`CLEAN CELL BROKEN r${r} c${c} "${t}" -> "${a.rows[r][c].text}"`);
        }
      }
    }
  }
  return { seed, tables: n, choiceGroups, wrongBefore, wrongAutoAfter, wrongWithPersonAfter, cleanBroken, provenApplied, provenWrong, choiceOffered, choiceHadTruth, boxes, examples };
}

let failed = false;
const saved: unknown[] = [];
for (const [seed, n] of [[1, 400], [20240611, 400]] as const) {
  const r = run(seed, n);
  const dropAuto = r.wrongAutoAfter / r.wrongBefore;
  const dropPerson = r.wrongWithPersonAfter / r.wrongBefore;
  const provenRate = r.provenApplied ? r.provenWrong / r.provenApplied : 0;
  const pass = r.cleanBroken === 0 && provenRate <= 1 / 200 && dropPerson <= 0.6;
  if (!pass) failed = true;
  console.log(`seed ${seed}: ${r.tables} damaged tables`);
  console.log(`  wrong cells before: ${r.wrongBefore}`);
  console.log(`  after automatic proven fixes only: ${r.wrongAutoAfter} (${(dropAuto * 100).toFixed(1)}% of before remain)`);
  console.log(`  after proven fixes + a person answering choices: ${r.wrongWithPersonAfter} (${(dropPerson * 100).toFixed(1)}% remain)`);
  console.log(`  clean cells broken: ${r.cleanBroken}   wrong proven fixes: ${r.provenWrong} of ${r.provenApplied}`);
  console.log(`  choices offered: ${r.choiceOffered}, true answer among the options: ${r.choiceHadTruth}`);
  console.log(`  boxes: ${JSON.stringify(r.boxes)}`);
  r.examples.forEach((e) => console.log('   ', e));
  console.log(`  decisions to settle all choices, with identical cells batched: ${r.choiceGroups} (instead of ${r.choiceOffered})`);
  console.log(pass ? '  PASS' : '  FAIL');
  saved.push({ ...r, dropAuto, dropPerson, provenRate, pass, examples: undefined });
}
const out = {
  note: 'Synthetic damage that imitates Excel; not real Excel. Bars were fixed before the first run.',
  bars: { cleanCellsBroken: 0, wrongProvenRateAtMost: 1 / 200, errorsRemainingWithPersonAtMost: 0.6 },
  runs: saved,
};
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/fixbench.json', JSON.stringify(out, null, 2));
writeFileSync('docs/fixbench.json', JSON.stringify(out, null, 2));
process.exit(failed ? 1 : 0);

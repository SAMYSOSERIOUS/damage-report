/**
 * Study harness: scan a folder of CSV/xlsx files and write one row per file plus a summary.
 *   npm run study -- <folder> [--out study-output]
 *   npm run study -- --fetch "gene expression" --limit 50 <folder>   (downloads public Zenodo files first)
 * The --fetch part is NOT tested against the live Zenodo service. The scanning part is tested.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { analyze, readTables, DETECTOR_IDS, DETECTOR_NAMES } from '../src/core';

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const flagValues = new Set(['--out', '--fetch', '--limit'].map((f) => opt(f)).filter(Boolean));
const folder = argv.find((a) => !a.startsWith('--') && !flagValues.has(a));
const outDir = opt('--out') ?? 'study-output';
if (!folder) { console.error('Usage: npm run study -- <folder> [--out dir] [--fetch "query" --limit N]'); process.exit(2); }

async function fetchZenodo(query: string, limit: number, dir: string) {
  mkdirSync(dir, { recursive: true });
  const url = `https://zenodo.org/api/records?q=${encodeURIComponent(query)}&size=${Math.min(limit, 100)}&type=dataset`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Zenodo search failed: HTTP ${res.status}`);
  const data = (await res.json()) as { hits: { hits: { id: number; files?: { key: string; links: { self: string }; size: number }[] }[] } };
  let n = 0;
  for (const rec of data.hits.hits) {
    for (const f of rec.files ?? []) {
      if (!/\.(csv|xlsx)$/i.test(f.key) || f.size > 20e6 || n >= limit) continue;
      const r = await fetch(f.links.self);
      if (!r.ok) continue;
      writeFileSync(join(dir, `${rec.id}_${f.key.replace(/[^\w.-]/g, '_')}`), Buffer.from(await r.arrayBuffer()));
      n++;
    }
  }
  console.log(`downloaded ${n} files`);
}

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
async function main() {
  const fetchQ = opt('--fetch');
  if (fetchQ) await fetchZenodo(fetchQ, Number(opt('--limit') ?? 50), folder!);
  const files = readdirSync(folder!).filter((f) => ['.csv', '.tsv', '.xlsx', '.xlsm'].includes(extname(f).toLowerCase()) && statSync(join(folder!, f)).isFile());
  mkdirSync(outDir, { recursive: true });
  const rows = ['file,status,cells,very_likely,probably,worth_a_look,' + DETECTOR_IDS.join(',')];
  let readable = 0, unreadable = 0, withHigh = 0, withAny = 0;
  const perDet: Record<string, number> = Object.fromEntries(DETECTOR_IDS.map((d) => [d, 0]));
  for (const f of files) {
    try {
      const rep = analyze(f, readTables(f, new Uint8Array(readFileSync(join(folder!, f)))));
      readable++;
      const med = rep.tables.reduce((n, t) => n + t.flaggedCells.medium, 0);
      const low = rep.tables.reduce((n, t) => n + t.flaggedCells.low, 0);
      if (rep.totals.flaggedHigh) withHigh++;
      if (rep.totals.flaggedHigh || med) withAny++;
      const by = Object.fromEntries(DETECTOR_IDS.map((d) => [d, rep.tables.reduce((n, t) => n + t.findings.filter((x) => x.detector === d && x.confidence === 'high').length, 0)]));
      for (const d of DETECTOR_IDS) if (by[d]) perDet[d]++;
      rows.push([q(f), 'ok', rep.totals.cells, rep.totals.flaggedHigh, med, low, ...DETECTOR_IDS.map((d) => by[d])].join(','));
    } catch (e) {
      unreadable++;
      rows.push([q(f), q('unreadable: ' + (e instanceof Error ? e.message : e)), '', '', '', '', ...DETECTOR_IDS.map(() => '')].join(','));
    }
  }
  writeFileSync(join(outDir, 'files.csv'), rows.join('\n'));
  const pct = (n: number) => (readable ? ((100 * n) / readable).toFixed(1) + '%' : 'n/a');
  const md = `# Damage Report study summary

- Files found: ${files.length}
- Readable: ${readable}
- Could not be read: ${unreadable} (not counted as clean)
- Files with at least one VERY LIKELY damaged cell: ${withHigh} (${pct(withHigh)} of readable)
- Files with a very likely or probable finding: ${withAny} (${pct(withAny)})

Files with a very-likely finding, by kind of damage:

${DETECTOR_IDS.map((d) => `- ${DETECTOR_NAMES[d]}: ${perDet[d]}`).join('\n')}

Notes: made-up-damage tests show the tool catches what it was built for, but a finding is a lead, not proof. Check a sample by hand before publishing any number.
`;
  writeFileSync(join(outDir, 'summary.md'), md);
  console.log(md);
}
main().catch((e) => { console.error(e); process.exit(1); });

/** False-alarm check on real public tables (R datasets via the pydataset package). None of them has Excel damage that we know of. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { analyze, readCsvText } from '../src/core';

export interface RealResult {
  files: number;
  filesWithHighOrMedium: number;
  flags: { file: string; detector: string; confidence: string; address: string; stored: string; col: string }[];
  lowOnlyFiles: number;
}
export function runReal(dir = 'testbench/real'): RealResult {
  if (!existsSync(dir)) return { files: 0, filesWithHighOrMedium: 0, flags: [], lowOnlyFiles: 0 };
  const files = readdirSync(dir).filter((f) => f.endsWith('.csv'));
  const res: RealResult = { files: files.length, filesWithHighOrMedium: 0, flags: [], lowOnlyFiles: 0 };
  for (const f of files) {
    const text = readFileSync(`${dir}/${f}`, 'utf8');
    const rep = analyze(f, [readCsvText(text, f)]);
    const fs = rep.tables[0].findings;
    const hm = fs.filter((x) => x.confidence === 'high' || x.confidence === 'medium');
    if (hm.length) res.filesWithHighOrMedium++;
    else if (fs.some((x) => x.confidence === 'low')) res.lowOnlyFiles++;
    for (const x of hm) res.flags.push({ file: f, detector: x.detector, confidence: x.confidence, address: x.address, stored: x.stored, col: x.colName });
  }
  return res;
}
if (process.argv[1]?.endsWith('real.ts')) {
  const r = runReal();
  console.log(r.files, 'files;', r.filesWithHighOrMedium, 'with high/medium flags;', r.lowOnlyFiles, 'low only');
  for (const x of r.flags.slice(0, 60)) console.log(x.confidence, x.detector, x.file, x.address, JSON.stringify(x.stored), x.col);
  console.log('total flags', r.flags.length);
}

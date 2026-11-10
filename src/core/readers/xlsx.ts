import { unzipSync, strFromU8 } from 'fflate';
import { builtinDateFormat, colIndex, fmtInfo, formatDate } from '../excel';
import type { Cell, Table } from '../types';
import { headerIndex } from './csv';

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : undefined;
}

function textOf(inner: string): string {
  const cleaned = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  const parts: string[] = [];
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) parts.push(m[1] ?? '');
  return decodeXml(parts.join(''));
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(textOf(m[1] ?? ''));
  return out;
}

/** Returns, for each cell-format index (the s="..." attribute), the number-format code if it is a date. */
function parseDateStyles(xml: string | undefined): Map<number, string> {
  const result = new Map<number, string>();
  if (!xml) return result;
  const custom = new Map<number, string>();
  const nf = /<numFmt\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = nf.exec(xml))) {
    const id = attr(m[0], 'numFmtId');
    const code = attr(m[0], 'formatCode');
    if (id !== undefined && code !== undefined) custom.set(Number(id), code);
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cellXfs) return result;
  const xf = /<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g;
  let idx = 0;
  while ((m = xf.exec(cellXfs[1]))) {
    const id = Number(attr(m[0], 'numFmtId') ?? '0');
    const code = custom.get(id) ?? builtinDateFormat(id);
    if (code && fmtInfo(code).isDate) result.set(idx, code);
    idx++;
  }
  return result;
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (base + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

/** Read every worksheet of an .xlsx file. Dates are recognised from the cell's number format. */
export function readXlsxBytes(bytes: Uint8Array, fileName = 'file.xlsx'): Table[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('This does not look like a valid .xlsx file (it could not be unzipped).');
  }
  const get = (p: string): string | undefined => (files[p] ? strFromU8(files[p]) : undefined);
  const workbook = get('xl/workbook.xml');
  if (!workbook) throw new Error('This .xlsx file has no workbook.xml, so it cannot be read.');
  const rels = get('xl/_rels/workbook.xml.rels') ?? '';
  const relTarget = new Map<string, string>();
  const relRe = /<Relationship\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(rels))) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) relTarget.set(id, resolvePath('xl/', target));
  }
  const date1904 = /<workbookPr\b[^>]*date1904="(?:1|true)"/.test(workbook);
  const shared = parseSharedStrings(get('xl/sharedStrings.xml'));
  const dateStyles = parseDateStyles(get('xl/styles.xml'));

  const tables: Table[] = [];
  const sheetRe = /<sheet\b[^>]*\/?>/g;
  while ((m = sheetRe.exec(workbook))) {
    const name = attr(m[0], 'name') ?? 'Sheet';
    const rid = attr(m[0], 'r:id');
    const path = rid ? relTarget.get(rid) : undefined;
    const xml = path ? get(path) : undefined;
    if (!xml) continue;
    tables.push({ ...readSheet(xml, `${fileName} / ${name}`, shared, dateStyles, date1904), sheetPath: path });
  }
  return tables;
}

function readSheet(
  xml: string,
  name: string,
  shared: string[],
  dateStyles: Map<number, string>,
  date1904: boolean,
): Table {
  const grid = new Map<number, Map<number, Cell>>();
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm: RegExpExecArray | null;
  let autoRow = 0;
  let maxCol = -1;
  let formulaCells = 0;
  while ((rm = rowRe.exec(xml))) {
    autoRow++;
    const rowNum = Number(attr(rm[1], 'r') ?? autoRow);
    const body = rm[2] ?? '';
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let autoCol = -1;
    while ((cm = cellRe.exec(body))) {
      const ref = attr(cm[1], 'r');
      let col = ++autoCol;
      if (ref) {
        const letters = /^[A-Za-z]+/.exec(ref);
        if (letters) col = colIndex(letters[0]);
      }
      autoCol = col;
      const t = attr(cm[1], 't');
      const style = Number(attr(cm[1], 's') ?? '0');
      const inner = cm[2] ?? '';
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
      const raw = v ? decodeXml(v[1]) : '';
      if (/<f\b/.test(inner)) formulaCells++;
      let cell: Cell;
      if (t === 's') {
        const s = shared[Number(raw)] ?? '';
        cell = s === '' ? { t: 'empty', text: '' } : { t: 'text', text: s };
      } else if (t === 'inlineStr') {
        const s = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '');
        cell = s === '' ? { t: 'empty', text: '' } : { t: 'text', text: s };
      } else if (t === 'str') {
        cell = raw === '' ? { t: 'empty', text: '' } : { t: 'text', text: raw };
      } else if (t === 'b') {
        cell = { t: 'bool', text: raw === '1' ? 'TRUE' : 'FALSE' };
      } else if (t === 'e') {
        cell = { t: 'error', text: raw };
      } else if (raw === '') {
        cell = { t: 'empty', text: '' };
      } else {
        const num = Number(raw);
        const fmt = dateStyles.get(style);
        if (fmt && Number.isFinite(num)) {
          cell = { t: 'date', text: formatDate(num, fmt, date1904), num, fmt };
        } else {
          cell = { t: 'number', text: raw, num };
        }
      }
      if (/<f\b/.test(inner)) cell = { ...cell, formula: true };
      if (!grid.has(rowNum)) grid.set(rowNum, new Map());
      grid.get(rowNum)!.set(col, cell);
      if (col > maxCol) maxCol = col;
    }
  }
  const rowNums = [...grid.keys()]
    .filter((r) => [...grid.get(r)!.values()].some((c) => c.t !== 'empty'))
    .sort((a, b) => a - b);
  if (rowNums.length === 0 || maxCol < 0) {
    return { name, source: 'xlsx', headers: [], rows: [], rowNums: [], date1904, formulaCells };
  }
  const width = maxCol + 1;
  const filled = rowNums.slice(0, 25).map((r) => [...grid.get(r)!.values()].filter((c) => c.t !== 'empty').length);
  const h = headerIndex(filled);
  const headerRow = grid.get(rowNums[h])!;
  const headers = Array.from({ length: width }, (_, c) => (headerRow.get(c)?.text ?? '').trim());
  const rows: Cell[][] = [];
  const outNums: number[] = [];
  for (const r of rowNums.slice(h + 1)) {
    const g = grid.get(r)!;
    rows.push(Array.from({ length: width }, (_, c) => g.get(c) ?? { t: 'empty' as const, text: '' }));
    outNums.push(r);
  }
  return { name, source: 'xlsx', headers, rows, rowNums: outNums, date1904, formulaCells };
}

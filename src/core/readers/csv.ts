import Papa from 'papaparse';
import type { Cell, Table } from '../types';

export function textToCell(s: string): Cell {
  return s === '' ? { t: 'empty', text: '' } : { t: 'text', text: s };
}

/**
 * Which of the first rows is the header? Titles and notes above a table have at most one filled cell. Skip those,
 * but only if a real row with two or more filled cells follows. `counts` = filled cells per row, top to bottom.
 */
export function headerIndex(counts: number[]): number {
  let i = 0;
  while (i < counts.length - 1 && counts[i] <= 1 && counts.slice(i + 1).some((c) => c >= 2)) i++;
  return counts[i] >= 2 || i === 0 ? i : 0;
}

/** Parse CSV or TSV text into a Table. The first non-empty record is the header. */
export function readCsvText(text: string, name = 'file.csv'): Table {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  const delimiter = parsed.meta?.delimiter && parsed.meta.delimiter.length === 1 ? parsed.meta.delimiter : ',';
  const records = parsed.data as string[][];
  if (records.length === 0) {
    return { name, source: 'csv', headers: [], rows: [], rowNums: [] };
  }
  const width = records.reduce((w, r) => Math.max(w, r.length), 0);
  const h = headerIndex(records.slice(0, 25).map((r) => r.filter((c) => c.trim() !== '').length));
  const headers = Array.from({ length: width }, (_, i) => (records[h][i] ?? '').trim());
  const rows: Cell[][] = [];
  const rowNums: number[] = [];
  for (let i = h + 1; i < records.length; i++) {
    const rec = records[i];
    rows.push(Array.from({ length: width }, (_, c) => textToCell(rec[c] ?? '')));
    rowNums.push(i + 1);
  }
  return { name, source: 'csv', headers, rows, rowNums, delimiter, preamble: h > 0 ? records.slice(0, h) : undefined };
}

export function readCsvBytes(bytes: Uint8Array, name = 'file.csv'): Table {
  try {
    return readCsvText(new TextDecoder('utf-8', { fatal: true }).decode(bytes), name);
  } catch {
    // Not valid UTF-8. Old Excel and Windows tools save CSV as Windows-1252, where an accent is one byte.
    const t = readCsvText(new TextDecoder('windows-1252').decode(bytes), name);
    t.readNote = 'This file is not UTF-8. It was read as Windows-1252 (the Windows default), and any export is saved as UTF-8 so the accents stay correct.';
    return t;
  }
}

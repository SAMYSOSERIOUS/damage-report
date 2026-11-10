import { fmtInfo, serialToYMD } from '../excel';
import { geneCandidates, geneOptions, type GeneOption } from '../genes';
import { parseMonthText, parseNumericDate } from '../profile';
import type { Table } from '../types';
import { fold } from '../months';
import months from '../../../data/months.json';
import type { Detector } from './common';
import { finding } from './common';

/** SEPT2 -> 2-Sep, MARCH1 -> 1-Mar. In a column of gene names, a date is almost always a gene name Excel changed. */
export const geneDate: Detector = {
  id: 'gene-date',
  run(ctx) {
    if (!ctx.profile.geneish) return [];
    const out = [];
    const { table, col } = ctx;
    for (let i = 0; i < table.rows.length; i++) {
      const c = table.rows[i][col];
      let months: number[] = [];
      let numbers: number[] = [];
      const found = new Set<string>();
      const shown = c.text;
      if (c.t === 'date' && c.num !== undefined) {
        const info = fmtInfo(c.fmt ?? '');
        const ymd = serialToYMD(c.num, table.date1904);
        months = [ymd.m];
        numbers = info.hasYear && !info.hasDay ? [ymd.y % 100] : [ymd.d, ymd.y % 100];
      } else if (c.t === 'text') {
        const parsed = parseMonthText(c.text);
        const numeric = parsed ? null : parseNumericDate(c.text);
        if (!parsed && !numeric) continue;
        if (parsed) {
          months = parsed.months;
          numbers = [parsed.n];
        }
        if (numeric) {
          // A full numeric date such as 09/02/2020 (some programs export the damage this way). Try every reading.
          for (const r of numeric) {
            for (const g of geneCandidates([r.m], r.d)) found.add(g);
            for (const g of geneCandidates([r.m], r.y % 100)) found.add(g);
          }
        }
      } else {
        continue;
      }
      for (const n of numbers) for (const g of geneCandidates(months, n)) found.add(g);
      const candidates = [...found];
      if (candidates.length > 0) {
        out.push(
          finding(
            ctx,
            i,
            'gene-date',
            'high',
            `"${shown}" looks like a date, but the rest of this column holds gene names. Excel turns names such as SEPT2 or MARCH1 into dates.`,
            candidates.slice(0, 4).join(' or '),
          ),
        );
      } else {
        out.push(
          finding(
            ctx,
            i,
            'gene-date',
            'medium',
            `"${shown}" looks like a date in a column of gene names. No known gene symbol matches it exactly, so check the source.`,
          ),
        );
      }
    }
    return out;
  },
};

/**
 * Which genes could have become this cell? Used by the fix step.
 * Unlike the detector, this uses the stored date format when there is one: a cell shown as "d-mmm" holds a day,
 * a cell shown as "mmm-yy" holds a year, so only one reading is possible. Returns null if the cell is not date-like.
 */
const ENGLISH_WORDS = new Set<string>();
for (const name of months.languages.en as string[]) for (let k = 3; k <= name.length; k++) ENGLISH_WORDS.add(name.slice(0, k));
const wordOf = (symbol: string) => fold(symbol.replace(/\d+$/, ''));

/**
 * A gene whose month word is French ("MARS1") only turns into a date on a French Excel, where it shows as "1-mars".
 * A cell showing the English "1-Mar" can only come from a word English Excel reads as March (MAR, MARC, MARCH).
 * If the cell shows another language's word, only genes with exactly that word fit. Falls back to everything
 * when the filter would leave nothing.
 */
function plausible(list: GeneOption[], token: string | null): GeneOption[] {
  const t = token ? fold(token).replace(/\.$/, '') : null;
  const english = t === null || ENGLISH_WORDS.has(t);
  const keep = list.filter((o) => {
    const w = wordOf(o.old);
    return (t !== null && w === t) || (english && ENGLISH_WORDS.has(w));
  });
  return keep.length ? keep : list;
}

export interface CellGenes {
  /** Genes that fit the month word the cell shows. */
  likely: GeneOption[];
  /** Genes that only fit if the damage happened on an Excel in another language. */
  others: GeneOption[];
}

export function geneOptionsForCell(table: Table, row: number, col: number): CellGenes | null {
  const found = rawOptionsForCell(table, row, col);
  if (found === null) return null;
  const c = table.rows[row][col];
  const parsed = c.t === 'text' ? parseMonthText(c.text) : null;
  const token = parsed ? c.text.trim().replace(/[\d\-\s./]+/g, ' ').trim().split(' ')[0] : null;
  const likely = plausible(found, token);
  const keep = new Set(likely.map((o) => `${o.old}|${o.current}`));
  return { likely, others: found.filter((o) => !keep.has(`${o.old}|${o.current}`)) };
}

function rawOptionsForCell(table: Table, row: number, col: number): GeneOption[] | null {
  const c = table.rows[row][col];
  const seen = new Map<string, GeneOption>();
  const add = (list: GeneOption[]) => list.forEach((o) => seen.set(`${o.old}|${o.current}`, o));
  if (c.t === 'date' && c.num !== undefined) {
    const info = fmtInfo(c.fmt ?? '');
    const ymd = serialToYMD(c.num, table.date1904);
    let numbers: number[];
    if (info.hasDay && !info.hasYear) numbers = [ymd.d];
    else if (info.hasYear && !info.hasDay) numbers = [ymd.y % 100];
    else numbers = [ymd.d, ymd.y % 100];
    for (const n of numbers) add(geneOptions([ymd.m], n));
    return [...seen.values()];
  }
  if (c.t === 'number' && c.num !== undefined && Number.isInteger(c.num) && c.num >= 30000 && c.num <= 60000) {
    const { y, m, d } = serialToYMD(c.num, table.date1904);
    add(geneOptions([m], d));
    add(geneOptions([m], y % 100));
    return [...seen.values()];
  }
  if (c.t === 'text') {
    if (/^\d{5}$/.test(c.text)) {
      const serial = Number(c.text);
      if (serial >= 30000 && serial <= 60000) {
        const { y, m, d } = serialToYMD(serial, table.date1904);
        add(geneOptions([m], d));
        add(geneOptions([m], y % 100));
        return [...seen.values()];
      }
    }
    const parsed = parseMonthText(c.text);
    if (parsed) {
      add(geneOptions(parsed.months, parsed.n));
      return [...seen.values()];
    }
    const numeric = parseNumericDate(c.text);
    if (numeric) {
      for (const r of numeric) {
        add(geneOptions([r.m], r.d));
        add(geneOptions([r.m], r.y % 100));
      }
      return [...seen.values()];
    }
  }
  return null;
}

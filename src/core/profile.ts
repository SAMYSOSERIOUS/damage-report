import { isGeneSymbol } from './genes';
import { monthsFromToken } from './months';
import type { Cell, Table } from './types';

export interface ColumnProfile {
  col: number;
  name: string;
  nonEmpty: number;
  geneish: boolean;
  /** Share of text cells that are known gene symbols (0 to 1). */
  geneShare: number;
  idLikeHeader: boolean;
  zipLikeHeader: boolean;
  phoneLikeHeader: boolean;
  /** Number of cells that are plain digit strings of 12 to 19 digits. */
  longDigitCells: number;
}

const DAY_MON = /^(\d{1,2})[-\s./]+([^\d\s\-./]{3,}\.?)$/;
const MON_DAY = /^([^\d\s\-./]{3,}\.?)[-\s./]+(\d{1,2})$/;

export interface TextDate {
  months: number[];
  n: number;
}

/** Recognise text such as 2-Sep, Sep-2, 15 sept. A month word and a number, in any supported language. */
export function parseMonthText(s: string): TextDate | null {
  const t = s.trim();
  let m = DAY_MON.exec(t);
  if (m) {
    const months = monthsFromToken(m[2]);
    if (months.length) return { months, n: Number(m[1]) };
  }
  m = MON_DAY.exec(t);
  if (m) {
    const months = monthsFromToken(m[1]);
    if (months.length) return { months, n: Number(m[2]) };
  }
  return null;
}

const NUM_DATE = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})$/;
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/** Every month/day reading of a numeric date such as 09/02/2020 (both orders when it is ambiguous) or 2020-09-02. */
export function parseNumericDate(s: string): { m: number; d: number; y: number }[] | null {
  const t = s.trim();
  const iso = ISO_DATE.exec(t);
  if (iso) {
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? [{ m, d, y: Number(iso[1]) }] : null;
  }
  const mm = NUM_DATE.exec(t);
  if (!mm) return null;
  const a = Number(mm[1]);
  const b = Number(mm[2]);
  const y = Number(mm[3]);
  const out: { m: number; d: number; y: number }[] = [];
  if (a >= 1 && a <= 12 && b >= 1 && b <= 31) out.push({ m: a, d: b, y });
  if (b >= 1 && b <= 12 && a >= 1 && a <= 31 && a !== b) out.push({ m: b, d: a, y });
  return out.length ? out : null;
}

const ID_HEADER =
  /(^|[\s_\-./])(id|ids|ident|identifier|code|barcode|isbn|ean|upc|sku|accession|account|order|invoice|sample|serial|ssn|iban|reference|ref|patient|subject|record)([\s_\-./]|$)|id$/i;
const ZIP_HEADER = /zip|postal|postcode|post code|plz/i;
const PHONE_HEADER = /phone|tel\b|telephone|mobile|fax/i;
const GENE_HEADER = /(^|[\s_\-./])(gene|genes|symbol|hgnc)([\s_\-./]|$)/i;

export function profileColumn(table: Table, col: number): ColumnProfile {
  const name = table.headers[col] ?? '';
  let nonEmpty = 0;
  let textCells = 0;
  let geneHits = 0;
  let longDigitCells = 0;
  for (const row of table.rows) {
    const c: Cell = row[col];
    if (!c || c.t === 'empty') continue;
    nonEmpty++;
    if (c.t === 'text') {
      const s = c.text.trim();
      if (/^\d{12,19}$/.test(s)) longDigitCells++;
      if (/^\d+$/.test(s)) continue; // digit-only text is not evidence either way
      if (parseMonthText(s) || parseNumericDate(s)) continue; // mangled cells must not count against the column
      textCells++;
      if (isGeneSymbol(s)) geneHits++;
    }
  }
  const geneShare = textCells ? geneHits / textCells : 0;
  const headerGene = GENE_HEADER.test(name);
  const geneish = (headerGene && textCells >= 1 && geneShare >= 0.3) || (textCells >= 5 && geneShare >= 0.6);
  return {
    col,
    name,
    nonEmpty,
    geneish,
    geneShare,
    idLikeHeader: ID_HEADER.test(name),
    zipLikeHeader: ZIP_HEADER.test(name),
    phoneLikeHeader: PHONE_HEADER.test(name),
    longDigitCells,
  };
}

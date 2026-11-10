import genes from '../src/data/genes.json';
import type { Rng } from './rng';

export interface Vul {
  s: string;
  a: string;
  m: number[];
  n: number;
}
const VUL = (genes.vulnerable as Vul[]).filter((v) => v.m.length === 1);
const APPROVED = (genes.approved as string[]).filter((s) => /^[A-Z][A-Z0-9]{2,9}$/.test(s));

export type Kind = 'genes' | 'customers' | 'lab' | 'survey';

export interface GenTable {
  kind: Kind;
  headers: string[];
  rows: string[][];
  geneCol?: number;
  /** Rows that hold a month-word gene symbol, with the entry used. */
  vulnerable: { row: number; v: Vul }[];
  idCol?: number;
  zipCol?: number;
  dateCol?: number;
  nameCol?: number;
  numCol?: number;
}

const FIRST = ['José', 'Ana', 'Zoë', 'Søren', 'Łukasz', 'François', 'Ångström', 'Müller', 'Nguyễn', 'Ilse', 'Tom', 'Li', 'Eva', 'Max', 'Çağla', 'Renée', 'Björn', 'Marie', 'Noor', 'Sam'];
const LAST = ['García', 'Silva', 'Dupont', 'Novák', 'Brown', 'Wei', 'Kowalski', 'Østergaard', 'Müller', 'Łopez', 'Jones', 'Khan', 'Rossi', 'Smith', 'Álvarez', 'Fernández'];
const GROUPS = ['control', 'treated', 'knockout', 'wildtype'];
const COMMENTS = ['Very helpful, thanks', 'Could be better', "Didn't work for me", 'Great — would recommend', 'Café was closed', 'OK', '“Excellent” service', 'Too slow, 3 days'];

const two = (n: number) => String(n).padStart(2, '0');

export function makeClean(rng: Rng, kind: Kind): GenTable {
  const n = rng.int(40, 220);
  const rows: string[][] = [];
  const out: GenTable = { kind, headers: [], rows, vulnerable: [] };
  if (kind === 'genes') {
    out.headers = [rng.pick(['Gene', 'Gene symbol', 'Symbol', 'HGNC symbol']), rng.pick(['Log2FC', 'logFC', 'Fold change']), rng.pick(['Count', 'Reads', 'Total counts']), 'P-value', 'Group'];
    out.geneCol = 0;
    out.numCol = 2;
    const planted = new Set<number>();
    const k = rng.int(3, 7);
    while (planted.size < k) planted.add(rng.int(0, n - 1));
    for (let i = 0; i < n; i++) {
      let sym: string;
      if (planted.has(i)) {
        const v = rng.pick(VUL);
        out.vulnerable.push({ row: i, v });
        sym = v.s;
      } else sym = rng.pick(APPROVED);
      rows.push([sym, (rng.next() * 6 - 3).toFixed(3), String(rng.int(1, 5000)), (rng.next() * 0.05).toExponential(2).toUpperCase().replace('E-', 'E-0').replace(/E-0(\d\d)$/, 'E-$1'), rng.pick(GROUPS)]);
    }
  } else if (kind === 'customers') {
    out.headers = [rng.pick(['Order ID', 'Order number', 'Customer ID']), rng.pick(['ZIP', 'Postal code', 'Postcode', 'PLZ', 'ZIP code']), 'Name', rng.pick(['Signup', 'Signup date', 'Date']), rng.pick(['Amount', 'Total', 'Revenue'])];
    out.idCol = 0;
    out.zipCol = 1;
    out.nameCol = 2;
    out.dateCol = 3;
    out.numCol = 4;
    for (let i = 0; i < n; i++) {
      const zip = rng.chance(0.3) ? '0' + rng.digits(4, false) : rng.digits(5);
      const day = rng.chance(0.65) ? rng.int(13, 28) : rng.int(1, 12);
      rows.push([rng.digits(rng.int(16, 18)).replace(/0+$/, (z) => String(rng.int(1, 9)).repeat(z.length)), zip, `${rng.pick(FIRST)} ${rng.pick(LAST)}`, `${two(day)}/${two(rng.int(1, 12))}/${rng.int(2019, 2023)}`, (rng.next() * 4800 + 5).toFixed(2)]);
    }
  } else if (kind === 'lab') {
    out.headers = ['Sample ID', rng.pick(['Barcode', 'EAN', 'Serial number']), 'Concentration', 'Date', 'Operator'];
    out.idCol = 1;
    out.nameCol = 4;
    out.dateCol = 3;
    for (let i = 0; i < n; i++) {
      rows.push([`S-${String(i + 1).padStart(5, '0')}`, rng.digits(13), (rng.next() * 9e-3).toExponential(2).toUpperCase().replace(/E-(\d)$/, 'E-0$1'), `${rng.int(2020, 2024)}-${two(rng.int(1, 12))}-${two(rng.int(1, 28))}`, `${rng.pick(FIRST)} ${rng.pick(LAST)}`]);
    }
    out.numCol = undefined;
  } else {
    out.headers = ['Respondent', 'Age', 'Score', 'Comment', rng.pick(['Date', 'Answered on'])];
    out.nameCol = 3;
    out.dateCol = 4;
    out.numCol = 2;
    for (let i = 0; i < n; i++) {
      rows.push([String(1000 + i), String(rng.int(18, 80)), String(rng.int(1, 5000)), rng.pick(COMMENTS), `${two(rng.chance(0.7) ? rng.int(13, 28) : rng.int(1, 12))}/${two(rng.int(1, 12))}/${rng.int(2021, 2024)}`]);
    }
  }
  return out;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const q = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [headers, ...rows].map((r) => r.map(q).join(',')).join('\n');
}

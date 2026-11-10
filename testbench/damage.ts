import type { DetectorId } from '../src/core';
import type { GenTable } from './corpus';
import { MONTH_ABBR_EN } from '../src/core/months';
import type { Rng } from './rng';

export interface Truth {
  detector: DetectorId;
  row: number;
  col: number;
}
export interface Damaged {
  headers: string[];
  rows: string[][];
  truth: Truth[];
  applied: string[];
}

const two = (n: number) => String(n).padStart(2, '0');
const serial = (y: number, m: number, d: number) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);

/** Emulate "UTF-8 text opened as Windows-1252". */
export function toMojibake(s: string): string {
  return new TextDecoder('windows-1252').decode(new TextEncoder().encode(s));
}

type Fn = (t: GenTable, rows: string[][], rng: Rng) => Truth[];

export const DAMAGERS: Record<string, { applies: (t: GenTable) => boolean; apply: Fn }> = {
  geneDate: {
    applies: (t) => t.vulnerable.length > 0,
    apply(t, rows, rng) {
      const truth: Truth[] = [];
      for (const { row, v } of t.vulnerable) {
        if (!rng.chance(0.85)) continue;
        const m = v.m[0];
        const n = v.n;
        const year = rng.int(2015, 2021);
        const token = /^[A-Z]+/.exec(v.s)![0];
        let shown: string;
        let det: DetectorId = 'gene-date';
        const style = rng.int(0, 5);
        if (n > 31) {
          // two-digit "year" form: Jan-41
          shown = style < 3 ? `${MONTH_ABBR_EN[m - 1]}-${n}` : `01/${two(m)}/19${n}`;
          if (style >= 3) shown = `${two(m)}/01/19${n}`;
        } else if (style === 0) shown = `${n}-${MONTH_ABBR_EN[m - 1]}`;
        else if (style === 1) shown = `${n}-${token.toLowerCase()}`; // e.g. 2-ago, 1-mei
        else if (style === 2) shown = `${MONTH_ABBR_EN[m - 1]}-${two(n)}`;
        else if (style === 3) shown = `${two(m)}/${two(n)}/${year}`;
        else if (style === 4) shown = `${year}-${two(m)}-${two(n)}`;
        else {
          shown = String(serial(year, m, n)); // second-round damage: date saved and re-opened as a number
          det = 'gene-number';
        }
        rows[row][t.geneCol!] = shown;
        truth.push({ detector: det, row, col: t.geneCol! });
      }
      return truth;
    },
  },
  longId: {
    applies: (t) => t.idCol !== undefined && t.kind !== 'lab' ? true : t.kind === 'lab',
    apply(t, rows, rng) {
      const truth: Truth[] = [];
      const col = t.idCol!;
      const want = rng.chance(0.7) ? rows.length : rng.int(2, Math.min(12, rows.length));
      for (const row of rng.shuffle(rows.map((_, i) => i)).slice(0, want)) {
        const s = rows[row][col];
        if (s.length < 16) continue; // only IDs that are long enough to be damaged
        if (rng.chance(0.5)) {
          rows[row][col] = Number(s).toExponential(5).toUpperCase().replace('E+', 'E+');
        } else {
          // Excel keeps 15 significant digits and writes zeros for the rest.
          rows[row][col] = s.slice(0, 15) + '0'.repeat(s.length - 15);
        }
        truth.push({ detector: 'long-id', row, col });
      }
      return truth;
    },
  },
  leadingZeros: {
    applies: (t) => t.zipCol !== undefined,
    apply(t, rows, rng) {
      const truth: Truth[] = [];
      const col = t.zipCol!;
      const all = rng.chance(0.6);
      for (let row = 0; row < rows.length; row++) {
        const s = rows[row][col];
        if (!s.startsWith('0')) continue;
        if (!all && rng.chance(0.5)) continue;
        rows[row][col] = String(Number(s));
        truth.push({ detector: 'leading-zeros', row, col });
      }
      return truth;
    },
  },
  mixedDates: {
    applies: (t) => t.dateCol !== undefined && t.kind !== 'lab',
    apply(t, rows, rng) {
      const truth: Truth[] = [];
      const col = t.dateCol!;
      const flippable = rows.map((r, i) => ({ i, m: /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(r[col]) })).filter((x) => x.m && Number(x.m[1]) > 12 && Number(x.m[2]) <= 12);
      const keep = flippable.length >= 3 ? flippable : [];
      const k = Math.max(1, Math.floor(keep.length * 0.4));
      for (const x of rng.shuffle(keep).slice(0, k)) {
        const m = x.m!;
        rows[x.i][col] = `${m[2]}/${m[1]}/${m[3]}`;
        truth.push({ detector: 'mixed-dates', row: x.i, col });
      }
      return truth;
    },
  },
  mojibake: {
    applies: (t) => t.nameCol !== undefined,
    apply(t, rows, rng) {
      const truth: Truth[] = [];
      const col = t.nameCol!;
      for (let row = 0; row < rows.length; row++) {
        const s = rows[row][col];
        if (!/[^\x00-\x7f]/.test(s) || !rng.chance(0.6)) continue;
        const bad = toMojibake(s);
        if (bad === s) continue;
        rows[row][col] = bad;
        truth.push({ detector: 'mojibake', row, col });
      }
      return truth;
    },
  },
  numberText: {
    applies: (t) => t.numCol !== undefined && t.kind !== 'customers',
    apply(t, rows, rng) {
      const truth: Truth[] = [];
      const col = t.numCol!;
      const k = Math.max(2, Math.floor(rows.length * 0.05));
      for (const row of rng.shuffle(rows.map((_, i) => i)).slice(0, k)) {
        const s = rows[row][col];
        if (rng.chance(0.5)) rows[row][col] = ` ${s} `;
        else if (/^\d{4,}$/.test(s)) rows[row][col] = s.replace(/\B(?=(\d{3})+$)/g, ',');
        else continue;
        truth.push({ detector: 'number-text', row, col });
      }
      return truth;
    },
  },
};

export function damage(t: GenTable, rng: Rng, kinds?: string[]): Damaged {
  const rows = t.rows.map((r) => r.slice());
  const options = Object.keys(DAMAGERS).filter((k) => DAMAGERS[k].applies(t));
  const chosen = kinds ?? rng.shuffle(options).slice(0, rng.int(1, Math.min(3, options.length)));
  const truth: Truth[] = [];
  const applied: string[] = [];
  for (const k of chosen) {
    if (!DAMAGERS[k]?.applies(t)) continue;
    const got = DAMAGERS[k].apply(t, rows, rng);
    if (got.length) applied.push(k);
    truth.push(...got);
  }
  return { headers: t.headers, rows, truth, applied };
}

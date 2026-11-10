import { colLetter } from './excel';
import { geneOptionsForCell } from './detectors/geneDate';
import { fixMojibake } from './detectors';
import { luhnCheckDigit, luhnValid } from './checkdigits';
import type { Cell, Confidence, DetectorId, Finding, Table, TableReport } from './types';
import { DETECTOR_NAMES } from './types';

/**
 * The four boxes every damaged cell ends in:
 *  proven     one right answer, and the clue is shown
 *  choice     two or more answers (or one that needs a human yes); the person decides
 *  source     the information is not in this file; it goes on a recovery list
 *  quarantine really lost; the cell is flagged loudly and never silently dropped
 */
export type Box = 'proven' | 'choice' | 'source' | 'quarantine';
export { luhnValid };
export const BOXES: Box[] = ['proven', 'choice', 'source', 'quarantine'];
export const BOX_NAMES: Record<Box, string> = {
  proven: 'Fixed with proof',
  choice: 'Fixed by your choice',
  source: 'Find it at the source',
  quarantine: 'Locked away safely',
};

export interface FixOption {
  /** Text that will be written into the cell. */
  value: string;
  /** Short words shown to the person. */
  label: string;
}

export interface Proposal {
  id: string;
  rowIndex: number;
  col: number;
  address: string;
  colName: string;
  detector: DetectorId;
  box: Box;
  before: string;
  options: FixOption[];
  /** Why this answer, in plain words. */
  clue: string;
  /** Cells that look alike share a group, so one decision can settle many. */
  group: string;
  groupTitle: string;
  /** For the recovery list: what to look up. */
  lookup?: string;
}

export interface Settings {
  /** When a gene name comes back: write the name as originally typed (SEPT2) or the approved name today (SEPTIN2). */
  geneNames: 'current' | 'old';
}
export const DEFAULT_SETTINGS: Settings = { geneNames: 'current' };

export interface FixPlan {
  sheet: string;
  proposals: Proposal[];
  /** Whole-sheet warnings, such as a sheet that ends exactly at Excel's row limit. */
  notes: string[];
  counts: Record<Box, number>;
}

const RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2, info: 3 };
const EXCEL_ROW_LIMITS = [1048576, 65536];

/** Does this column's intact IDs obey the Luhn check? Only values that cannot be cut (last digit not zero) count. */
function columnUsesLuhn(table: Table, col: number, length: number): boolean {
  let seen = 0;
  let ok = 0;
  for (const r of table.rows) {
    const s = r[col].text.trim();
    if (s.length !== length || !/^\d+$/.test(s) || s.endsWith('0')) continue;
    // A number cell is a double: above 2^53 (9.007e15) even the last digits are unreliable, so they prove nothing.
    if (r[col].t === 'number' && Number(s) > Number.MAX_SAFE_INTEGER) continue;
    seen++;
    if (luhnValid(s)) ok++;
  }
  return seen >= 5 && ok / seen >= 0.95;
}

/** US state -> first three ZIP digits that belong to it. Only the states where a ZIP can start with zero. */
const ZIP3: Record<string, [number, number][]> = {
  PR: [[6, 9]],
  VI: [[8, 8]],
  MA: [[10, 27], [55, 55]],
  RI: [[28, 29]],
  NH: [[30, 38]],
  ME: [[39, 49]],
  VT: [[50, 54], [56, 59]],
  CT: [[60, 69]],
  NJ: [[70, 89]],
  AE: [[90, 98]],
};
const NO_ZERO_ZIP = new Set(['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'MD', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'WA', 'WV', 'WI', 'WY']);

/**
 * A ZIP that lost its zero: the State column can prove it. US ZIPs that start with 0 exist only in a few states.
 * If the padded ZIP's first three digits fall inside that state's range, the repair is confirmed.
 */
function zipStateEvidence(table: Table, col: number, row: number, padded: string): string | null {
  if (!/^\d{5}$/.test(padded) || !padded.startsWith('0')) return null;
  let stateCol = -1;
  for (let c = 0; c < table.headers.length; c++) {
    if (!/^(state|st|state code|province|region)$/i.test(table.headers[c].trim())) continue;
    const vals = table.rows.map((r) => r[c].text.trim()).filter(Boolean);
    if (vals.length && vals.filter((v) => /^[A-Z]{2}$/.test(v)).length / vals.length >= 0.9) {
      stateCol = c;
      break;
    }
  }
  if (stateCol < 0) return null;
  const st = table.rows[row][stateCol].text.trim();
  if (NO_ZERO_ZIP.has(st)) return null; // a zero-leading ZIP cannot be in this state, so something else is wrong
  const ranges = ZIP3[st];
  if (!ranges) return null;
  const p3 = Number(padded.slice(0, 3));
  if (!ranges.some(([a, b]) => p3 >= a && p3 <= b)) return null;
  return `The State column says ${st}, and ZIP codes in ${st} start with ${ranges.map(([a, b]) => (a === b ? String(a).padStart(3, '0') : `${String(a).padStart(3, '0')}-${String(b).padStart(3, '0')}`)).join(' or ')}. With the zero put back, ${padded} fits.`;
}

const DATE = /^(\d{1,2})([/.\-])(\d{1,2})\2(\d{4}|\d{2})$/;

function bestFindings(findings: Finding[]): Finding[] {
  const best = new Map<string, Finding>();
  for (const f of findings) {
    const k = `${f.rowIndex}:${f.col}`;
    const cur = best.get(k);
    if (!cur || RANK[f.confidence] < RANK[cur.confidence]) best.set(k, f);
  }
  return [...best.values()].sort((a, b) => a.rowIndex - b.rowIndex || a.col - b.col);
}

export function planFixes(table: Table, report: TableReport, settings: Settings = DEFAULT_SETTINGS): FixPlan {
  const proposals: Proposal[] = [];
  const notes: string[] = [];
  const mk = (f: Finding, p: Omit<Proposal, 'id' | 'rowIndex' | 'col' | 'address' | 'colName' | 'detector' | 'before'>): void => {
    proposals.push({
      id: `${table.name}!${f.address}`,
      rowIndex: f.rowIndex,
      col: f.col,
      address: f.address,
      colName: f.colName,
      detector: f.detector,
      before: table.rows[f.rowIndex][f.col].text,
      ...p,
    });
  };

  for (const f of bestFindings(report.findings)) {
    if (f.confidence === 'info') continue;
    const cell = table.rows[f.rowIndex][f.col];
    if (cell.formula) {
      mk(f, {
        box: 'quarantine',
        options: [],
        clue: 'This cell is a formula. Its result is computed from other cells, so fix the cells it reads from, not this one.',
        group: 'formula',
        groupTitle: 'Formula cells (fix their inputs)',
        lookup: 'Fix the cells this formula uses.',
      });
      continue;
    }
    switch (f.detector) {
      case 'mojibake': {
        const fixed = fixMojibake(cell.text);
        if (f.confidence === 'high' && fixed !== cell.text) {
          mk(f, {
            box: 'proven',
            options: [{ value: fixed, label: fixed }],
            clue: 'The odd letters follow a fixed pattern that can be reversed exactly.',
            group: 'mojibake:undo',
            groupTitle: 'Garbled letters, undone',
          });
        } else {
          mk(f, {
            box: 'quarantine',
            options: [],
            clue: 'The original letter was already replaced by a placeholder (�). It is not in this file.',
            group: 'mojibake:lost',
            groupTitle: 'Letters that were lost for good',
            lookup: 'Re-export the file from the source system as UTF-8.',
          });
        }
        break;
      }
      case 'gene-date':
      case 'gene-number': {
        const genes = geneOptionsForCell(table, f.rowIndex, f.col);
        const pick = (o: { old: string; current: string }) => (settings.geneNames === 'old' ? o.old : o.current);
        const byValue = new Map<string, FixOption>();
        const addAll = (list: { old: string; current: string }[], suffix: string) => {
          for (const o of list) {
            const value = pick(o);
            const label = (o.old === o.current ? o.old : `${o.old} (now ${o.current})`) + suffix;
            const prev = byValue.get(value);
            byValue.set(value, prev ? { value, label: prev.label + ' / ' + label } : { value, label });
          }
        };
        addAll(genes?.likely ?? [], '');
        addAll(genes?.others ?? [], ' (only if the file was damaged on an Excel in another language)');
        const options = [...byValue.values()];
        // Proof needs ONE answer even after counting other-language possibilities.
        const unique = options.length === 1;
        if (unique) {
          mk(f, {
            box: 'proven',
            options,
            clue: `Only one gene in the official name list can turn into "${cell.text}".`,
            group: `${f.detector}:single`,
            groupTitle: 'Gene names changed into dates, restored',
          });
        } else if (options.length > 1) {
          mk(f, {
            box: 'choice',
            options,
            clue: `More than one gene name can turn into "${cell.text}". Pick the one that fits your data, for example from a description column.`,
            group: `${f.detector}:${options.map((o) => o.value).join('|')}`,
            groupTitle: `"${cell.text}" could be more than one gene`,
          });
        } else {
          mk(f, {
            box: 'quarantine',
            options: [],
            clue: 'It looks like a date inside a gene column, but no gene name in the official list matches it.',
            group: 'gene:nomatch',
            groupTitle: 'Dates in a gene column with no matching gene',
            lookup: 'Look up the original gene symbol in the source data.',
          });
        }
        break;
      }
      case 'leading-zeros': {
        if (!f.likely) break;
        if (f.proof === 'same barcode') {
          mk(f, {
            box: 'choice',
            options: [{ value: f.likely, label: f.likely }],
            clue: 'A 12-digit UPC-A is the same barcode as a 13-digit EAN that starts with 0. Padding it makes the column consistent. Your choice.',
            group: 'leading-zeros:upc',
            groupTitle: 'Shorter barcodes that are valid, padded to match',
          });
          break;
        }
        if (f.proof === 'check digit') {
          mk(f, {
            box: 'proven',
            options: [{ value: f.likely, label: f.likely }],
            clue: 'The check digit only works with the zeros put back. The odds of that happening by chance are 1 in 10 for a wrong guess, and the cause (Excel dropping leading zeros) is known.',
            group: 'leading-zeros:checkdigit',
            groupTitle: 'Barcodes and ISBNs with lost zeros, restored',
          });
          break;
        }
        const zip = zipStateEvidence(table, f.col, f.rowIndex, f.likely);
        if (zip) {
          mk(f, {
            box: 'proven',
            options: [{ value: f.likely, label: f.likely }],
            clue: zip,
            group: 'leading-zeros:state',
            groupTitle: 'ZIP codes with lost zeros, confirmed by the state',
          });
          break;
        }
        mk(f, {
          box: f.confidence === 'high' ? 'proven' : 'choice',
          options: [{ value: f.likely, label: f.likely }],
          clue:
            f.confidence === 'high'
              ? 'Other values in this column are zero-padded to one fixed length, so the missing zeros are known.'
              : 'The column looks like postal codes or phone numbers of one length, so zeros were probably lost. Please confirm.',
          group: `leading-zeros:${f.confidence === 'high' ? 'proven' : 'confirm'}`,
          groupTitle: f.confidence === 'high' ? 'Lost leading zeros, restored' : 'Probably lost leading zeros',
        });
        break;
      }
      case 'number-text': {
        if (!f.likely) break;
        const eu = f.proof === 'column vote';
        mk(f, {
          box: eu && f.confidence === 'low' ? 'choice' : 'proven',
          options: [{ value: f.likely, label: f.likely }],
          clue: eu
            ? 'The whole column is written the European way (1.234,56). Dots are thousands, the comma is the decimal point. The column vote settles the reading.'
            : 'Only spaces or thousands separators are removed. The number itself does not change.',
          group: eu ? `number-text:eu:${f.confidence}` : 'number-text:clean',
          groupTitle: eu ? 'European-style numbers, converted' : 'Numbers stored as text, cleaned',
        });
        break;
      }
      case 'mixed-dates': {
        const m = DATE.exec(cell.text.trim());
        if (!m) break;
        const swapped = `${m[3]}${m[2]}${m[1]}${m[2]}${m[4]}`;
        mk(f, {
          box: 'choice',
          options: [{ value: swapped, label: swapped }],
          clue: 'This date can only be read in the other order than most of the column. Swapping day and month makes it match. Please confirm.',
          group: 'mixed-dates:swap',
          groupTitle: 'Dates written in the other order',
        });
        break;
      }
      case 'long-id': {
        const s = cell.text.trim();
        const sci = /[eE]/.test(s);
        if (!sci && /^\d{16,19}$/.test(s)) {
          const lost = s.length - 15;
          if (columnUsesLuhn(table, f.col, s.length)) {
            if (lost === 1) {
              const repaired = s.slice(0, 15) + luhnCheckDigit(s.slice(0, 15));
              if (repaired === s) break; // the stored value already passes, so nothing to repair
              mk(f, {
                box: 'proven',
                options: [{ value: repaired, label: repaired }],
                clue: 'Excel kept the first 15 digits. The last digit of these IDs is a check digit worked out from the others, so it can be recomputed exactly.',
                group: 'long-id:luhn',
                groupTitle: 'Cut-off IDs, last digit recomputed',
              });
              break;
            }
            mk(f, {
              box: 'source',
              options: [],
              clue: `${lost} digits were lost. The check digit narrows ${10 ** lost} possible endings to ${10 ** (lost - 1)}, which is still too many to guess.`,
              group: 'long-id:source',
              groupTitle: 'Cut-off IDs to look up',
              lookup: `The first 15 digits (${s.slice(0, 15)}) are reliable. Look up the full ID in the source system.`,
            });
            break;
          }
          mk(f, {
            box: 'source',
            options: [],
            clue: `${lost} digit${lost > 1 ? 's' : ''} after the 15th were replaced by zeros. They are not in this file.`,
            group: 'long-id:source',
            groupTitle: 'Cut-off IDs to look up',
            lookup: `The first 15 digits (${s.slice(0, 15)}) are reliable. Look up the full ID in the source system.`,
          });
        } else {
          mk(f, {
            box: 'source',
            options: [],
            clue: 'Written in scientific notation, only the first digits survive. The rest are not in this file.',
            group: 'long-id:source',
            groupTitle: 'Cut-off IDs to look up',
            lookup: 'Look up the full ID in the source system.',
          });
        }
        break;
      }
    }
  }

  if (table.readNote) notes.push(table.readNote);
  const lastRow = table.rowNums[table.rowNums.length - 1];
  if (EXCEL_ROW_LIMITS.includes(lastRow)) {
    notes.push(
      `This sheet ends at row ${lastRow.toLocaleString('en-US')}, which is exactly Excel's row limit. Rows after that point were probably cut off when the file was opened. Get the full file from the source.`,
    );
  }

  const counts: Record<Box, number> = { proven: 0, choice: 0, source: 0, quarantine: 0 };
  for (const p of proposals) counts[p.box]++;
  return { sheet: table.name, proposals, notes, counts };
}

export interface Decisions {
  /** proposal id -> the value to write. Missing or null means: leave the cell as it is. */
  [id: string]: string | null | undefined;
}

export interface LogEntry {
  sheet: string;
  address: string;
  column: string;
  problem: string;
  before: string;
  after: string;
  box: Box;
  status: 'fixed' | 'left as is' | 'needs source' | 'flagged';
  clue: string;
  decidedBy: 'automatic proof' | 'you' | '';
}

export interface FixResult {
  table: Table;
  log: LogEntry[];
  /** Row index -> short messages for the flag column. */
  flags: Map<number, string[]>;
}

function toCell(detector: DetectorId, value: string): Cell {
  if (detector === 'number-text' && /^[+-]?\d+(\.\d+)?$/.test(value) && value.replace(/[^\d]/g, '').length <= 15) {
    return { t: 'number', text: value, num: Number(value) };
  }
  return { t: 'text', text: value };
}

/** Any cell that differs between two tables and is not in `allowed`. The clean-cell guard. */
export function untouchedViolations(before: Table, after: Table, allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (let r = 0; r < before.rows.length; r++) {
    for (let c = 0; c < before.headers.length; c++) {
      if (allowed.has(`${r}:${c}`)) continue;
      const a = before.rows[r][c];
      const b = after.rows[r]?.[c];
      if (!b || a.t !== b.t || a.text !== b.text || a.num !== b.num || a.fmt !== b.fmt) bad.push(`${colLetter(c)}${before.rowNums[r]}`);
    }
  }
  return bad;
}

export function applyFixes(table: Table, plan: FixPlan, decisions: Decisions): FixResult {
  const rows = table.rows.map((r) => r.slice());
  const log: LogEntry[] = [];
  const flags = new Map<number, string[]>();
  const allowed = new Set<string>();
  const flag = (row: number, msg: string) => flags.set(row, [...(flags.get(row) ?? []), msg]);
  for (const p of plan.proposals) {
    const base = { sheet: plan.sheet, address: p.address, column: p.colName, problem: DETECTOR_NAMES[p.detector], before: p.before, box: p.box, clue: p.clue };
    if (p.box === 'proven' || p.box === 'choice') {
      const chosen = decisions[p.id];
      const ok = typeof chosen === 'string' && p.options.some((o) => o.value === chosen);
      if (ok) {
        rows[p.rowIndex][p.col] = toCell(p.detector, chosen!);
        allowed.add(`${p.rowIndex}:${p.col}`);
        log.push({ ...base, after: chosen!, status: 'fixed', decidedBy: p.box === 'proven' ? 'automatic proof' : 'you' });
      } else {
        log.push({ ...base, after: p.before, status: 'left as is', decidedBy: '' });
        flag(p.rowIndex, `${p.address}: possible ${DETECTOR_NAMES[p.detector].toLowerCase()}, not fixed`);
      }
    } else if (p.box === 'source') {
      log.push({ ...base, after: p.before, status: 'needs source', decidedBy: '' });
      flag(p.rowIndex, `${p.address}: lost data, see recovery list`);
    } else {
      log.push({ ...base, after: p.before, status: 'flagged', decidedBy: '' });
      flag(p.rowIndex, `${p.address}: lost data`);
    }
  }
  const after: Table = { ...table, rows };
  const bad = untouchedViolations(table, after, allowed);
  if (bad.length) throw new Error(`Safety check failed: untouched cells changed (${bad.slice(0, 5).join(', ')}). Nothing was exported.`);
  return { table: after, log, flags };
}

export interface RecoveryRow {
  sheet: string;
  cell: string;
  column: string;
  stored: string;
  problem: string;
  what_to_do: string;
}

/** The shopping list: every cell whose true value is not in this file. */
export function recoveryList(plans: FixPlan[]): RecoveryRow[] {
  const out: RecoveryRow[] = [];
  for (const plan of plans) {
    for (const p of plan.proposals) {
      if (p.box !== 'source' && p.box !== 'quarantine') continue;
      out.push({ sheet: plan.sheet, cell: p.address, column: p.colName, stored: p.before, problem: DETECTOR_NAMES[p.detector], what_to_do: p.lookup ?? p.clue });
    }
    for (const n of plan.notes.filter((x) => x.includes('row limit'))) out.push({ sheet: plan.sheet, cell: '(whole sheet)', column: '', stored: '', problem: 'Possible cut-off rows', what_to_do: n });
  }
  return out;
}

import type { ColumnProfile } from '../profile';
import type { Cell, Confidence, DetectorId, Finding, Table } from '../types';
import { colLetter } from '../excel';

export interface Ctx {
  table: Table;
  col: number;
  profile: ColumnProfile;
}

export interface Detector {
  id: DetectorId;
  run(ctx: Ctx): Finding[];
}

export function finding(
  ctx: Ctx,
  rowIndex: number,
  detector: DetectorId,
  confidence: Confidence,
  why: string,
  likely?: string,
): Finding {
  const cell: Cell = ctx.table.rows[rowIndex][ctx.col];
  return {
    detector,
    confidence,
    col: ctx.col,
    colName: ctx.table.headers[ctx.col] || colLetter(ctx.col),
    rowIndex,
    address: `${colLetter(ctx.col)}${ctx.table.rowNums[rowIndex]}`,
    stored: cell.text,
    likely,
    why,
  };
}

/** Digits of a cell if it is a plain whole number, for CSV text or an Excel number cell. */
export function wholeDigits(c: Cell): string | null {
  if (c.t === 'text' && /^\d+$/.test(c.text)) return c.text;
  if (c.t === 'number' && /^\d+$/.test(c.text)) return c.text;
  return null;
}

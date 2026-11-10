export type Confidence = 'high' | 'medium' | 'low' | 'info';

export type DetectorId =
  | 'gene-date'
  | 'gene-number'
  | 'long-id'
  | 'leading-zeros'
  | 'mixed-dates'
  | 'mojibake'
  | 'number-text';

/** One spreadsheet cell. CSV cells are always 'text' or 'empty'. Excel cells carry their real type. */
export interface Cell {
  t: 'empty' | 'text' | 'number' | 'date' | 'bool' | 'error';
  /** Text as stored. For numbers this is the raw text in the file, for dates the formatted date. */
  text: string;
  /** Numeric value for number and date cells (a date is an Excel serial number). */
  num?: number;
  /** Excel number-format code for date cells. */
  fmt?: string;
  /** The cell holds a formula; `text` is its stored result. */
  formula?: boolean;
}

export interface Table {
  name: string;
  source: 'csv' | 'xlsx';
  headers: string[];
  rows: Cell[][];
  /** Row number of each data row as the user sees it in a spreadsheet (header is row 1 or above). */
  rowNums: number[];
  date1904?: boolean;
  /** Path of the worksheet inside the .xlsx zip, so a fix can edit just that file. */
  sheetPath?: string;
  /** CSV only: field separator of the original file, so an export keeps it. */
  delimiter?: string;
  /** Something to tell the person about how the file was read (for example its text encoding). */
  readNote?: string;
  /** CSV only: the lines above the header row (titles, notes), kept so an export still contains them. */
  preamble?: string[][];
  /** Cells that hold a formula (their stored result is what the checks see). */
  formulaCells?: number;
}

export interface Finding {
  detector: DetectorId;
  confidence: Confidence;
  col: number;
  colName: string;
  /** Index into table.rows. */
  rowIndex: number;
  /** Spreadsheet-style address, for example C7. */
  address: string;
  stored: string;
  likely?: string;
  why: string;
  /** Extra evidence that makes the repair certain, for example a check digit. */
  proof?: string;
}

export interface ColumnSummary {
  col: number;
  name: string;
  letter: string;
  kind: string;
  flagged: number;
  worst: Confidence | null;
}

/** A small excerpt of the user's own sheet, centred on the damaged cells. */
export interface SheetPreview {
  columns: { col: number; letter: string; name: string }[];
  rows: {
    rowIndex: number;
    rowNum: number;
    /** Text of each shown column. */
    cells: string[];
    /** Worst confidence per shown column, or null. */
    marks: (Confidence | null)[];
    /** How many untouched rows were skipped just before this one. */
    skippedBefore: number;
  }[];
  hiddenColumns: number;
  hiddenRows: number;
}

export interface TableReport {
  name: string;
  source: 'csv' | 'xlsx';
  rows: number;
  /** Spreadsheet row number of the first and last data row. */
  firstRow: number;
  lastRow: number;
  cols: number;
  cells: number;
  findings: Finding[];
  preview: SheetPreview;
  columns: ColumnSummary[];
  /** Unique cells flagged at each confidence level. */
  flaggedCells: Record<Confidence, number>;
  /** Findings per detector. */
  byDetector: Record<DetectorId, number>;
}

export interface Report {
  fileName: string;
  tables: TableReport[];
  totals: { rows: number; cols: number; cells: number; flaggedHigh: number; flaggedAny: number; findings: number };
  engine: string;
}

export const CONFIDENCE_ORDER: Confidence[] = ['high', 'medium', 'low', 'info'];
export const DETECTOR_IDS: DetectorId[] = [
  'gene-date',
  'gene-number',
  'long-id',
  'leading-zeros',
  'mixed-dates',
  'mojibake',
  'number-text',
];
export const DETECTOR_NAMES: Record<DetectorId, string> = {
  'gene-date': 'Gene name turned into a date',
  'gene-number': 'Gene name turned into a number',
  'long-id': 'Long ID cut to 15 digits',
  'leading-zeros': 'Lost leading zeros',
  'mixed-dates': 'Mixed or ambiguous dates',
  mojibake: 'Garbled characters',
  'number-text': 'Numbers stored as text',
};

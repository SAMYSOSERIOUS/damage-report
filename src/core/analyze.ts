import { colLetter } from './excel';
import { DETECTORS } from './detectors';
import { profileColumn } from './profile';
import {
  CONFIDENCE_ORDER,
  DETECTOR_IDS,
  type ColumnSummary,
  type Confidence,
  type DetectorId,
  type Finding,
  type SheetPreview,
  type Report,
  type Table,
  type TableReport,
} from './types';

export const ENGINE_VERSION = 'damage-report-core 0.2.0';

const RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2, info: 3 };

const MAX_PREVIEW_ROWS = 24;
const MAX_PREVIEW_COLS = 8;

function buildPreview(table: Table, findings: Finding[], columns: ColumnSummary[], worstByCell: Map<string, Confidence>): SheetPreview {
  // Columns: every flagged column first (worst first), then the leftmost others, shown in sheet order.
  const flaggedCols = columns.filter((c) => c.flagged > 0).sort((a, b) => RANK[a.worst!] - RANK[b.worst!] || a.col - b.col);
  const chosen = new Set(flaggedCols.slice(0, MAX_PREVIEW_COLS).map((c) => c.col));
  for (const c of columns) if (chosen.size < Math.min(MAX_PREVIEW_COLS, columns.length) && !chosen.has(c.col)) chosen.add(c.col);
  const cols = columns.filter((c) => chosen.has(c.col));

  // Rows: the most serious damaged rows, each with one row of context above it.
  const rowWorst = new Map<number, number>();
  for (const f of findings) rowWorst.set(f.rowIndex, Math.min(rowWorst.get(f.rowIndex) ?? 9, RANK[f.confidence]));
  const damaged = [...rowWorst.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map((x) => x[0]);
  const picked = new Set<number>();
  for (const r of damaged) {
    if (picked.size >= MAX_PREVIEW_ROWS) break;
    picked.add(r);
    if (r > 0 && picked.size < MAX_PREVIEW_ROWS && !rowWorst.has(r - 1)) picked.add(r - 1);
  }
  if (picked.size === 0) for (let r = 0; r < Math.min(5, table.rows.length); r++) picked.add(r);
  const ordered = [...picked].sort((a, b) => a - b);
  const rows: SheetPreview['rows'] = [];
  let prev = -1;
  for (const r of ordered) {
    const cut = (t: string) => (t.length > 34 ? t.slice(0, 33) + '…' : t);
    rows.push({
      rowIndex: r,
      rowNum: table.rowNums[r],
      cells: cols.map((c) => cut(table.rows[r][c.col]?.text ?? '')),
      marks: cols.map((c) => worstByCell.get(`${r}:${c.col}`) ?? null),
      skippedBefore: r - prev - 1,
    });
    prev = r;
  }
  return {
    columns: cols.map((c) => ({ col: c.col, letter: c.letter, name: c.name })),
    rows,
    hiddenColumns: columns.length - cols.length,
    hiddenRows: table.rows.length - ordered.length,
  };
}

export function analyzeTable(table: Table): TableReport {
  const cols = table.headers.length;
  const findings: Finding[] = [];
  const kinds: string[] = [];
  for (let col = 0; col < cols; col++) {
    const profile = profileColumn(table, col);
    kinds.push(profile.geneish ? 'gene names' : profile.idLikeHeader ? 'IDs or codes' : 'general');
    for (const d of DETECTORS) findings.push(...d.run({ table, col, profile }));
  }
  findings.sort((a, b) => a.rowIndex - b.rowIndex || a.col - b.col);

  // Count each flagged cell once, at its strongest confidence.
  const worstByCell = new Map<string, Confidence>();
  for (const f of findings) {
    const key = `${f.rowIndex}:${f.col}`;
    const prev = worstByCell.get(key);
    if (!prev || RANK[f.confidence] < RANK[prev]) worstByCell.set(key, f.confidence);
  }
  const flaggedCells: Record<Confidence, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const c of worstByCell.values()) flaggedCells[c]++;

  const byDetector = Object.fromEntries(DETECTOR_IDS.map((id) => [id, 0])) as Record<DetectorId, number>;
  for (const f of findings) byDetector[f.detector]++;

  const columns: ColumnSummary[] = [];
  for (let col = 0; col < cols; col++) {
    const mine = findings.filter((f) => f.col === col);
    let worst: Confidence | null = null;
    for (const f of mine) if (worst === null || RANK[f.confidence] < RANK[worst]) worst = f.confidence;
    columns.push({
      col,
      name: table.headers[col] || colLetter(col),
      letter: colLetter(col),
      kind: kinds[col],
      flagged: new Set(mine.map((f) => f.rowIndex)).size,
      worst,
    });
  }
  return {
    name: table.name,
    source: table.source,
    rows: table.rows.length,
    firstRow: table.rowNums[0] ?? 2,
    lastRow: table.rowNums[table.rowNums.length - 1] ?? table.rows.length + 1,
    cols,
    cells: table.rows.length * cols,
    findings,
    preview: buildPreview(table, findings, columns, worstByCell),
    columns,
    flaggedCells,
    byDetector,
  };
}

export function analyze(fileName: string, tables: Table[]): Report {
  const reports = tables.map(analyzeTable);
  const totals = {
    rows: reports.reduce((s, t) => s + t.rows, 0),
    cols: reports.reduce((s, t) => s + t.cols, 0),
    cells: reports.reduce((s, t) => s + t.cells, 0),
    flaggedHigh: reports.reduce((s, t) => s + t.flaggedCells.high, 0),
    flaggedAny: reports.reduce((s, t) => s + t.flaggedCells.high + t.flaggedCells.medium + t.flaggedCells.low, 0),
    findings: reports.reduce((s, t) => s + t.findings.length, 0),
  };
  return { fileName, tables: reports, totals, engine: ENGINE_VERSION };
}

export { CONFIDENCE_ORDER };

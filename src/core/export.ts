import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { colLetter } from './excel';
import { profileColumn } from './profile';
import type { FixPlan, FixResult, LogEntry, RecoveryRow } from './fix';
import { BOXES, BOX_NAMES } from './fix';
import type { Cell, Table } from './types';

export const FLAG_HEADER = 'Damage Report flag';

const csvCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(headers: string[], rows: string[][], sep = ','): string {
  const cell = (s: string) => (/["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s);
  return [headers, ...rows].map((r) => r.map(cell).join(sep)).join('\r\n') + '\r\n';
}

/** CSV with a UTF-8 byte-order mark, so Excel reads accents correctly instead of garbling them. */
export function exportCsv(fix: FixResult): Uint8Array {
  const pre = fix.table.preamble ?? [];
  const hasFlags = fix.flags.size > 0;
  const headers = hasFlags ? [...fix.table.headers, FLAG_HEADER] : fix.table.headers;
  const rows = fix.table.rows.map((r, i) => {
    const cells = r.map((c) => c.text);
    return hasFlags ? [...cells, (fix.flags.get(i) ?? []).join('; ')] : cells;
  });
  const sep = fix.table.delimiter ?? ',';
  const body = strToU8(pre.map((r) => r.map((c) => (c.includes(sep) ? `"${c.replace(/"/g, '""')}"` : csvCell(c))).join(sep)).join('\r\n') + (pre.length ? '\r\n' : '') + toCsv(headers, rows, sep));
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}

export function logToCsv(log: LogEntry[]): string {
  return toCsv(
    ['sheet', 'cell', 'column', 'problem', 'before', 'after', 'box', 'status', 'decided_by', 'clue'],
    log.map((l) => [l.sheet, l.address, l.column, l.problem, l.before, l.after, BOX_NAMES[l.box], l.status, l.decidedBy, l.clue]),
  );
}

export function recoveryToCsv(rows: RecoveryRow[]): string {
  return toCsv(
    ['sheet', 'cell', 'column', 'stored', 'problem', 'what_to_do'],
    rows.map((r) => [r.sheet, r.cell, r.column, r.stored, r.problem, r.what_to_do]),
  );
}

// ---------- xlsx writer ----------

const xml = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface SheetSpec {
  name: string;
  headers: string[];
  rows: Cell[][];
  date1904?: boolean;
  /** Columns that must stay text, even if the cells look like numbers (IDs, ZIP codes, phone numbers). */
  textCols?: Set<number>;
}

class Styles {
  private dateFmts = new Map<string, number>();
  fmtOf(code: string): number {
    if (!this.dateFmts.has(code)) this.dateFmts.set(code, this.dateFmts.size);
    return this.dateFmts.get(code)! + 3; // xf 0 normal, 1 bold, 2 text
  }
  xml(): string {
    const fmts = [...this.dateFmts.keys()];
    const numFmts = fmts.length
      ? `<numFmts count="${fmts.length}">${fmts.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xml(c)}"/>`).join('')}</numFmts>`
      : '';
    const xfs = [
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
      '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
      ...fmts.map((_, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`),
    ];
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts}<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs></styleSheet>`;
  }
}

function cellXml(ref: string, c: Cell, textOnly: boolean, source: 'csv' | 'xlsx', styles: Styles): string {
  if (c.t === 'empty') return '';
  const str = (v: string, s = 0) => `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  if (c.t === 'bool') return `<c r="${ref}" t="b"><v>${/^(true|1)$/i.test(c.text) || c.num === 1 ? 1 : 0}</v></c>`;
  if (c.t === 'error') return str(c.text);
  if (c.t === 'date' && c.num !== undefined && c.fmt) return `<c r="${ref}" s="${styles.fmtOf(c.fmt)}"><v>${c.num}</v></c>`;
  if (c.t === 'date') return str(c.text);
  const digitsOnly = /^\d+$/.test(c.text);
  if (c.t === 'number') {
    // Long whole numbers would be shown as 1.23457E+15 and cut to 15 digits again, so they are written as text.
    if (digitsOnly && c.text.length >= 12) return str(c.text, 2);
    if (c.num !== undefined && Number.isFinite(c.num)) return `<c r="${ref}"><v>${c.num}</v></c>`;
    return str(c.text);
  }
  // text
  if (source === 'csv' && !textOnly && /^-?(0|[1-9]\d{0,10})(\.\d+)?$/.test(c.text)) return `<c r="${ref}"><v>${c.text}</v></c>`;
  return str(c.text, digitsOnly ? 2 : 0);
}

function sheetXml(spec: SheetSpec, source: 'csv' | 'xlsx', styles: Styles): string {
  const out: string[] = [];
  const hdr = spec.headers
    .map((h, i) => `<c r="${colLetter(i)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${xml(h)}</t></is></c>`)
    .join('');
  out.push(`<row r="1">${hdr}</row>`);
  spec.rows.forEach((row, r) => {
    const cells = row.map((c, i) => cellXml(`${colLetter(i)}${r + 2}`, c, spec.textCols?.has(i) ?? false, source, styles)).join('');
    out.push(`<row r="${r + 2}">${cells}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${out.join('')}</sheetData></worksheet>`;
}

function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\[\]:*?/\\]/g, '_').trim().slice(0, 31) || 'Sheet';
  let n = base;
  let i = 2;
  while (used.has(n.toLowerCase())) n = base.slice(0, 31 - String(i).length - 1) + '_' + i++;
  used.add(n.toLowerCase());
  return n;
}

const textRows = (rows: string[][]): Cell[][] => rows.map((r) => r.map((t) => (t === '' ? { t: 'empty', text: '' } : { t: 'text', text: t })));

export interface XlsxInput {
  fixes: { fix: FixResult; source: 'csv' | 'xlsx'; plan: FixPlan; original: Table }[];
  log: LogEntry[];
  recovery: RecoveryRow[];
}

/**
 * An Excel file that does not break again when it is opened: IDs, ZIP codes and long numbers are text cells,
 * dates keep their format, the change log and the recovery list travel inside the same file.
 */
export function exportXlsx(input: XlsxInput): Uint8Array {
  const styles = new Styles();
  const used = new Set<string>();
  const sheets: { name: string; xml: string; date1904?: boolean }[] = [];
  for (const { fix, source, original } of input.fixes) {
    const hasFlags = fix.flags.size > 0;
    const headers = hasFlags ? [...fix.table.headers, FLAG_HEADER] : fix.table.headers;
    const rows = fix.table.rows.map((r, i) => (hasFlags ? [...r, { t: 'text', text: (fix.flags.get(i) ?? []).join('; ') } as Cell] : r));
    const textCols = new Set<number>();
    for (let c = 0; c < original.headers.length; c++) {
      const p = profileColumn(original, c);
      if (p.idLikeHeader || p.zipLikeHeader || p.phoneLikeHeader || p.geneish) textCols.add(c);
    }
    const spec: SheetSpec = { name: fix.table.name, headers, rows, date1904: original.date1904, textCols };
    sheets.push({ name: safeSheetName(spec.name, used), xml: sheetXml(spec, source, styles), date1904: original.date1904 });
  }
  const logRows = input.log.map((l) => [l.sheet, l.address, l.column, l.problem, l.before, l.after, BOX_NAMES[l.box], l.status, l.decidedBy, l.clue]);
  const logSpec: SheetSpec = {
    name: 'Change log',
    headers: ['Sheet', 'Cell', 'Column', 'Problem', 'Before', 'After', 'Box', 'Status', 'Decided by', 'Clue'],
    rows: textRows(logRows),
    textCols: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  };
  sheets.push({ name: safeSheetName('Change log', used), xml: sheetXml(logSpec, 'xlsx', styles) });
  if (input.recovery.length) {
    const spec: SheetSpec = {
      name: 'Recovery list',
      headers: ['Sheet', 'Cell', 'Column', 'Stored value', 'Problem', 'What to do'],
      rows: textRows(input.recovery.map((r) => [r.sheet, r.cell, r.column, r.stored, r.problem, r.what_to_do])),
      textCols: new Set([0, 1, 2, 3, 4, 5]),
    };
    sheets.push({ name: safeSheetName('Recovery list', used), xml: sheetXml(spec, 'xlsx', styles) });
  }
  const date1904 = input.fixes.some((f) => f.original.date1904);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${date1904 ? ' date1904="1"' : ''}/><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(styles.xml()),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(s.xml)));
  return zipSync(files);
}

// ---------- audit report ----------

const h = xml;

/** One self-contained page that says what was found, what was changed, and what is still open. */
export function auditHtml(fileName: string, plans: FixPlan[], log: LogEntry[], recovery: RecoveryRow[], engine: string): string {
  const total = (b: (typeof BOXES)[number]) => plans.reduce((n, p) => n + p.counts[b], 0);
  const fixed = log.filter((l) => l.status === 'fixed').length;
  const left = log.filter((l) => l.status === 'left as is').length;
  const row = (l: LogEntry) =>
    `<tr><td>${h(l.sheet)}</td><td>${h(l.address)}</td><td>${h(l.problem)}</td><td class="m">${h(l.before)}</td><td class="m">${h(l.after)}</td><td>${h(l.status)}</td><td>${h(l.decidedBy)}</td><td>${h(l.clue)}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Damage Report audit: ${h(fileName)}</title><style>body{font:16px/1.5 Georgia,serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#1F1B16}h1{font-size:28px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #D9CFB4;padding:6px 8px;text-align:left;vertical-align:top}th{background:#F3EDDC}.m{font-family:ui-monospace,Menlo,Consolas,monospace}.box{display:inline-block;border:2px solid #1F1B16;padding:6px 12px;margin:0 8px 8px 0}.wrap{overflow-x:auto}</style></head><body><h1>Audit report</h1><p>File: <b>${h(fileName)}</b><br>Made on the user's own computer by ${h(engine)}. Nothing was uploaded.</p><h2>Summary</h2><p>${BOXES.map((b) => `<span class="box"><b>${total(b)}</b> ${h(BOX_NAMES[b])}</span>`).join('')}</p><p>${fixed} cell${fixed === 1 ? '' : 's'} changed. ${left} flagged cell${left === 1 ? '' : 's'} left as they were. Every cell not listed below was not touched.</p>${plans.flatMap((p) => p.notes).map((n) => `<p><b>Note:</b> ${h(n)}</p>`).join('')}<h2>Every change and flag</h2><div class="wrap"><table><thead><tr><th>Sheet</th><th>Cell</th><th>Problem</th><th>Before</th><th>After</th><th>Status</th><th>Decided by</th><th>Clue</th></tr></thead><tbody>${log.map(row).join('')}</tbody></table></div><h2>Still open (${recovery.length})</h2><p>These need the original source. See the recovery list in the download.</p><p>Limits: fixes follow fixed rules and a public gene-name list. They are exact where marked "proof", otherwise a person decided.</p></body></html>`;
}

// ---------- edit the original .xlsx in place ----------

export interface PatchInput {
  table: Table;
  fix: FixResult;
  plan: FixPlan;
}

/**
 * The most careful export: open the user's own .xlsx and replace ONLY the cells that were fixed. Every other byte
 * stays as it was: colours, column widths, formulas, charts, other sheets. IDs and codes become text cells.
 */
export function patchXlsx(original: Uint8Array, items: PatchInput[]): Uint8Array {
  const files = unzipSync(original);
  for (const { table, fix, plan } of items) {
    if (!table.sheetPath || !files[table.sheetPath]) continue;
    const edits = new Map<string, string>();
    for (const p of plan.proposals) {
      const after = fix.table.rows[p.rowIndex][p.col];
      const before = table.rows[p.rowIndex][p.col];
      if (after.t === before.t && after.text === before.text) continue;
      edits.set(p.address, after.t === 'number' && after.num !== undefined ? `<v>${after.num}</v>` : `<is><t xml:space="preserve">${xml(after.text)}</t></is>`);
      if (after.t !== 'number') edits.set(p.address, 'T' + edits.get(p.address));
    }
    if (!edits.size) continue;
    const src = strFromU8(files[table.sheetPath]);
    let used = 0;
    const next = src.replace(/<c\b([^>]*?)(\/>|>[\s\S]*?<\/c>)/g, (whole, attrs: string) => {
      const ref = /(?:^|\s)r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const e = ref ? edits.get(ref) : undefined;
      if (!ref || e === undefined) return whole;
      used++;
      const style = /(?:^|\s)s="(\d+)"/.exec(attrs)?.[1];
      const s = style ? ` s="${style}"` : '';
      return e.startsWith('T') ? `<c r="${ref}"${s} t="inlineStr">${e.slice(1)}</c>` : `<c r="${ref}"${s}>${e}</c>`;
    });
    if (used !== edits.size) throw new Error(`Could not find every fixed cell in the worksheet (${used} of ${edits.size}). Nothing was exported.`);
    files[table.sheetPath] = strToU8(next);
  }
  return zipSync(files);
}

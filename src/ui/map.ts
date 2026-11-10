import type { TableReport, Confidence } from '../core';
import { colLetter } from '../core';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2, info: 3 };
const WORD: Record<Confidence, string> = { high: 'very likely', medium: 'probably', low: 'worth a look', info: 'note' };

/** Shows a piece of the user's own sheet, with the damaged cells coloured in place. */
export function sheetView(tb: TableReport, shown: Confidence[]): string {
  const p = tb.preview;
  // best finding per cell (for the small "probably was" line)
  const best = new Map<string, { likely?: string; address: string; conf: Confidence }>();
  for (const f of tb.findings) {
    const k = `${f.rowIndex}:${f.col}`;
    const cur = best.get(k);
    if (!cur || RANK[f.confidence] < RANK[cur.conf]) best.set(k, { likely: f.likely, address: f.address, conf: f.confidence });
  }
  const colspan = p.columns.length + 1;
  const head = `<tr><th class="rn"></th>${p.columns.map((c) => `<th><span class="cl">${esc(c.letter)}</span><span class="cn">${esc(c.name === c.letter ? '' : c.name)}</span></th>`).join('')}</tr>`;
  let body = '';
  for (const r of p.rows) {
    if (r.skippedBefore > 0) body += `<tr class="gap"><td colspan="${colspan}">⋯ ${r.skippedBefore} row${r.skippedBefore === 1 ? '' : 's'} without problems</td></tr>`;
    body += `<tr><th class="rn">${r.rowNum}</th>${r.cells
      .map((text, i) => {
        const m = r.marks[i];
        const col = p.columns[i].col;
        if (!m || !shown.includes(m)) return `<td class="mono">${esc(text) || '<span class="blank"></span>'}</td>`;
        const b = best.get(`${r.rowIndex}:${col}`)!;
        const likely = b.likely ? (b.likely.length > 44 ? b.likely.slice(0, 43) + '…' : b.likely) : '';
        const label = `${WORD[m]}: ${b.address}`;
        return `<td class="bad bad-${m} mk" data-addr="${esc(b.address)}" tabindex="0" role="button" aria-label="${esc(label)}. Show it in the list below." title="${esc(label)}"><span class="mono">${esc(text)}</span>${likely ? `<span class="fix">→ ${esc(likely)}</span>` : ''}</td>`;
      })
      .join('')}</tr>`;
  }
  const after = p.hiddenRows - p.rows.reduce((n, r) => n + r.skippedBefore, 0);
  if (after > 0) body += `<tr class="gap"><td colspan="${colspan}">⋯ ${after} more row${after === 1 ? '' : 's'} without problems</td></tr>`;
  const legend = (['high', 'medium', 'low'] as Confidence[])
    .map((c) => `<span class="lg"><i class="sw sw-${c}"></i>${WORD[c]}</span>`)
    .join('');
  const hidden = p.hiddenColumns > 0 ? ` ${p.hiddenColumns} other column${p.hiddenColumns === 1 ? ' is' : 's are'} not shown because ${p.hiddenColumns === 1 ? 'it has' : 'they have'} no problems.` : '';
  void colLetter;
  return `<div class="scroll"><table class="sheet" aria-label="Part of your file with damaged cells coloured"><thead>${head}</thead><tbody>${body}</tbody></table></div>
  <p class="why" style="margin:10px 0 0">${legend}</p>
  <p class="why" style="margin:4px 0 0">This is a piece of your own file. Coloured cells are the ones I think were damaged. The small line under a value is what it probably was. Click a coloured cell to see why.${hidden}</p>`;
}

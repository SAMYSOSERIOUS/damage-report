import './style.css';
import { nav, footer } from './nav';
import { CONFIDENCE_ORDER, DETECTOR_NAMES, type Report, type TableReport, type Confidence, type Finding } from '../core';
import { sheetView } from './map';
import { mountFix } from './fix';
import { Session } from './engine';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const LABEL: Record<Confidence, string> = { high: 'Very likely damaged', medium: 'Probably damaged', low: 'Worth a look', info: 'Note' };

document.getElementById('nav')!.innerHTML = nav('home');
document.getElementById('foot')!.innerHTML = footer;

const drop = document.getElementById('drop')!;
const input = document.getElementById('file') as HTMLInputElement;
const out = document.getElementById('out')!;

let worker: Worker | null = null;
function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  return worker;
}

/** One call to the engine: in the worker when there is one, on this page when there is not. */
let nextId = 1;
const pending = new Map<number, { ok: (v: never) => void; err: (e: Error) => void }>();
let local: Session | null = null;
function call<T>(type: string, payload: Record<string, unknown>): Promise<T> {
  const w = worker;
  if (!w) {
    return new Promise((resolve, reject) => {
      try {
        if (type === 'analyze') {
          local = new Session(payload.name as string, payload.bytes as Uint8Array);
          resolve(local.analyze() as T);
        } else if (type === 'prepare') resolve(local!.prepare(payload.settings as never) as T);
        else resolve(local!.export(payload.kind as never, payload.decisions as never) as T);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { ok: resolve as never, err: reject });
    w.postMessage({ id, type, ...payload });
  });
}
function wireWorker(w: Worker) {
  w.onmessage = (ev) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    pending.delete(ev.data.id);
    ev.data.ok ? p.ok(ev.data.result as never) : p.err(new Error(ev.data.error));
  };
  w.onerror = () => {
    // the worker could not start: fall back to doing the work on this page
    worker = null;
    for (const [, p] of pending) p.err(new Error('The background worker stopped. Please try the file again.'));
    pending.clear();
  };
}

// Start the worker now, so everything it needs is already loaded if the connection drops later.
const early = getWorker();
if (early) wireWorker(early);

let current: { name: string; bytes: Uint8Array } | null = null;
async function run(name: string, bytes: Uint8Array) {
  current = { name, bytes };
  out.innerHTML = '<p class="card">Checking <b>' + esc(name) + '</b>…</p>';
  const w = getWorker();
  if (w && !w.onmessage) wireWorker(w);
  try {
    show(await call<Report>('analyze', { name, bytes }));
  } catch (e) {
    if (worker) {
      // the worker failed on this file; retry once on the page itself
      worker = null;
      try {
        show(await call<Report>('analyze', { name, bytes }));
        return;
      } catch (e2) {
        return fail(e2);
      }
    }
    fail(e);
  }
}
function fail(e: unknown) {
  out.innerHTML = `<div class="err" role="alert"><b>I could not read this file.</b><br>${esc(e instanceof Error ? e.message : String(e))}</div>`;
}

async function loadFile(f: File) {
  run(f.name, new Uint8Array(await f.arrayBuffer()));
}
drop.addEventListener('click', () => input.click());
drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.click()));
input.addEventListener('change', () => input.files?.[0] && loadFile(input.files[0]));
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => (e.preventDefault(), drop.classList.add('over'))));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => (e.preventDefault(), drop.classList.remove('over'))));
drop.addEventListener('drop', (e) => {
  const f = (e as DragEvent).dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
document.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((b) =>
  b.addEventListener('click', async () => {
    const name = b.dataset.sample!;
    try {
      const r = await fetch(`./samples/${name}`);
      if (!r.ok) throw new Error('Sample not found');
      run(name, new Uint8Array(await r.arrayBuffer()));
    } catch (e) {
      fail(e);
    }
  }),
);

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function show(rep: Report) {
  const t = rep.totals;
  const medium = rep.tables.reduce((n, x) => n + x.flaggedCells.medium, 0);
  const rest = rep.tables.reduce((n, x) => n + x.flaggedCells.low + x.flaggedCells.info, 0);
  out.innerHTML = `
  <h2 id="res">Results for ${esc(rep.fileName)}</h2>
  <div class="tiles">
    <div class="tile"><b>${t.cells.toLocaleString()}</b><span>cells checked (${t.rows.toLocaleString()} rows, ${t.cols} columns)</span></div>
    <div class="tile hi"><b>${t.flaggedHigh}</b><span>very likely damaged</span></div>
    <div class="tile med"><b>${medium}</b><span>probably damaged</span></div>
    <div class="tile"><b>${rest}</b><span>worth a look</span></div>
  </div>
  ${rep.tables.length > 1 ? `<div class="row" id="sheets">${rep.tables.map((x, i) => `<button class="chip" data-sheet="${i}" aria-pressed="${i === 0}">${esc(x.name)} (${x.findings.length})</button>`).join('')}</div>` : ''}
  <div id="sheetview"></div>
  <div id="fixhost" style="margin-top:22px"></div>
  <div class="row" style="margin-top:16px"><button class="btn" id="exj">Download report (JSON)</button><button class="btn" id="exc">Download list (CSV)</button></div>
  <p class="privacy hand">→ made on your computer, nothing was sent anywhere</p>`;
  const sheet = (i: number) => {
    document.querySelectorAll<HTMLElement>('[data-sheet]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.sheet) === i)));
    renderTable(rep.tables[i]);
  };
  document.querySelectorAll<HTMLElement>('[data-sheet]').forEach((b) => b.addEventListener('click', () => sheet(Number(b.dataset.sheet))));
  sheet(0);
  if (current && rep.totals.findings > 0) mountFix(document.getElementById('fixhost')!, rep, { prepare: (settings) => call('prepare', { settings }), export: (kind, decisions) => call('export', { kind, decisions }) });
  document.getElementById('exj')!.onclick = () => download(rep.fileName + '.damage-report.json', JSON.stringify(rep, null, 2), 'application/json');
  document.getElementById('exc')!.onclick = () => {
    const rows = ['sheet,cell,column,confidence,problem,stored,likely_original'];
    for (const tb of rep.tables) for (const f of tb.findings) rows.push([tb.name, f.address, f.colName, f.confidence, DETECTOR_NAMES[f.detector], f.stored, f.likely ?? ''].map(csvCell).join(','));
    download(rep.fileName + '.damage-report.csv', rows.join('\n'), 'text/csv');
  };
  document.getElementById('res')!.scrollIntoView({ behavior: 'smooth' });
}

function renderTable(tb: TableReport) {
  const host = document.getElementById('sheetview')!;
  if (!tb.findings.length) {
    host.innerHTML = '<div class="card empty">No sign of damage found in this sheet. This does not prove the file is perfect — it means none of the seven checks fired.</div>';
    return;
  }
  const active = new Set<Confidence>(['high', 'medium']);
  const draw = () => {
    const shown = tb.findings.filter((f) => active.has(f.confidence));
    host.innerHTML = `
    <div class="card map"><h3 style="margin-top:0">Your sheet, with the damage marked</h3>${sheetView(tb, [...active])}</div>
    <h3>What I found</h3>
    <div class="row" role="group" aria-label="Filter by how sure I am">${CONFIDENCE_ORDER.map((c) => `<button class="chip" data-c="${c}" aria-pressed="${active.has(c)}">${LABEL[c]} (${tb.findings.filter((f) => f.confidence === c).length})</button>`).join('')}</div>
    <div class="card scroll" style="margin-top:10px">${shown.length ? rowsHtml(shown) : '<div class="empty">Nothing at this level. Turn on more filters above.</div>'}</div>`;
    const jump = (el: Element) => {
      const addr = el.getAttribute('data-addr');
      const row = addr ? host.querySelector<HTMLElement>(`tr[data-addr="${addr}"]`) : null;
      if (!row) return;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.background = 'var(--hl)';
      setTimeout(() => (row.style.background = ''), 1600);
    };
    host.querySelectorAll('.mk').forEach((m) => {
      m.addEventListener('click', () => jump(m));
      m.addEventListener('keydown', (e) => ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') && (e.preventDefault(), jump(m)));
    });
    host.querySelectorAll<HTMLElement>('[data-c]').forEach((b) =>
      b.addEventListener('click', () => {
        const c = b.dataset.c as Confidence;
        active.has(c) ? active.delete(c) : active.add(c);
        draw();
      }),
    );
  };
  draw();
}

function rowsHtml(fs: Finding[]): string {
  const cap = fs.slice(0, 500);
  return `<table class="f"><thead><tr><th>Cell</th><th>Sure?</th><th>Stored value</th><th>Probably was</th><th>Why</th></tr></thead><tbody>${cap
    .map(
      (f) => `<tr data-addr="${esc(f.address)}"><td class="mono">${esc(f.address)}<div class="why">${esc(f.colName)}</div></td><td><span class="badge b-${f.confidence}">${f.confidence}</span></td><td class="stored">${esc(f.stored)}</td><td class="likely">${esc(f.likely ?? '—')}</td><td><b>${esc(DETECTOR_NAMES[f.detector])}</b><div class="why">${esc(f.why)}</div></td></tr>`,
    )
    .join('')}</tbody></table>${fs.length > cap.length ? `<p class="why">Showing the first ${cap.length} of ${fs.length}. The downloads contain everything.</p>` : ''}`;
}

// Load every font face now, so the page still looks right if the connection drops later.
try {
  ['400 1em Newsreader', 'italic 400 1em Newsreader', '600 1em Newsreader', '600 1em Caveat', '400 1em "IBM Plex Mono"', '500 1em "IBM Plex Mono"'].forEach((f) => void document.fonts.load(f));
} catch {
  /* fonts are only decoration */
}

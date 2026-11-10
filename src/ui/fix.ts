import { BOXES, BOX_NAMES, DEFAULT_SETTINGS, type Box, type Decisions, type FixPlan, type Proposal, type Report, type Settings } from '../core';
import type { ExportKind, ExportOut } from './engine';

export interface FixApi {
  prepare(settings: Settings): Promise<{ plans: FixPlan[]; formulaCells: number; isXlsx: boolean }>;
  export(kind: ExportKind, decisions: Decisions): Promise<ExportOut>;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const BOX_HELP: Record<Box, string> = {
  proven: 'One right answer, and the reason is shown.',
  choice: 'More than one answer, or a change that needs your yes. Nothing happens until you decide.',
  source: 'The missing part is not in this file. These go on a recovery list so you know exactly what to look up.',
  quarantine: 'Really lost. They stay as they are, with a flag next to them.',
};

interface Group {
  key: string;
  box: Box;
  title: string;
  items: Proposal[];
}

function save(name: string, data: Uint8Array | string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function mountFix(host: HTMLElement, report: Report, api: FixApi): void {
  host.innerHTML = `<div class="card fix"><h2 style="margin-top:0">Fix it</h2>
    <p class="why" style="font-size:17px">Every damaged cell ends in one of four boxes. Nothing is changed until you say so, and cells that were fine are never touched.</p>
    <button class="btn go" id="prep">Prepare the fixes</button></div>`;
  document.getElementById('prep')!.addEventListener('click', async () => {
    host.innerHTML = '<div class="card fix"><p>Working out the fixes… big files can take a few seconds.</p></div>';
    try {
      await run(host, report, api);
    } catch (e) {
      host.innerHTML = `<div class="err" role="alert"><b>I could not prepare the fixes.</b><br>${esc(e instanceof Error ? e.message : String(e))}</div>`;
    }
  });
}

async function run(host: HTMLElement, report: Report, api: FixApi) {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  let plans: FixPlan[] = [];
  let formulaCells = 0;
  let isXlsx = false;
  let decisions: Decisions = {};
  const open = new Set<string>();
  const refs: Proposal[] = [];
  let busy = false;
  void report;

  const load = async () => {
    const r = await api.prepare(settings);
    plans = r.plans;
    formulaCells = r.formulaCells;
    isXlsx = r.isXlsx;
    const next: Decisions = {};
    for (const p of plans.flatMap((x) => x.proposals)) {
      if (p.box === 'proven') next[p.id] = p.options[0].value; // proven fixes are on by default; one click turns them off
      else if (decisions[p.id] && p.options.some((o) => o.value === decisions[p.id])) next[p.id] = decisions[p.id];
    }
    decisions = next;
  };

  const groups = (): Group[] => {
    const m = new Map<string, Group>();
    for (const p of plans.flatMap((x) => x.proposals)) {
      const k = `${p.box}|${p.group}`;
      if (!m.has(k)) m.set(k, { key: k, box: p.box, title: p.groupTitle, items: [] });
      m.get(k)!.items.push(p);
    }
    return [...m.values()];
  };

  const ctl = (p: Proposal, i: number): string => {
    const cur = decisions[p.id];
    if (p.options.length === 1) {
      return `<label class="ck"><input type="checkbox" data-one="${i}" ${cur ? 'checked' : ''}> ${esc(p.options[0].label)}</label>`;
    }
    return `<select data-pick="${i}" aria-label="Choose for ${esc(p.address)}"><option value="">Leave as it is</option>${p.options.map((o) => `<option value="${esc(o.value)}" ${cur === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  };

  const groupHtml = (g: Group): string => {
    const first = g.items[0];
    const idx = (p: Proposal) => refs.indexOf(p);
    const on = g.items.filter((p) => decisions[p.id]).length;
    let head = '';
    if (g.box === 'proven' || g.box === 'choice') {
      if (first.options.length === 1) {
        head = `<label class="ck"><input type="checkbox" data-allone="${esc(g.key)}" ${on === g.items.length ? 'checked' : ''}> Apply to all ${g.items.length}</label>`;
      } else {
        head = `<select data-allpick="${esc(g.key)}" aria-label="Apply one choice to all ${g.items.length}"><option value="">Decide for all ${g.items.length}…</option>${first.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}<option value="__leave">Leave all as they are</option></select>`;
      }
    }
    const rows = g.items
      .slice(0, 200)
      .map(
        (p) =>
          `<tr><td class="mono">${esc(p.address)}</td><td class="stored">${esc(p.before)}</td><td class="likely">${p.options.length ? (p.options.length === 1 ? esc(p.options[0].label) : p.options.map((o) => esc(o.label)).join(' or ')) : '—'}</td><td>${g.box === 'proven' || g.box === 'choice' ? ctl(p, idx(p)) : `<span class="why">${esc(p.lookup ?? '')}</span>`}</td></tr>`,
      )
      .join('');
    return `<details class="grp" data-key="${esc(g.key)}" ${open.has(g.key) ? 'open' : ''}>
      <summary><span class="gt"><b>${esc(g.title)}</b> <span class="cnt">${g.items.length}</span></span></summary>
      <div class="gb"><p class="why">${esc(first.clue)}</p>${head ? `<p>${head}</p>` : ''}
      <div class="scroll"><table class="f"><thead><tr><th>Cell</th><th>Now</th><th>Would be</th><th>${g.box === 'source' || g.box === 'quarantine' ? 'What to do' : 'Your decision'}</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${g.items.length > 200 ? `<p class="why">Showing the first 200 of ${g.items.length}. The group controls above apply to all of them.</p>` : ''}</div></details>`;
  };

  const render = () => {
    refs.length = 0;
    plans.forEach((p) => refs.push(...p.proposals));
    const counts = BOXES.map((b) => plans.reduce((n, p) => n + p.counts[b], 0));
    const gs = groups();
    const fixedNow = refs.filter((p) => decisions[p.id]).length;
    const openChoices = refs.filter((p) => p.box === 'choice' && !decisions[p.id]).length;
    const notes = plans.flatMap((p) => p.notes);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0 && notes.length === 0) {
      host.innerHTML = '<div class="card fix empty">Nothing to fix. No cell needs a repair or a flag.</div>';
      return;
    }
    host.innerHTML = `<div class="card fix">
      <h2 style="margin-top:0">Fix it</h2>
      <div class="boxes">${BOXES.map((b, i) => `<div class="bx bx-${b}"><b>${counts[i]}</b><span>${BOX_NAMES[b]}</span><small>${BOX_HELP[b]}</small></div>`).join('')}</div>
      <fieldset class="set"><legend>When a gene name comes back, write…</legend>
        <label class="ck"><input type="radio" name="gn" value="current" ${settings.geneNames === 'current' ? 'checked' : ''}> the name used today (SEPTIN2)</label>
        <label class="ck"><input type="radio" name="gn" value="old" ${settings.geneNames === 'old' ? 'checked' : ''}> the name as it was typed (SEPT2)</label>
        <span class="why">Either way, both names are written in the change log.</span></fieldset>
      ${notes.map((n) => `<div class="err" role="note"><b>Check this:</b> ${esc(n)}</div>`).join('')}
      ${BOXES.map((b) => {
        const list = gs.filter((g) => g.box === b);
        return list.length ? `<h3 class="bh bh-${b}">${BOX_NAMES[b]}</h3>${list.map(groupHtml).join('')}` : '';
      }).join('')}
      <h3>Get your files</h3>
      <p class="why" style="font-size:17px">${fixedNow} cell${fixedNow === 1 ? '' : 's'} will be changed. ${openChoices ? `${openChoices} choice${openChoices === 1 ? ' is' : 's are'} still open; ${openChoices === 1 ? 'it stays' : 'they stay'} as ${openChoices === 1 ? 'it is' : 'they are'} and ${openChoices === 1 ? 'is' : 'are'} flagged in the change log.` : 'No choices are waiting.'}</p>
      <div class="row">
        ${
          isXlsx
            ? '<button class="btn go" id="dp">Download fixed Excel file</button><button class="btn" id="dx">Clean copy with change log inside</button>'
            : '<button class="btn go" id="dx">Download fixed Excel file</button>' + (plans.length === 1 ? '<button class="btn" id="dc">Download fixed CSV</button>' : '')
        }
        <button class="btn" id="dl">Change log (CSV)</button>
        ${plans.some((p) => p.counts.source + p.counts.quarantine > 0 || p.notes.some((n) => n.includes('row limit'))) ? '<button class="btn" id="dr">Recovery list (CSV)</button>' : ''}
        <button class="btn" id="da">Audit report (HTML)</button>
      </div>
      <p class="why" style="font-size:16px">${
        isXlsx
          ? '<b>Fixed Excel file:</b> your own file with only the fixed cells edited. Colours, column widths, formulas and charts stay exactly as they were. Fixed IDs and codes are text cells, so opening the file will not damage them again. <b>Clean copy:</b> a fresh file made from the values, with the change log and recovery list as extra sheets. It does not keep colours, column widths or charts' + (formulaCells ? `, and its ${formulaCells.toLocaleString('en-US')} formula cells become plain values` : '') + '.'
          : 'The Excel file stores IDs, ZIP codes and long numbers as text, so opening it will not damage them again, and it carries the change log inside. The CSV is saved with a mark that makes Excel read accents correctly, but a CSV that is double-clicked in Excel can still be damaged again.' + (plans.length > 1 ? ' Several tables are exported as Excel only.' : '')
      } Your original file is never changed.</p>
    </div>`;
    wire();
  };

  const download = async (kind: ExportKind) => {
    if (busy) return;
    busy = true;
    const buttons = host.querySelectorAll<HTMLButtonElement>('.row .btn');
    buttons.forEach((b) => (b.disabled = true));
    try {
      const out = await api.export(kind, decisions);
      save(out.name, out.data, out.type);
    } catch (e) {
      const div = document.createElement('div');
      div.className = 'err';
      div.setAttribute('role', 'alert');
      div.textContent = e instanceof Error ? e.message : String(e);
      host.querySelector('.fix')!.appendChild(div);
    } finally {
      busy = false;
      buttons.forEach((b) => (b.disabled = false));
    }
  };

  /** Deciding one cell also decides every other cell in its group that shows the same stored value. */
  const sameAs = (p: Proposal) => refs.filter((q) => q.group === p.group && q.box === p.box && q.before === p.before && q.options.length === p.options.length);
  const decide = (p: Proposal, value: string | null) => {
    for (const q of sameAs(p)) {
      if (value && q.options.some((o) => o.value === value)) decisions[q.id] = value;
      else delete decisions[q.id];
    }
  };

  const wire = () => {
    host.querySelectorAll<HTMLInputElement>('input[name=gn]').forEach((r) =>
      r.addEventListener('change', async () => {
        settings.geneNames = r.value as Settings['geneNames'];
        await load();
        render();
      }),
    );
    host.querySelectorAll<HTMLDetailsElement>('details.grp').forEach((d) =>
      d.addEventListener('toggle', () => (d.open ? open.add(d.dataset.key!) : open.delete(d.dataset.key!))),
    );
    host.querySelectorAll<HTMLInputElement>('[data-one]').forEach((c) =>
      c.addEventListener('change', () => {
        const p = refs[Number(c.dataset.one)];
        decide(p, c.checked ? p.options[0].value : null);
        render();
      }),
    );
    host.querySelectorAll<HTMLSelectElement>('[data-pick]').forEach((s) =>
      s.addEventListener('change', () => {
        decide(refs[Number(s.dataset.pick)], s.value || null);
        render();
      }),
    );
    host.querySelectorAll<HTMLInputElement>('[data-allone]').forEach((c) =>
      c.addEventListener('change', () => {
        for (const p of groups().find((g) => g.key === c.dataset.allone)!.items) {
          if (c.checked) decisions[p.id] = p.options[0].value;
          else delete decisions[p.id];
        }
        render();
      }),
    );
    host.querySelectorAll<HTMLSelectElement>('[data-allpick]').forEach((s) =>
      s.addEventListener('change', () => {
        if (!s.value) return;
        for (const p of groups().find((g) => g.key === s.dataset.allpick)!.items) {
          if (s.value === '__leave') delete decisions[p.id];
          else if (p.options.some((o) => o.value === s.value)) decisions[p.id] = s.value;
        }
        render();
      }),
    );
    const on = (id: string, kind: ExportKind) => {
      const b = document.getElementById(id);
      if (b) b.onclick = () => void download(kind);
    };
    on('dp', 'patch');
    on('dx', 'xlsx');
    on('dc', 'csv');
    on('dl', 'log');
    on('dr', 'recovery');
    on('da', 'audit');
  };

  await load();
  render();
}

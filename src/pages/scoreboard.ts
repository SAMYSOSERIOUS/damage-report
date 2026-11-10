import '../ui/style.css';
import { nav, footer } from '../ui/nav';
document.getElementById('nav')!.innerHTML = nav('score');
document.getElementById('foot')!.innerHTML = footer;

const pct = (x: number) => (x * 100).toFixed(1) + '%';
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
interface V { check: string; value: number; bar: number; pass: boolean }

fetch('./data/scoreboard.json')
  .then((r) => r.json())
  .then((d) => {
    const verdictRows = (v: V[]) => v.map((x) => `<tr><td>${esc(x.check)}</td><td>${pct(x.value)}</td><td>${x.check.startsWith('clean') ? 'at most ' : 'at least '}${pct(x.bar)}</td><td class="${x.pass ? 'pass' : 'fail'}">${x.pass ? 'PASS' : 'FAIL'}</td></tr>`).join('');
    const allPass = [...d.heldOut.verdict, ...d.tuned.verdict].every((x: V) => x.pass) && d.documented.every((x: { ok: boolean }) => x.ok);
    document.getElementById('main')!.innerHTML = `
    <h1>Scoreboard</h1>
    <p class="lead">How well does it work? The pass bars were written down <b>before</b> the first run. ${allPass ? '<span class="pass">Everything passes today.</span>' : '<span class="fail">Something fails — see below.</span>'}</p>
    <div class="card"><b>Read this first.</b> The damaged files are <b>made up</b>: a program copies the way Excel damages data. They are not files damaged by real Excel (none was available to build this). The real-files test below only checks false alarms, not catching. Real-world scores will be lower than these.</div>
    <h2>Catching damage</h2>
    <figure class="fig"><img src="./data/chart-recall.svg" alt="Bar chart: share of damaged cells caught per check, all above the 90 percent bar"><figcaption>Held-out set: ${d.heldOut.tables} damaged tables made with a seed that was never used while building the checks.</figcaption></figure>
    <h2>Raising false alarms</h2>
    <figure class="fig"><img src="./data/chart-false-alarms.svg" alt="Bar chart: files flagged among real public datasets and made-up clean tables"><figcaption>${d.real.files} real public datasets and ${d.heldOut.clean.tables} made-up clean tables.</figcaption></figure>
    <h2>The full table (held-out set)</h2>
    <div class="card scroll"><table class="f"><thead><tr><th>Check</th><th>Result</th><th>Bar</th><th></th></tr></thead><tbody>${verdictRows(d.heldOut.verdict)}</tbody></table></div>
    <div id="fixsec"></div>
    <h2>Real cases from the literature</h2>
    <div class="card scroll"><table class="f"><thead><tr><th>Spreadsheet shows</th><th>Gene was</th><th>Found?</th><th>Suggested</th></tr></thead><tbody>${d.documented.map((x: { shown: string; gene: string; ok: boolean; confidence: string; likely: string }) => `<tr><td class="mono">${esc(x.shown)}</td><td class="mono">${esc(x.gene)}</td><td class="${x.ok ? 'pass' : 'fail'}">${x.ok ? 'yes (' + x.confidence + ')' : 'NO'}</td><td class="mono">${esc(x.likely ?? '')}</td></tr>`).join('')}</tbody></table></div>
    <h2>Mistakes found along the way</h2>
    <p>Honest history, so you can see the tests are real:</p>
    <ul>${d.history.map((h: string) => `<li>${esc(h)}</li>`).join('')}</ul>
    <p class="why">Numbers come from <code>npm run bench</code> and are rebuilt on every release. Raw data: <a href="./data/scoreboard.json">scoreboard.json</a>.</p>`;
  })
  .then(() =>
    fetch('./data/fixbench.json')
      .then((r) => r.json())
      .then((f) => {
        const run = (r: { seed: number; tables: number; wrongBefore: number; wrongAutoAfter: number; wrongWithPersonAfter: number; cleanBroken: number; provenApplied: number; provenWrong: number; choiceOffered: number; choiceHadTruth: number; choiceGroups: number; pass: boolean }) =>
          `<tr><td>${r.seed}</td><td>${r.tables}</td><td>${r.wrongBefore.toLocaleString()}</td><td>${pct(r.wrongAutoAfter / r.wrongBefore)}</td><td>${pct(r.wrongWithPersonAfter / r.wrongBefore)}</td><td class="${r.cleanBroken === 0 ? 'pass' : 'fail'}">${r.cleanBroken}</td><td class="${r.provenWrong === 0 ? 'pass' : 'fail'}">${r.provenWrong} of ${r.provenApplied.toLocaleString()}</td><td>${r.choiceHadTruth.toLocaleString()} of ${r.choiceOffered.toLocaleString()}</td><td>${r.choiceGroups.toLocaleString()}</td></tr>`;
        document.getElementById('fixsec')!.innerHTML = `<h2>Fixing damage</h2>
        <p>The same made-up damage, then repaired. The question is simple: are there fewer wrong cells afterwards, and did any cell that was fine get broken? <b>A broken clean cell fails the release.</b></p>
        <div class="card scroll"><table class="f"><thead><tr><th>Seed</th><th>Tables</th><th>Wrong cells before</th><th>Still wrong after proven fixes</th><th>Still wrong after you answer the choices</th><th>Clean cells broken</th><th>Wrong "proven" fixes</th><th>Right answer among the options</th><th>Decisions needed</th></tr></thead><tbody>${f.runs.map(run).join('')}</tbody></table></div>
        <p class="why">What stays wrong is mostly cut-off IDs that need the source system. They are listed in the recovery list, not guessed.</p>`;
      })
      .catch(() => undefined),
  )
  .catch(() => {
    document.getElementById('main')!.innerHTML = '<h1>Scoreboard</h1><div class="err">Could not load the scoreboard data.</div>';
  });

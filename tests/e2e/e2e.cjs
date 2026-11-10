// End-to-end check in a real browser. Run: npm run build && npm run e2e
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..', '..');
const shots = process.env.SHOTS || '';
let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };

(async () => {
  const server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', '4799', '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const base = 'http://localhost:4799/';
  const browser = await chromium.launch();
  try {
    for (const [label, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      const loadReqs = [];
      page.on('request', (r) => loadReqs.push(r.url()));
      await page.goto(base + 'index.html');
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const foreign = loadReqs.filter((u) => !u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:'));
      check(foreign.length === 0, `${label}: page load fetches nothing from other websites, fonts included (${foreign.length})`);
      // record every request that happens from here on
      const requests = [];
      page.on('request', (r) => requests.push(r.url()));
      // upload a real file through the file picker, offline from here on
      await ctx.setOffline(true);
      await page.setInputFiles('#file', path.join(root, 'testbench/fixtures/gene-dates.xlsx'));
      await page.waitForSelector('.tiles', { timeout: 8000 });
      const external = requests.filter((u) => !u.startsWith(base) && !u.startsWith('blob:') && !u.startsWith('data:'));
      check(external.length === 0, `${label}: no external requests while analysing (${external.length})`);
      const tiles = await page.locator('.tile b').allInnerTexts();
      check(Number(tiles[1]) >= 4, `${label}: gene-dates.xlsx shows very-likely findings (${tiles.join(', ')})`);
      check((await page.locator('table.f tbody tr').count()) >= 4, `${label}: findings table has rows`);
      // the fix step, still offline
      await page.click('#prep');
      await page.waitForSelector('.boxes', { timeout: 8000 });
      const boxNums = await page.locator('.bx b').allInnerTexts();
      check(boxNums.length === 4 && Number(boxNums[0]) + Number(boxNums[1]) >= 4, `${label}: four boxes shown (${boxNums.join(', ')})`);
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#dp')]);
      const dlPath = await dl.path();
      check(dl.suggestedFilename().endsWith('.fixed.xlsx') && fs.statSync(dlPath).size > 1000, `${label}: fixed Excel file (original edited in place) downloads (${dl.suggestedFilename()})`);
      const [dcl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#dx')]);
      check(dcl.suggestedFilename().endsWith('.clean-copy.xlsx') && fs.statSync(await dcl.path()).size > 1000, `${label}: clean copy downloads (${dcl.suggestedFilename()})`);
      const [dlog] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#dl')]);
      const logText = fs.readFileSync(await dlog.path(), 'utf8');
      check(logText.includes('before') && /fixed|left as is/.test(logText), `${label}: change log downloads and lists the cells`);
      const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(ov2 <= 1, `${label}: fix screen has no sideways page scroll (${ov2}px)`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 1, `${label}: no sideways page scroll (${overflow}px)`);
      if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `${label}-results.png`), fullPage: true }); }
      await ctx.setOffline(false);
      // clean sample
      await page.click('[data-sample="clean.csv"]');
      await page.waitForFunction(() => document.querySelector('.empty'), null, { timeout: 8000 });
      check(true, `${label}: clean sample shows the no-damage message`);
      // bad file
      await page.setInputFiles('#file', { name: 'x.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('nope') });
      await page.waitForSelector('.err', { timeout: 8000 });
      check(true, `${label}: old .xls gives a clear error`);
      // other pages
      for (const p of ['how-it-works.html', 'scoreboard.html', 'study.html']) {
        await page.goto(base + p);
        await page.waitForLoadState('networkidle');
        check((await page.locator('h1').count()) === 1, `${label}: ${p} renders`);
        const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(o <= 1, `${label}: ${p} no sideways scroll (${o}px)`);
        if (shots) await page.screenshot({ path: path.join(shots, `${label}-${p.replace('.html', '')}.png`), fullPage: true });
      }
      if (label === 'desktop') {
        // CSV flow: choices, one decision settles identical cells, exports
        await page.goto(base + 'index.html');
        await page.waitForLoadState('networkidle');
        await page.click('[data-sample="customers.csv"]');
        await page.waitForSelector('#prep', { timeout: 8000 });
        await page.click('#prep');
        await page.waitForSelector('.boxes', { timeout: 8000 });
        await page.locator('details.grp summary').first().click();
        const [csvDl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#dc')]);
        const csvBytes = fs.readFileSync(await csvDl.path());
        check(csvDl.suggestedFilename().endsWith('.fixed.csv') && csvBytes[0] === 0xef && csvBytes[1] === 0xbb, `desktop: fixed CSV downloads with a UTF-8 mark (${csvDl.suggestedFilename()})`);
        const [recDl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#da')]);
        check(fs.readFileSync(await recDl.path(), 'utf8').includes('Audit report'), 'desktop: audit report downloads');
        // a big file: results and fixes must still arrive, and the page must stay responsive meanwhile
        const bigPath = path.join(root, 'testbench/workbooks/big.xlsx');
        if (fs.existsSync(bigPath)) {
          await page.goto(base + 'index.html');
          await page.waitForLoadState('networkidle');
          const t0 = Date.now();
          await page.evaluate(() => { window.__ticks = 0; setInterval(() => window.__ticks++, 50); });
          await page.setInputFiles('#file', bigPath);
          await page.waitForSelector('.tiles', { timeout: 120000 });
          await page.click('#prep');
          await page.waitForSelector('.boxes', { timeout: 120000 });
          const secs = (Date.now() - t0) / 1000;
          const ticks = await page.evaluate(() => window.__ticks);
          check(secs < 90, `desktop: 120,000-row file analysed and fixes prepared in ${secs.toFixed(1)}s`);
          check(ticks > secs * 4, `desktop: page stayed responsive while the big file worked (${ticks} timer ticks in ${secs.toFixed(1)}s)`);
        }
      }
      check(errors.length === 0, `${label}: no console errors ${errors.slice(0, 2).join(' | ')}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  process.exit(failed ? 1 : 0);
})();

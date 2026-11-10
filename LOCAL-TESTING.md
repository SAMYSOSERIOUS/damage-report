# Try it on your own computer first

You need one thing: **Node.js 22 LTS** (free, from nodejs.org). Node 18 does NOT work. Check with `node -v`; it should say v22 or higher. After installing, close and reopen PowerShell. Then open a terminal in the project folder.

## The quick way (2 minutes)

```
npm install
npm run local
```

Your browser opens the finished site. Drop a file on it, or press an example button.
Press Ctrl+C in the terminal to stop it.

## Want to change code and see it live?

```
npm run dev
```

Open the address it prints (usually http://localhost:5173). The page updates as you save.

## Run every check (what GitHub will run)

```
npx playwright install chromium     (once only, downloads a test browser)
npm run verify
```

This runs, in order: the unit tests, the production build, and the real-browser tests
(including "zero network requests while a file is checked", on desktop and phone sizes).
Everything should say PASS.

Optional: the scoreboard.
```
pip install pydataset
python3 -I scripts/make-real-data.py
npm run bench
```

## Things worth trying by hand

1. Press **Gene list (Excel)**. You should see 5 "very likely" and 1 "probably".
2. Press **A clean file**. You should see the "no sign of damage" message.
3. Open your own CSV or xlsx in the page. Check the cells it flags against your file.
4. Turn your Wi-Fi off, then drop a file. It still works, because nothing is sent anywhere.
5. Drop an old .xls file. You should get a clear message, not a crash.
6. Shrink the browser window to phone width. Nothing should scroll sideways.
7. In the terminal: `npm run scan -- yourfile.xlsx`.

## If something goes wrong

- `npm: command not found` → install Node.js first.
- Errors mentioning `EBADENGINE` or `ERR_UNKNOWN_FILE_EXTENSION` → your Node is too old (18 or lower). Install Node 22 LTS.
- `npm run e2e` says a browser is missing → run `npx playwright install chromium`.
- Page shows nothing when you double-click `index.html` → don't do that; use `npm run local`. Browsers block
  the page's scripts when it is opened as a plain file.

## After you push to GitHub

1. Create an empty repo on github.com (no README, no licence, nothing added).
2. In the project folder:
   ```
   git init
   git add .
   git commit -m "Damage Report"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/damage-report.git
   git push -u origin main
   ```
3. On GitHub: Settings → Pages → Source: **GitHub Actions**.
4. Open the **Actions** tab. Two runs start: CI (tests) and Deploy. Wait for green ticks (2 to 4 minutes).
5. Your site is at `https://YOUR-NAME.github.io/damage-report/`.
6. Test the live site like you tested locally: drop `examples/1_gene_list_damaged.xlsx`, then check the Scoreboard page.
7. A red cross in Actions? Click it, read the failed step, and send me the text.

## Testing the fix step by hand

1. `npm run local`, then open the page and drop `examples/7_customers_zip_and_ids.xlsx`.
2. Press **Prepare the fixes**. You should see green groups (ZIP codes confirmed by the State column, IDs with a rebuilt last digit) and a blue group (phone numbers that need your yes).
3. Press **Download fixed Excel file** and open it in Excel. Only the damaged cells changed; widths and colours are as before. Check that the ZIP column shows `02134`, not `2134`.
4. Try `examples/6_barcodes_lost_zeros.xlsx` and `examples/10_formulas_and_sheets.xlsx`. In the second, the formulas must still be formulas.
5. Please tell me about anything that looks wrong in real Excel. The patching has only been verified in LibreOffice.

Automatic checks: `npm test` (91 tests), `npm run fixbench`, `npm run bench`, `npm run build && npm run e2e`.
For the big-file test, first run `python3 -I scripts/make-test-workbooks.py` (needs `pip install openpyxl`).

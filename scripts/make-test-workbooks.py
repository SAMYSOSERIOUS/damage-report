"""Writes realistic damaged workbooks into testbench/workbooks/ (openpyxl). Run: python3 -I scripts/make-test-workbooks.py
The damage is written the way Excel stores it: dates as date-typed cells with a number format, long IDs as
numbers, lost zeros as numbers. Each file has a matching .truth.json with the original values of the damaged cells."""
import datetime as dt, json, random
from pathlib import Path
from openpyxl import Workbook
from openpyxl.utils.datetime import CALENDAR_MAC_1904

out = Path(__file__).resolve().parent.parent / "testbench" / "workbooks"
out.mkdir(parents=True, exist_ok=True)
rnd = random.Random(7)

def save(wb, name, truth):
    wb.save(out / name)
    (out / (name + ".truth.json")).write_text(json.dumps(truth, indent=1))

def ean13(body12):
    s = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(body12))
    return body12 + str((10 - s % 10) % 10)
def upc12(body11):
    s = sum(int(c) * (3 if i % 2 == 0 else 1) for i, c in enumerate(body11))
    return body11 + str((10 - s % 10) % 10)
def isbn10(body9):
    s = sum((10 - i) * int(c) for i, c in enumerate(body9))
    c = (11 - s % 11) % 11
    return body9 + ("X" if c == 10 else str(c))
def luhn(body):
    s = 0
    for i, ch in enumerate(reversed(body)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9: d -= 9
        s += d
    return body + str((10 - s % 10) % 10)

# 1. genes with real date cells (Excel style) ------------------------------------------------
def genes(name, epoch1904=False):
    wb = Workbook()
    if epoch1904: wb.epoch = CALENDAR_MAC_1904
    ws = wb.active; ws.title = "Genes"
    ws.append(["Gene", "Description", "Count"])
    plain = ["TP53", "BRCA1", "EGFR", "MYC", "KRAS", "AKT1", "PTEN", "RB1", "VEGFA", "IL6", "TNF", "GAPDH"]
    rows = [(g, "tumour suppressor or oncogene", i + 1) for i, g in enumerate(plain)]
    damaged = [("SEPT2", dt.date(2020, 9, 2), "d-mmm"), ("MARCH1", dt.date(2020, 3, 1), "d-mmm"),
               ("DEC1", dt.date(2020, 12, 1), "d-mmm"), ("OCT4", dt.date(2020, 10, 4), "d-mmm"),
               ("TAMM41", dt.date(1941, 1, 1), "mmm-yy"), ("SEPT7", dt.date(2020, 9, 7), "d-mmm")]
    truth = {}
    for g, d, fmt in damaged:
        rows.insert(rnd.randint(2, len(rows)), (d, "septin or membrane protein", rnd.randint(20, 90), fmt, g))
    r = 2
    for row in rows:
        if isinstance(row[0], dt.date):
            ws.append([row[0], row[1], row[2]])
            ws.cell(r, 1).number_format = row[3]
            truth[f"A{r}"] = row[4]
        else:
            ws.append(list(row))
        r += 1
    # a second round of damage: one gene saved as the date's serial number
    ws.append([43711, "septin", 5]); truth[f"A{r}"] = "SEPT4" if epoch1904 else "SEPT3"  # serial 43711 is 2019-09-03, or 2023-09-04 in the 1904 system
    save(wb, name, truth)
genes("genes_dates.xlsx")
genes("genes_dates_1904.xlsx", True)

# 2. barcodes / ISBN with lost leading zeros ----------------------------------------------------
wb = Workbook(); ws = wb.active; ws.title = "Products"
ws.append(["Barcode", "ISBN", "Product", "Price"])
truth = {}
for i in range(40):
    e = ean13("0" + "".join(str(rnd.randint(0, 9)) for _ in range(11))) if i % 2 == 0 else ean13("".join(str(rnd.randint(1, 9)) for _ in range(12)))
    isb = isbn10("0" + "".join(str(rnd.randint(0, 9)) for _ in range(8))) if i % 3 == 0 else isbn10("".join(str(rnd.randint(1, 9)) for _ in range(9)))
    r = i + 2
    be = int(e) if e.startswith("0") else e  # Excel turned a leading-zero code into a number
    if e.startswith("0"): truth[f"A{r}"] = e
    bi = int(isb) if (isb[0] == "0" and isb[-1] != "X") else isb
    if isb[0] == "0" and isb[-1] != "X": truth[f"B{r}"] = isb
    ws.append([be, bi, f"Item {i}", round(rnd.uniform(1, 90), 2)])
save(wb, "barcodes.xlsx", truth)

# 3. customers: city + ZIP + phone ------------------------------------------------------------
cities = [("Boston", "MA", "021"), ("Cambridge", "MA", "021"), ("Newark", "NJ", "071"), ("Hartford", "CT", "061"), ("Chicago", "IL", "606"), ("Denver", "CO", "802"), ("Portland", "ME", "041")]
wb = Workbook(); ws = wb.active; ws.title = "Customers"
ws.append(["Customer ID", "City", "State", "ZIP", "Phone"])
truth = {}
for i in range(80):
    c, st, pre = rnd.choice(cities)
    z = pre + "".join(str(rnd.randint(0, 9)) for _ in range(2))
    ph = "0" + "".join(str(rnd.randint(1, 9)) for _ in range(9)) if i % 4 == 0 else "".join(str(rnd.randint(1, 9)) for _ in range(10))
    r = i + 2
    cid = luhn("".join(str(rnd.randint(1, 9)) for _ in range(15)))
    cut = cid[:15] + "0"
    ws.append([int(cut) if i % 7 == 0 else int(cid), c, st, int(z) if z.startswith("0") else z, int(ph) if ph.startswith("0") else ph])
    if i % 7 == 0 and cut != cid: truth[f"A{r}"] = cid
    if z.startswith("0"): truth[f"D{r}"] = z
    if ph.startswith("0"): truth[f"E{r}"] = ph
save(wb, "customers_zip.xlsx", truth)

# 4. European numbers and thousands separators, stored as text ------------------------------
wb = Workbook(); ws = wb.active; ws.title = "Sales"
ws.append(["Item", "Amount", "Quantity"])
truth = {}
for i in range(30):
    v = round(rnd.uniform(100, 99999), 2)
    eu = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    ws.append([f"A{i}", eu, rnd.randint(1, 50)])
    truth[f"B{i+2}"] = f"{v:.2f}"
save(wb, "sales_eu_text.xlsx", truth)

# 5. several sheets, formulas, merged cell, booleans -----------------------------------------
wb = Workbook(); ws = wb.active; ws.title = "Orders 2024-Q1"
ws.append(["Order ID", "Qty", "Unit", "Total", "Shipped", "Date"])
for i in range(15):
    ws.append([f"{luhn(''.join(str(rnd.randint(1,9)) for _ in range(15)))[:15]}0" if i < 3 else 1000 + i, i + 1, 2.5, f"=B{i+2}*C{i+2}", bool(i % 2), dt.date(2024, 1, 1 + i)])
ws.merge_cells("H1:I1")
ws2 = wb.create_sheet("Notes"); ws2.append(["Note"]); ws2.append(["José"]); ws2.append(["Café"])
ws3 = wb.create_sheet("Empty")
save(wb, "multi_formulas.xlsx", {"formulas": 15})

# 6. a large file ------------------------------------------------------------------------------
wb = Workbook(write_only=True); ws = wb.create_sheet("Big")
ws.append(["Gene", "Id", "ZIP", "Value"])
genes_ok = ["TP53", "BRCA1", "EGFR", "MYC", "KRAS", "AKT1", "PTEN", "RB1"]
for i in range(120000):
    ws.append([genes_ok[i % 8] if i % 997 else dt.date(2020, 9, 2), 1234567890123450 + (i % 5) * 0 if i % 211 == 0 else 5000000000 + i, int("0" + str(i % 9999 + 100)) if i % 50 == 0 else "%05d" % (i % 99999), i * 0.5])
wb.save(out / "big.xlsx")
print("done", sorted(p.name for p in out.glob("*.xlsx")))

"""Create .xlsx test files with openpyxl, an independent writer, so the project's own xlsx reader is
tested against files it did not produce. Run: python3 -I testbench/fixtures/make_fixtures.py"""
import datetime as dt
from pathlib import Path
from openpyxl import Workbook

out = Path(__file__).resolve().parent

# 1) Gene list damaged the way Excel damages it: names stored as dates, plus one date saved and re-opened as a number.
wb = Workbook(); ws = wb.active; ws.title = "genes"
ws.append(["Gene", "Count"])
rows = [
    ("TP53", 120), ("BRCA1", 88), (dt.datetime(2020, 9, 2), 45),   # SEPT2  -> 2-Sep
    (dt.datetime(2020, 3, 1), 12), (dt.datetime(2020, 12, 1), 77),  # MARCH1 -> 1-Mar, DEC1 -> 1-Dec
    ("EGFR", 301), ("MYC", 55), ("KRAS", 19), ("AKT1", 64),
    (dt.datetime(2020, 10, 4), 23),                                 # OCT4   -> 4-Oct
    ("PTEN", 91), ("NRAS", 33), (dt.datetime(1941, 1, 1), 8),       # TAMM41 -> Jan-41
    ("CDK2", 40), ("RB1", 17), ("GAPDH", 500),
]
for i, (g, c) in enumerate(rows, start=2):
    ws.cell(row=i, column=1, value=g); ws.cell(row=i, column=2, value=c)
    if isinstance(g, dt.datetime):
        ws.cell(row=i, column=1).number_format = "mmm-yy" if g.year == 1941 else "d-mmm"
ws.cell(row=len(rows) + 2, column=1, value=44076)  # a mangled date saved and re-opened: 2 Sep 2020 as a number
ws.cell(row=len(rows) + 2, column=2, value=5)
wb.save(out / "gene-dates.xlsx")

# 2) Customer file: long IDs, lost zeros, text numbers, mixed dates, garbled text.
wb = Workbook(); ws = wb.active; ws.title = "customers"
ws.append(["Order ID", "ZIP", "Name", "Signup", "Amount"])
data = [
    (1234567890123450, "01234", "JosÃ© GarcÃ­a", "13/04/2021", 100),
    (2345678901234570, 2134, "Ana Silva", "04/13/2021", 250),
    (3456789012345680, "07030", "Marie Dupont", "25/12/2021", 75),
    (4567890123456790, 7030, "Li Wei", "12/25/2021", 310),
    (5678901234567890, "10001", "Tom Brown", "03/04/2021", 20),
    (6789012345678900, "02134", "Eva Novak", "05/06/2021", 90),
]
for r in data:
    ws.append(list(r))
ws.cell(row=8, column=5, value="1 200")  # a number stored as text
ws.cell(row=8, column=1, value=7890123456789010)
wb.save(out / "customers.xlsx")

# 3) Clean file with a genuine date column and ordinary numbers.
wb = Workbook(); ws = wb.active; ws.title = "clean"
ws.append(["Gene", "Sample date", "Value"])
for i, g in enumerate(["TP53", "BRCA1", "EGFR", "MYC", "KRAS", "AKT1", "PTEN", "NRAS"]):
    ws.append([g, dt.datetime(2023, 1 + i, 10 + i), 10.5 + i])
    ws.cell(row=i + 2, column=2).number_format = "yyyy-mm-dd"
wb.save(out / "clean.xlsx")
print("wrote", sorted(p.name for p in out.glob("*.xlsx")))

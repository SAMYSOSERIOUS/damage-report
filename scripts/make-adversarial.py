"""Odd but real-world workbooks, to try to break the reader, the fixer and the patcher. Run: python3 -I scripts/make-adversarial.py"""
import datetime as dt
from pathlib import Path
from openpyxl import Workbook
from openpyxl.worksheet.hyperlink import Hyperlink
out = Path(__file__).resolve().parent.parent / "testbench" / "workbooks"

def save(wb, name): wb.save(out / name)

# 1 title rows above the header, a total row below
wb = Workbook(); ws = wb.active; ws.title = "Report"
ws["A1"] = "Quarterly gene report"; ws["A2"] = "prepared by the lab"
ws.append([]); ws.append(["Gene", "Count", "Note"])
for g, c in [("TP53", 5), ("BRCA1", 7), ("EGFR", 2), ("MYC", 9), ("KRAS", 4), ("AKT1", 6)]: ws.append([g, c, "ok"])
ws.append([dt.date(2020, 9, 2), 3, "damaged"]); ws["A11"].number_format = "d-mmm"
ws.append(["Total", "=SUM(B5:B11)", ""])
save(wb, "adv_title_rows.xlsx")

# 2 data starts at C5, empty first columns
wb = Workbook(); ws = wb.active
ws["C5"] = "Customer ID"; ws["D5"] = "ZIP"; ws["E5"] = "State"
for i in range(12): ws.cell(6 + i, 3, 1000 + i); ws.cell(6 + i, 4, 2134 + i if i % 2 else "02134"); ws.cell(6 + i, 5, "MA")
save(wb, "adv_offset.xlsx")

# 3 errors, booleans, long text, unicode sheet name, hidden sheet, hyperlink
wb = Workbook(); ws = wb.active; ws.title = "Übersicht 🧪"
ws.append(["A", "B", "C", "D"])
ws.append(["=1/0", True, "x" * 40000, "José"]); ws.append(["=NA()", False, "", "Ã©"]); ws.append(["plain", None, "z", "ok"])
ws["C3"].hyperlink = "https://example.com"
h = wb.create_sheet("hidden"); h.sheet_state = "hidden"; h.append(["Gene"]); h.append([dt.date(2020, 10, 4)]); h["A2"].number_format = "d-mmm"
save(wb, "adv_misc.xlsx")

# 4 formats: percent, currency, time-only, datetime, text-format numbers
wb = Workbook(); ws = wb.active
ws.append(["Pct", "Money", "Time", "Stamp", "Code"])
for i in range(8):
    ws.append([0.1 * i, 1234.5 * i, dt.time(8, i), dt.datetime(2024, 5, 1 + i, 13, 30), str(1000 + i)])
for r in range(2, 10):
    ws.cell(r, 1).number_format = "0.0%"; ws.cell(r, 2).number_format = '"$"#,##0.00'; ws.cell(r, 3).number_format = "h:mm"; ws.cell(r, 4).number_format = "yyyy-mm-dd hh:mm"; ws.cell(r, 5).number_format = "@"
save(wb, "adv_formats.xlsx")

# 5 a clean gene list (no damage at all): must give zero proposals
wb = Workbook(); ws = wb.active; ws.append(["Gene", "Description"])
for g in ["TP53", "BRCA1", "EGFR", "MYC", "KRAS", "AKT1", "SEPTIN2", "MARCHF1", "DELEC1", "POU5F1", "TAMM41", "GAPDH"]: ws.append([g, "clean"])
save(wb, "adv_clean_genes.xlsx")

# 6 single column, headers only, empty workbook
wb = Workbook(); ws = wb.active; ws.append(["Only"]); [ws.append([i]) for i in range(10)]
ws2 = wb.create_sheet("HeadersOnly"); ws2.append(["a", "b", "c"]); wb.create_sheet("Blank")
save(wb, "adv_tiny.xlsx")

# 7 many genes: every month word, dates in several formats, both date systems side by side
wb = Workbook(); ws = wb.active; ws.append(["Symbol", "Name"])
base = ["TP53", "BRCA1", "EGFR", "MYC", "KRAS", "AKT1", "PTEN"]
for b in base: ws.append([b, "x"])
for d, f in [(dt.date(2020, 3, 1), "d-mmm"), (dt.date(2020, 3, 1), "dd-mmm-yy"), (dt.date(2020, 12, 1), "m/d/yyyy"), (dt.datetime(2020, 9, 2, 0, 0), "d-mmm")]:
    ws.append([d, "x"]); ws.cell(ws.max_row, 1).number_format = f
save(wb, "adv_gene_formats.xlsx")
print("ok")

"""Build src/data/genes.json from the HGNC symbol table that ships with the R package HGNChelper.

Input : data/hgnc.table.rda   (copied from github.com/waldronlab/HGNChelper, data/hgnc.table.rda)
Output: src/data/genes.json   { approved: [...], vulnerable: [{s, a, m, n}, ...], source: {...} }

approved   = every HGNC approved gene symbol (used to decide a column holds gene names)
vulnerable = every symbol (approved, previous or alias) shaped like <month word><1-2 digits>, e.g. SEPT2, MARCH1, AGO2.
             s = symbol, a = approved symbol it maps to, m = possible month numbers (1-12), n = the number.
"""
import json, re, sys, unicodedata, warnings
from pathlib import Path
warnings.filterwarnings("ignore")

root = Path(__file__).resolve().parent.parent
months = json.loads((root / "data" / "months.json").read_text(encoding="utf-8"))
# Two inputs are supported:
#   (default)               data/hgnc.table.rda from the R package HGNChelper (GPL)
#   --hgnc <file.txt>       the official HGNC "hgnc_complete_set.txt" (CC0), columns: symbol, alias_symbol, prev_symbol
if "--hgnc" in sys.argv:
    import csv
    src = Path(sys.argv[sys.argv.index("--hgnc") + 1])
    syms, apps, kinds = [], [], []
    with src.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            if row.get("status", "Approved") not in ("Approved", ""):
                continue
            a = row["symbol"].strip()
            prev = [x.strip('"').strip() for x in row.get("prev_symbol", "").split("|") if x.strip('"').strip()]
            alias = [x.strip('"').strip() for x in row.get("alias_symbol", "").split("|") if x.strip('"').strip()]
            for s, k in [(a, "c")] + [(x, "p") for x in prev] + [(x, "a") for x in alias]:
                syms.append(s)
                apps.append(a)
                kinds.append(k)
    table = {"Symbol": syms, "Approved.Symbol": apps, "Kind": kinds}
    via = "official HGNC complete set (hgnc_complete_set.txt)"
    note = "HGNC data is released under CC0 (https://www.genenames.org/about/license/). Attribution is requested, not required."
else:
    import rdata  # only needed for the old HGNChelper path
    table = rdata.read_rda(str(root / "data" / "hgnc.table.rda"))["hgnc.table"]
    via = "R package HGNChelper 0.8.16 (data/hgnc.table.rda)"
    note = "Gene data originates from HGNC (genenames.org, CC0). This copy was taken through HGNChelper (GPL >= 2). See DATA-NOTICE.md."

def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()

# token -> set of month numbers
tok = {}
for names in months["languages"].values():
    for i, name in enumerate(names, start=1):
        for k in range(3, len(name) + 1):
            tok.setdefault(name[:k], set()).add(i)
for t, m in months["extraAbbreviations"].items():
    tok.setdefault(t, set()).add(m)

approved = sorted({str(x).strip() for x in table["Approved.Symbol"] if str(x).strip()})
kind_of = {}
_rank = {"c": 0, "p": 1, "a": 2}
for s_, a_, k_ in zip(table["Symbol"], table["Approved.Symbol"], table.get("Kind", ["a"] * len(table["Symbol"]))):
    key = (str(s_).strip(), str(a_).strip())
    if key not in kind_of or _rank[k_] < _rank[kind_of[key]]:
        kind_of[key] = k_
pairs = set(kind_of)
rx = re.compile(r"^([A-Za-z]{3,})([1-9]\d?)$")
vul = []
for s, a in sorted(pairs):
    orig = s
    m = rx.match(s)
    if not m:
        continue
    t = fold(m.group(1))
    if t in tok:
        # Human gene symbols are written in capitals. The official file also holds a few mixed-case
        # aliases (Oct4, Mar1, Set1, Huh7). Match them the way people type them: in capitals.
        if s != a:
            s = s.upper()
        vul.append({"s": s, "a": a, "m": sorted(tok[t]), "n": int(m.group(2)), "k": kind_of[(orig, a)]})

out = {
    "source": {
        "what": "HGNC approved symbols and previous symbols/aliases",
        "via": via,
        "note": note,
    },
    "approved": approved,
    "vulnerable": vul,
}
dest = root / "src" / "data" / "genes.json"
dest.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
print("approved symbols:", len(approved), "| month-word symbols:", len(vul), "| bytes:", dest.stat().st_size)
for want in ["SEPT2", "SEPTIN2", "MARCH1", "MARCHF1", "DEC1", "OCT4", "AGO2", "MEI1", "TAMM41", "SEP15", "MAR1"]:
    hit = [v for v in vul if v["s"] == want]
    print(want, "approved" if want in approved else "-", hit[:1])

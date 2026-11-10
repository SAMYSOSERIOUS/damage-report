# Data notice

`src/data/genes.json` is built from the official **HGNC complete set** (`hgnc_complete_set.txt`,
https://www.genenames.org/download/) with `npm run genes -- --hgnc hgnc_complete_set.txt`.

HGNC data is released under **CC0** (Creative Commons Zero), so any reuse is permitted. Attribution to
HGNC (HUGO Gene Nomenclature Committee) is requested, not required, and given here.

Nothing in this repository depends on the R package HGNChelper (GPL). The older build path that read
`data/hgnc.table.rda` still exists in `scripts/build-gene-data.py` but is not used for the shipped file.

Small choice made when building: mixed-case aliases in the official file (Oct4, Mar1, Set1) are stored in
capitals, because that is how gene names are typed in spreadsheets. The resulting list is identical to the
earlier one (108 month-like names).

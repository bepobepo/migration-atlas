"""Build the resident-origin snapshots offline from the pinned UN DESA workbook.

Run python scripts/import_migrant_stock.py from any directory (requires openpyxl).
"""
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "reference" / "stock"
OUTPUT = ROOT / "dist" / "data" / "residents"
YEARS = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024]
WORLD, OTHERS = 900, 2003


def basis(flags):
    codes = set(flags.split())
    definitions = []
    if {"B", "C"} <= codes:
        definitions.append("UN DESA used both country-of-birth and citizenship data.")
    elif "B" in codes:
        definitions.append("UN DESA used country-of-birth data.")
    elif "C" in codes:
        definitions.append("UN DESA used foreign citizenship to measure migrant origin.")
    elif "I" in codes:
        definitions.append("UN DESA imputed the estimates because country data were unavailable.")
    else:
        raise ValueError(f"Unknown country data type: {flags}")
    if "R" in codes:
        definitions.append("The estimates incorporate additional UN refugee or displacement figures.")
    return " ".join(definitions)


def source_text(value):
    return " ".join(value.replace("Ã©", "é").replace("Ã§", "ç").split())


def export():
    meta = json.loads((SOURCE / "provenance.json").read_text())
    file = SOURCE / meta["file"]
    if hashlib.sha256(file.read_bytes()).hexdigest() != meta["sha256"]:
        raise ValueError("The UN workbook differs from the pinned source.")
    with file.open("rb") as stream:
        workbook = load_workbook(stream, read_only=True, data_only=True)
        try:
            result = extract(workbook, meta)
        finally:
            workbook.close()

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for code, record in result.items():
        path = OUTPUT / f"{code}.json"
        path.with_suffix(".tmp").write_text(
            json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        path.with_suffix(".tmp").replace(path)
    return result


def extract(workbook, meta):
    catalog = json.loads((ROOT / "dist/data/countries.json").read_text())
    selected = {k for k, v in catalog.items() if v["hasData"]}
    lookup = {int(k): v for k, v in json.loads((SOURCE / "m49-iso3.json").read_text()).items()}
    # UN DESA reports the Channel Islands as one area with no single ISO3 code.
    lookup[830] = "M49-830"
    notes = {
        key: source_text(value)
        for key, value in workbook["Migrant notes"].iter_rows(max_col=2, values_only=True)
        if isinstance(key, int)
    }
    rows = iter(workbook[meta["sheet"]].iter_rows(max_col=15, values_only=True))
    header = [next(rows) for _ in range(11)]
    if (header[7][7] != "International migrant stock at mid-year, both sexes combined"
            or list(header[10][7:]) != YEARS):
        raise ValueError("Unexpected UN workbook columns.")

    by_destination = defaultdict(dict)
    for row in rows:
        _, _, footnote, flags, dest_id, origin_name, orig_id, *values = row
        dest = lookup.get(dest_id)
        if dest not in selected or orig_id >= 900 and orig_id not in (WORLD, OTHERS):
            continue
        if orig_id in by_destination[dest]:
            raise ValueError(f"Duplicate origin {orig_id} for {dest}")
        # This release has integers and one blank in these columns. Keep the
        # blank null. Fail visibly if a future release adds suppression symbols.
        if any(v is not None and (type(v) is not int or v < 0) for v in values):
            raise ValueError(f"Unexpected migrant stock value for {dest}, {orig_id}")
        by_destination[dest][orig_id] = (origin_name, flags, footnote, values, dest_id)

    if set(by_destination) != selected:
        raise ValueError(f"Missing destinations: {sorted(selected - set(by_destination))}")
    source = {k: meta[k] for k in ("name", "year", "url", "workbookUrl", "licenseUrl")}
    result = {}
    for dest, origins in by_destination.items():
        _, flags, footnote, total, dest_id = origins.pop(WORLD)
        other = origins.pop(OTHERS)[3]
        named = []
        for orig_id, (un_name, _, _, values, _) in sorted(origins.items()):
            code = lookup[orig_id]
            name = catalog[code]["name"] if code in catalog else source_text(un_name).rstrip("*").strip()
            named.append({"code": code, "name": name, "values": values})
        for index, grand_total in enumerate(total):
            known_sum = sum(x["values"][index] for x in named if x["values"][index] is not None)
            # This equality holds in the pinned release even for the missing
            # bilateral observation. Never use the residual to infer its value.
            if known_sum + other[index] != grand_total:
                raise ValueError(f"Origin sum differs from UN total for {dest}, {YEARS[index]}")
        coverage = "The UN lists individually reported origins and an “Other origins” group. An unlisted origin has no separate published figure."
        if footnote:
            coverage += " " + notes[footnote]
        result[dest] = {
            "destination": dest,
            "name": catalog[dest]["name"],
            "years": YEARS,
            "total": total,
            "origins": named,
            "other": other,
            "basis": basis(flags),
            "coverageNote": coverage,
            "source": source,
        }
    return result


if __name__ == "__main__":
    results = export()
    print(f"Exported {len(results)} destinations and {sum(len(r['origins']) for r in results.values())} named bilateral series.")

"""Export annual UK totals from the pinned ONS Table 1. Requires openpyxl."""

import argparse
import hashlib
import json
import re
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "reference/official/ons"
OUTPUT = ROOT / "dist/data/official/uk-national.json"
MEASURES = {"Immigration": "immigration", "Emigration": "emigration", "Net migration": "net"}


def extract():
    provenance = json.loads((REFERENCE / "source.json").read_text())
    path = REFERENCE / provenance["filename"]
    if hashlib.sha256(path.read_bytes()).hexdigest() != provenance["sha256"]:
        raise ValueError("ONS workbook does not match its pinned checksum")

    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        rows = workbook["1"].iter_rows(min_row=6, max_col=3, values_only=True)
        header = [heading.splitlines()[0] for heading in next(rows)]
        if header != ["Flow", "Period", "All Nationalities"]:
            raise ValueError(f"Unexpected ONS columns: {header}")

        years = {}
        for measure, period, value in rows:
            # Other rows describe overlapping 12-month windows ending in March, June or September.
            december = re.fullmatch(r"YE Dec (\d{2})((?: [RP])*)", period or "")
            if not december:
                continue
            year = 2000 + int(december[1])
            if year > 2024:  # The shared atlas timeline ends in 2024.
                continue
            status = december[2].split()
            entry = years.setdefault(year, {"year": year, "revised": "R" in status})
            if entry["revised"] != ("R" in status) or "P" in status:
                raise ValueError(f"Unexpected publication flags for {year}")
            field = MEASURES[measure]
            if field in entry or type(value) is not int:
                raise ValueError(f"Invalid or duplicate official value for {field} in {year}")
            if field != "net" and value < 0:
                raise ValueError(f"Negative gross migration for {year}")
            entry[field] = value
    finally:
        workbook.close()

    if set(years) != set(range(2012, 2025)):
        raise ValueError("Incomplete year-ending December coverage")
    for year, entry in years.items():
        if not set(MEASURES.values()) <= entry.keys():
            raise ValueError(f"Missing national measure for {year}")
        # ONS rounds the independently calculated measures to the nearest thousand.
        if abs(entry["immigration"] - entry["emigration"] - entry["net"]) > 1000:
            raise ValueError(f"National estimates exceed the rounding tolerance for {year}")

    return {"source": provenance["source"], "years": [years[y] for y in sorted(years)]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the published export without writing")
    args = parser.parse_args()
    payload = extract()
    if args.check:
        if payload != json.loads(OUTPUT.read_text()):
            raise SystemExit("The UK national display data differ from the pinned ONS workbook")
        print("Verified 39 annual UK measures for 2012–2024 against ONS Table 1.")
    else:
        OUTPUT.write_text(json.dumps(payload, indent=2) + "\n")

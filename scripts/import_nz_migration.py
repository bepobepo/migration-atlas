"""Verify Stats NZ December national figures against twelve final monthly observations."""
import argparse
import csv
import gzip
import hashlib
import html
import io
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "reference/official/stats-nz"
OUTPUT = ROOT / "dist/data/national/nz.json"
PERIOD = range(2001, 2025)
MEASURES = {"Arrivals": "immigration", "Departures": "emigration", "Net": "net"}


def raw(source, prefix):
    content = gzip.decompress((REFERENCE / source[prefix + "File"]).read_bytes())
    if hashlib.sha256(content).hexdigest() != source[prefix + "Sha256"]:
        raise ValueError("Checksum mismatch for Stats NZ " + prefix)
    return content.decode("utf-8-sig")


def annual_release(source):
    # The official release embeds graph source tables as JSON strings in HTML.
    page = html.unescape(raw(source, "release"))
    tables = set()
    for match in re.finditer(r'"GraphCsvData":("(?:\\.|[^"\\])*")', page):
        table = json.loads(match[1])
        if table.startswith('"Year ended","Dec-2001"') and [row[0] for row in csv.reader(io.StringIO(table))] == [
            "Year ended", "Migrant arrivals", "Migrant departures", "Net migration"
        ]:
            tables.add(table)
    if len(tables) != 1:
        raise ValueError("Expected one distinct annual migration chart")
    rows = list(csv.reader(io.StringIO(tables.pop())))
    if [row[0] for row in rows] != ["Year ended", "Migrant arrivals", "Migrant departures", "Net migration"]:
        raise ValueError("Unexpected annual national gross/net series")
    if len({len(row) for row in rows}) != 1:
        raise ValueError("Mismatched annual period count")
    data = {}
    for month, arrivals, departures, net in zip(*(row[1:] for row in rows)):
        if not month.startswith("Dec-"):
            continue
        year = int(month[4:])
        if year in PERIOD:
            if year in data:
                raise ValueError("Duplicate December period")
            data[year] = dict(zip(MEASURES, map(int, (arrivals, departures, net))))
    if set(data) != set(PERIOD):
        raise ValueError("Incomplete December series")
    return data


def verify_months(source, annual):
    months = {}
    for row in csv.DictReader(io.StringIO(raw(source, "monthly"))):
        if row["age"] != "TOTAL" or row["sex"] != "TOTAL" or row["passenger_type"] != "Long-term migrant":
            continue
        year, month = map(int, row["year_month"].split("-"))
        if year not in PERIOD:
            continue
        key = (year, month, row["direction"])
        if key in months or row["status"] != "Final" or row["direction"] not in MEASURES:
            raise ValueError(f"Unexpected monthly observation {key}")
        months[key] = int(row["estimate"])
    if len(months) != len(PERIOD) * 12 * len(MEASURES):
        raise ValueError("Incomplete monthly series")
    differences = {}
    for year, values in annual.items():
        for direction, published in values.items():
            monthly_sum = sum(months[year, m, direction] for m in range(1, 13))
            if published != monthly_sum:
                differences[year, direction] = (published, monthly_sum)
        if values["Arrivals"] - values["Departures"] != values["Net"]:
            raise ValueError(f"Published migration figures disagree in {year}")
    expected = {(2022, "Departures"): (94515, 94516), (2022, "Net"): (24875, 24874)}
    if differences != expected:
        raise ValueError(f"Unexpected discrepancy between Stats NZ releases: {differences}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((REFERENCE / "source.json").read_text())
    annual = annual_release(manifest)
    verify_months(manifest, annual)
    source = {key: manifest[key] for key in ("name", "url", "definition", "retrieved", "releaseDate", "pairGroup")}
    years = {str(year): {MEASURES[direction]: {"value": value, "source": "nz_outcomes", "flags": "e"}
                         for direction, value in values.items()} for year, values in annual.items()}
    data = {"sources": {"nz_outcomes": source}, "countries": {"NZL": years}}
    if args.check:
        if data != json.loads(OUTPUT.read_text()):
            raise SystemExit("New Zealand export differs from the verified release")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(data, separators=(",", ":"), sort_keys=True) + "\n")
    print(f"Verified {len(years)*3} Stats NZ annual figures against 864 final monthly observations.")


if __name__ == "__main__":
    main()

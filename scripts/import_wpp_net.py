"""Extract WPP annual national net migration. --upstream verifies the pinned original CSV."""
import argparse
import csv
import gzip
import hashlib
import io
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "reference/official/un-wpp"
OUTPUT = ROOT / "dist/data/national/net.json"
FIELDS = ("LocID", "ISO3_code", "LocTypeName", "Variant", "Time", "NetMigrations")
YEARS = range(1950, 2025)


def original_extract(path, expected_digest):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected_digest:
        raise ValueError("The original WPP file differs from the pinned release")
    selected = io.StringIO(newline="")
    writer = csv.DictWriter(selected, fieldnames=FIELDS, lineterminator="\n", extrasaction="ignore")
    writer.writeheader()
    with gzip.open(path, "rt", encoding="utf-8-sig", newline="") as raw:
        for row in csv.DictReader(raw):
            if row["LocTypeName"] == "Country/Area" and int(row["Time"]) in YEARS:
                writer.writerow(row)
    return selected.getvalue().encode()


def export(extract, source):
    atlas = json.loads((ROOT / "dist/data/countries.json").read_text())
    countries = {}
    reader = csv.DictReader(io.StringIO(extract.decode(), newline=""))
    for row in reader:
        if row["LocTypeName"] != "Country/Area" or row["Variant"] != "Medium":
            raise ValueError("Unexpected population type or variant")
        code = row["ISO3_code"]
        if code not in atlas:
            continue
        year = int(row["Time"])
        values = countries.setdefault(code, {})
        if year in values or year not in YEARS:
            raise ValueError(f"Unexpected year for {code}: {year}")
        persons = Decimal(row["NetMigrations"]) * 1000
        if not persons.is_finite() or persons != persons.to_integral_value():
            raise ValueError(f"Expected whole persons for {code} in {year}")
        values[year] = int(persons)
    for code, values in countries.items():
        if set(values) != set(YEARS):
            raise ValueError(f"Incomplete WPP time series for {code}")
    return {"source": source, "countries": countries, "projectionYears": [2024]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", type=Path, help="Full original WPP CSV.gz to verify or rebuild the small archive")
    parser.add_argument("--check", action="store_true", help="Check the published data without writing")
    args = parser.parse_args()
    provenance = json.loads((REFERENCE / "source.json").read_text())
    archive = REFERENCE / provenance["archive"]
    if args.upstream:
        extract = original_extract(args.upstream, provenance["originalSha256"])
    else:
        extract = gzip.decompress(archive.read_bytes())
    if hashlib.sha256(extract).hexdigest() != provenance["extractSha256"]:
        raise ValueError("Net migration source extract failed its checksum")
    data = export(extract, provenance["source"])
    if args.check:
        if args.upstream and extract != gzip.decompress(archive.read_bytes()):
            raise ValueError("Pinned extract differs from the original source")
        expected = json.dumps(data, separators=(",", ":"), sort_keys=True)
        if json.loads(expected) != json.loads(OUTPUT.read_text()):
            raise ValueError("National net export differs from the pinned source")
    else:
        if args.upstream:
            archive.write_bytes(gzip.compress(extract, mtime=0))
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(data, separators=(",", ":"), sort_keys=True) + "\n")
    print(f"Verified {len(data['countries'])} WPP country series, {YEARS.start}–{YEARS.stop - 1}.")


if __name__ == "__main__":
    main()

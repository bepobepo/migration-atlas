"""Build Canadian calendar-year net migration from Statistics Canada's quarterly components."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "reference/official/statcan"
OUTPUT = ROOT / "dist/data/national/canada.json"
COMPONENTS = ("Immigrants", "Net non-permanent residents", "Net emigration")


def canadian_values(reference, table, category=None):
    info = reference["files"][table]
    path = REFERENCE / info["filename"]
    if hashlib.sha256(path.read_bytes()).hexdigest() != info["sha256"]:
        raise ValueError(f"Statistics Canada archive checksum mismatch for {table}")
    values = {}
    with ZipFile(path) as archive, archive.open(table + ".csv") as content:
        for row in csv.DictReader(io.TextIOWrapper(content, encoding="utf-8-sig")):
            if row["GEO"] != "Canada" or not row["VALUE"]:
                continue
            if (row["DGUID"] != "2021A000011124" or row["SCALAR_FACTOR"] != "units"
                    or row["UOM"] not in {"Persons", "Number"} or row["DECIMALS"] != "0" or row["STATUS"]):
                raise ValueError(f"Unexpected national units, geography, precision or status in {table}")
            key = (row["REF_DATE"], row[category]) if category else row["REF_DATE"]
            if key in values:
                raise ValueError(f"Duplicate {table} value for {key}")
            values[key] = int(row["VALUE"])
    return values


def quarters(year):
    return [f"{year}-{month:02d}" for month in (1, 4, 7, 10)]


def generate():
    reference = json.loads((REFERENCE / "provenance.json").read_text())
    components = canadian_values(reference, "17100040", "Components of population growth")
    result = {}
    for year in range(1950, 2025):
        periods = quarters(year)
        if any((quarter, measure) not in components for quarter in periods for measure in COMPONENTS):
            continue
        incoming, temporary_balance, net_emigration = (
            sum(components[quarter, measure] for quarter in periods) for measure in COMPONENTS
        )
        flags = ["estimated"]
        if year in (1991, 2016):
            flags.append("net emigration method changed during the year")
        if year >= 2023:
            flags.append("includes updated postcensal estimates")
        result[year] = {"net": {"value": incoming + temporary_balance - net_emigration,
                                "source": "statcan", "kind": "derived", "flags": flags}}
    if sorted(result) != list(range(1972, 2025)):
        raise ValueError("Unexpected coverage of complete calendar years in the pinned release")

    # Since the July 2021 census base, population change less natural increase
    # provides an independent balance without an intercensal residual adjustment.
    population = canadian_values(reference, "17100009")
    vital = canadian_values(reference, "17100059", "Estimates")
    for year in (2022, 2023, 2024):
        change = population[f"{year+1}-01-01"] - population[f"{year}-01-01"]
        natural = sum(vital[q, "Births"] - vital[q, "Deaths"] for q in quarters(year))
        if result[year]["net"]["value"] != change - natural:
            raise ValueError(f"Net migration does not reconcile to the national demographic balance for {year}")

    source = {
        "name": "Statistics Canada · Quarterly demographic estimates",
        "url": reference["files"]["17100040"]["tableUrl"],
        "methodologyUrl": reference["methodologyUrl"],
        "releaseDate": reference["releaseDate"],
        "definition": "Calendar-year net international migration, calculated from all four quarters. "
                      "Statistics Canada adds immigrants and the net change in non-permanent residents, "
                      "then subtracts net emigration. Immigration in this formula includes permanent "
                      "residence granted to people already living in Canada.",
    }
    return {"sources": {"statcan": source}, "countries": {"CAN": result}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare the saved export to the original tables")
    expected = json.dumps(generate(), ensure_ascii=False, separators=(",", ":")) + "\n"
    if parser.parse_args().check:
        if OUTPUT.read_text() != expected:
            raise SystemExit("Published Canada net figures differ from the archived source")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(expected)
    print("Verified 53 Canadian calendar years and reconciled 2022–2024 to the national demographic balance.")

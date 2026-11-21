"""Audit every resident stock record against the original UN workbook, offline."""
import csv
import hashlib
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist/data"
REF = ROOT / "reference/stock"
YEARS = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024]


def test_resident_exports():
    source = json.loads((REF / "provenance.json").read_text())
    workbook = REF / source["file"]
    assert hashlib.sha256(workbook.read_bytes()).hexdigest() == (
        "0e10179d05186041a65cf5c6200943b2231701f9c1fd33cbbe21d23b8ea47316"
    )
    codes = {int(k): v for k, v in json.loads((REF / "m49-iso3.json").read_text()).items()}
    codes[830] = "M49-830"
    atlas = json.loads((DATA / "countries.json").read_text())
    destinations = {code for code, row in atlas.items() if row["hasData"]}
    records = {p.stem: json.loads(p.read_text()) for p in (DATA / "residents").glob("*.json")}
    assert destinations == records.keys() and len(destinations) == 194
    population_file = REF / source["population"]["file"]
    assert hashlib.sha256(population_file.read_bytes()).hexdigest() == source["population"]["sha256"]
    with population_file.open() as stream:
        populations = {(r["ISO3_code"], int(r["Time"])): Decimal(r["TPopulation1July"]) * 1000
                       for r in csv.DictReader(stream)}
    assert len(populations) == len(destinations) * len(YEARS)

    actual = {}
    for dest, row in records.items():
        assert row["destination"] == dest and row["name"] == atlas[dest]["name"]
        assert row["source"]["year"] == 2024 and row["source"]["url"] == source["url"]
        assert row["years"] == YEARS and row["basis"] and row["coverageNote"]
        assert row["label"] and row["populationSource"]["projectionYears"] == [2024]
        assert row["population"] == [populations[dest, y] for y in YEARS]
        assert len({r["code"] for r in row["origins"]}) == len(row["origins"])
        for origin in row["origins"]:
            assert origin["name"] and origin["code"] != dest
            if origin["code"] in atlas:
                assert origin["name"] == atlas[origin["code"]]["name"]
            actual[dest, origin["code"]] = origin["values"]
        actual[dest, "World"] = row["total"]
        actual[dest, "Others"] = row["other"]
        for i, total in enumerate(row["total"]):
            subtotal = sum(r["values"][i] for r in row["origins"] if r["values"][i] is not None)
            assert subtotal + row["other"][i] == total, (dest, YEARS[i])

    original = {}
    wb = load_workbook(workbook, read_only=True, data_only=True)
    notes = {k: " ".join(v.replace("Ã©", "é").replace("Ã§", "ç").split())
             for k, v in wb["Migrant notes"].iter_rows(max_col=2, values_only=True) if isinstance(k, int)}
    method_labels = {
        "B": "Residents born abroad", "B R": "Migrant residents (birthplace-based estimate)",
        "C": "Residents with foreign citizenship", "C R": "Migrant residents (citizenship-based estimate)",
        "C B R": "International migrant residents", "I R": "Estimated international migrant residents",
    }
    counts = Counter()
    for r in wb["Table 1"].iter_rows(min_row=12, max_col=15, values_only=True):
        dest = codes.get(r[4])
        if dest in destinations:
            record = records[dest]
            assert record["sourceDataType"] == r[3] and record["label"] == method_labels[r[3]], dest
            assert record["countryNote"] == notes.get(r[2]), dest
            assert ("supplements this estimate" in record["basis"]) == ("R" in r[3].split()), dest
            if r[6] == 900:
                counts[r[3]] += 1
            if r[6] in codes:
                key = dest, codes[r[6]]
            elif r[5] in ("World", "Others"):
                key = dest, r[5]
            else:
                continue
            assert key not in original
            original[key] = list(r[7:])
    wb.close()
    assert counts == {"B": 38, "B R": 109, "C": 14, "C R": 28, "C B R": 2, "I R": 3}

    assert actual.keys() == original.keys()
    for pair, values in original.items():
        assert actual[pair] == values, pair
    assert actual["HUN", "ARE"][0] is None
    assert actual["FRA", "DZA"][-1] == 1_405_235
    assert actual["DZA", "FRA"][-1] == 563
    assert actual["BEL", "World"][-1] == 2_349_032
    assert actual["BEL", "NLD"][-1] == 136_488
    assert actual["ISR", "World"][-1] == 2_091_569 and populations["ISR", 2024] == 9_387_021
    assert any(0 in vals for vals in actual.values())
    assert "citizenship" in records["JPN"]["basis"]
    assert "East Jerusalem" in records["PSE"]["countryNote"]
    print(f"Verified {len(destinations)} destinations and {len(actual) * len(YEARS):,} cells against UN DESA Table 1.")


if __name__ == "__main__":
    test_resident_exports()

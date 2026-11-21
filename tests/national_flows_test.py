"""Verify the values and source references that reach the national overview."""
import csv
from collections import Counter, defaultdict
from decimal import Decimal
import gzip
import json
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist/data"
NATIONAL = DATA / "national"
REFERENCE = ROOT / "reference/official"
GROSS = ("immigration", "emigration")


def read(file):
    return json.loads(file.read_text())


def eurostat_cell(dataset, geo, year, age_definition):
    coords = dict(freq="A", age="TOTAL", sex="T", unit="NR", partner="TOTAL",
                  citizen="TOTAL", agedef=age_definition, geo=geo, time=str(year))
    cell = 0
    for dimension, size in zip(dataset["id"], dataset["size"]):
        index = dataset["dimension"][dimension]["category"]["index"]
        cell = cell * size + index[coords[dimension]]
    return dataset["value"][str(cell)]


def verify_eurostat(series):
    datasets = {sid: json.load(gzip.open(REFERENCE / f"eurostat-national/{sid}.json.gz"))
                for sid in series["sources"]}
    codes = {code: country["alpha2"] for code, country in read(ROOT / "reference/un-m49.json").items()}
    codes.update(GRC="EL", GBR="UK")
    count = 0
    for code, years in series["countries"].items():
        for year, row in years.items():
            for field in GROSS:
                if field not in row:
                    continue
                obs = row[field]
                original = eurostat_cell(datasets[obs["source"]], codes[code], year, obs["ageDefinition"])
                assert original == obs["value"], (code, year, field, obs)
                count += 1

    # The releases used by map partners and national totals differ only for these
    # seven overlapping Portugal totals. Test the scope of revisions separately.
    older = read(DATA / "official/eurostat.json")["coverage"]
    revisions = set()
    for sid, field in (("eurostat_imm5prv", "immigration"), ("eurostat_emi3nxt", "emigration")):
        for key, old in older[sid]["reportedAllCountryTotals"].items():
            code, year = key.split(":")
            if 2008 <= int(year) <= 2024:
                new = series["countries"][code][year][field]["value"]
                if new != old["value"]:
                    revisions.add((code, year, field))
    expected = {("PRT", str(y), "immigration") for y in (2021, 2022, 2023)}
    expected.update(("PRT", str(y), "emigration") for y in (2021, 2022, 2023, 2024))
    assert revisions == expected, revisions.symmetric_difference(expected)
    return count


def verify_australia():
    workbook = load_workbook(REFERENCE / "historical-national/abs-310101-mar2026.xlsx", read_only=True, data_only=True)
    try:
        sheet = workbook["Data1"]
        labels = [str(col).split(";")[0].strip() for col in next(sheet.values)]
        columns = [labels.index(label) for label in ("Overseas Arrivals", "Overseas Departures", "Net Overseas Migration")]
        quarters = defaultdict(dict)
        for row in sheet.iter_rows(min_row=11, values_only=True):
            period = row[0]
            if 1982 <= period.year <= 2024:
                assert period.month not in quarters[period.year]
                quarters[period.year][period.month] = [Decimal(str(row[index])) * 1000 for index in columns]
    finally:
        workbook.close()
    # Recent calendar-year cells are published in persons at greater precision than Table 1.
    book = load_workbook(REFERENCE / "historical-national/abs-calendar-table13-mar2026.xlsx", read_only=True, data_only=True)
    try:
        rows = list(book["Table_13"].values)
    finally:
        book.close()
    national = rows[4].index("Australia")
    headings = ["OVERSEAS MIGRATION ARRIVALS", "OVERSEAS MIGRATION DEPARTURES", "NET OVERSEAS MIGRATION"]
    exact = {}
    for label, field in zip(headings, (*GROSS, "net")):
        start = next(i for i, row in enumerate(rows) if row[0] == label)
        for row in rows[start + 1:]:
            if str(row[0]) in headings:
                break
            if str(row[0]) in {str(y) for y in range(2020, 2025)} and type(row[national]) is int:
                key = int(row[0]), field
                assert key not in exact
                exact[key] = row[national]
    assert len(exact) == 15
    series = read(NATIONAL / "countries/AUS.json")["years"]
    for row in series:
        year = row["year"]
        if 1982 <= year <= 2024:
            assert set(quarters[year]) == {3, 6, 9, 12}
            for index, field in enumerate((*GROSS, "net")):
                annual = sum(value[index] for value in quarters[year].values())
                if year >= 2020:
                    assert abs(annual - exact[year, field]) <= 200, (year, field)
                    annual = exact[year, field]
                assert row[field]["value"] == annual and row[field]["kind"] == "published", (year, field)
    return len(quarters) * 3


def main():
    eurostat = read(NATIONAL / "eurostat.json")
    gross_count = verify_eurostat(eurostat)
    # The US 2004 citizenship table could exclude returning nationals.
    assert "immigration" not in eurostat["countries"].get("USA", {}).get("2004", {})
    aus_count = verify_australia()
    world = set(read(DATA / "countries.json"))
    wpp = {}
    with gzip.open(REFERENCE / "un-wpp/annual-net-migration.csv.gz", "rt", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            if row["ISO3_code"] not in world:
                continue
            key = row["ISO3_code"], int(row["Time"])
            persons = Decimal(row["NetMigrations"]) * 1000
            assert row["LocTypeName"] == "Country/Area" and persons == int(persons) and key not in wpp
            wpp[key] = int(persons)
    ons = {row["year"]: row for row in read(DATA / "official/uk-national.json")["years"]}
    assert world == {p.stem for p in (NATIONAL / "countries").glob("*.json")}
    assert world - {code for code, year in wpp} == {"ATA", "ATF", "CYN", "SOL"}
    assert len(wpp) == (len(world) - 4) * 75
    originals = {}
    for file in NATIONAL.glob("*.json"):
        collection = read(file)
        if "sources" not in collection or "countries" not in collection:
            continue
        for iso, years in collection["countries"].items():
            for date, values in years.items():
                for field in (*GROSS, "net"):
                    original = values.get(field)
                    if original is not None:
                        key = iso, int(date), field, original["source"]
                        assert key not in originals, key
                        originals[key] = original
    published_fields = {key[:3] for key in originals}
    totals = Counter()
    for code in world:
        country = read(NATIONAL / f"countries/{code}.json")
        assert country["country"] == code
        assert [row["year"] for row in country["years"]] == list(range(1950, 2025))
        for row in country["years"]:
            year = row["year"]
            for field in (*GROSS, "net"):
                metric = row[field]
                tag = code, year, field
                if metric is None:
                    assert tag not in published_fields, tag
                    if field == "net":
                        assert (code, year) not in wpp, tag
                    continue
                assert type(metric["value"]) is int and len(metric["sourceIds"]), tag
                assert all(country["sources"][sid]["url"].startswith("https://") for sid in metric["sourceIds"]), tag
                totals[field] += 1
                if field in GROSS:
                    assert metric["value"] >= 0, tag
                if code == "GBR" and year in ons:
                    assert metric["value"] == ons[year][field] and metric["kind"] == "published", tag
                elif metric["sourceIds"] == ["wpp"]:
                    assert field == "net" and metric["value"] == wpp[(code, year)], tag
                    assert metric["kind"] == ("projection" if year == 2024 else "estimate"), tag
                elif len(metric["sourceIds"]) == 1 and (*tag, metric["sourceIds"][0]) in originals:
                    original = originals[(*tag, metric["sourceIds"][0])]
                    assert metric["value"] == original["value"] and metric["kind"] == original.get("kind", "published"), tag
                else:
                    assert field == "net" and metric["kind"] == "derived", tag
                    assert row["immigration"] is not None and row["emigration"] is not None, tag
                    assert metric["value"] == row["immigration"]["value"] - row["emigration"]["value"], tag
                    assert set(metric["sourceIds"]) == set(row["immigration"]["sourceIds"] + row["emigration"]["sourceIds"]), tag
    assert totals["net"] == len(wpp)
    print(f"Verified {len(world)} national series for 1950–2024, {totals['net']:,} annual net values, "
          f"{gross_count:,} original Eurostat cells, {aus_count} Australian published measures and {len(ons) * 3} ONS values.")


if __name__ == "__main__":
    main()

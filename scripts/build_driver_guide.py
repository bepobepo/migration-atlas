"""Build comparable net-migration rankings for the historical research guide."""
import csv
import gzip
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data'
PERIODS = (2020, 2000)
END = 2024


def build():
    atlas = json.loads((DATA / 'countries.json').read_text())
    countries = {code: row for code, row in atlas.items() if row['hasData']}
    annual = defaultdict(dict)
    with gzip.open(ROOT / 'reference/official/un-wpp/annual-net-migration.csv.gz', 'rt') as stream:
        for row in csv.DictReader(stream):
            code, year = row['ISO3_code'], int(row['Time'])
            if code in countries and min(PERIODS) <= year <= END:
                persons = Decimal(row['NetMigrations']) * 1000
                if year in annual[code] or persons != int(persons) or row['Variant'] != 'Medium':
                    raise ValueError(f'Unexpected net migration observation for {code}, {year}')
                annual[code][year] = int(persons)
    totals = {start: {code: sum(annual[code][y] for y in range(start, END + 1))
                      for code in countries} for start in PERIODS}
    orders = {start: sorted(values, key=lambda c: (-values[c], c)) for start, values in totals.items()}
    included = {'BLR', 'ISR', 'TUR'}
    with (ROOT / 'reference/stock/midyear-population.csv').open() as stream:
        for row in csv.DictReader(stream):
            code = row['ISO3_code']
            if (int(row['Time']) == END and countries[code]['europe']
                    and Decimal(row['TPopulation1July']) >= 5000):
                included.add(code)
    for order in orders.values():
        included.update(order[:40])
    result = {'end': END, 'universe': len(countries), 'countries': {
        code: {'name': countries[code]['name'], 'periods': {
            start: {'rank': orders[start].index(code) + 1, 'net': totals[start][code]} for start in PERIODS}}
        for code in sorted(included, key=lambda c: countries[c]['name'])}}
    (DATA / 'driver-guide.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    return result


if __name__ == '__main__':
    print(f"Built country notes index for {len(build()['countries'])} countries.")

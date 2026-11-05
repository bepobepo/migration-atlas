"""Reproduce the browser data from the pinned FLOW CSV and Natural Earth 110m geometry."""
import argparse
import collections
import csv
import hashlib
import json
import math
from decimal import Decimal
from pathlib import Path

BASE = Path(__file__).resolve().parent
SOURCE_SHA256 = '7a300afcf5ab05c356c53826e8baecee78278608fb794514476cc73d3c564e52'
EUROPE = set('ALB AND AUT BLR BEL BIH BGR HRV CZE DNK EST FIN FRA DEU GRC VAT HUN ISL IRL ITA LVA LIE LTU LUX MLT MDA MCO MNE NLD MKD NOR POL PRT ROU RUS SMR SRB SVK SVN ESP SWE CHE UKR GBR GIB FRO IMN JEY GGY SJM ALA'.split())

def country_code(properties):
    for field in ('ISO_A3_EH', 'ISO_A3'):
        value = properties.get(field, '')
        if len(value) == 3 and value != '-99':
            return value
    return {'KOS': 'XKX'}.get(properties['ADM0_A3'], properties['ADM0_A3'])

def build(source, geometry, output):
    with source.open('rb') as file:
        assert hashlib.file_digest(file, 'sha256').hexdigest() == SOURCE_SHA256, 'Unexpected source version; review before processing'
    reference = json.loads((BASE / 'reference/countries.json').read_text())
    world = json.loads(geometry.read_text())
    countries = {}
    def add_country(code):
        metadata = reference[code]
        assert metadata['name'] != code
        lon, lat = metadata['coordinates']
        assert math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90
        countries[code] = dict(code=code, europe=code in EUROPE, **metadata)
    for feature in world['features']:
        code = country_code(feature['properties'])
        add_country(code)
        feature['properties'] = {key: countries[code][key] for key in ('code', 'name', 'europe')}
    aggregates = collections.defaultdict(int)
    annual = collections.defaultdict(int)
    coverage = collections.defaultdict(int)
    data_countries = set()
    with source.open(newline='') as file:
        for row in csv.DictReader(file):
            a, b = row['Origin'], row['Destination']
            if a == b:
                continue
            year = int(row['Year'])
            assert 1960 <= year <= 2024
            sex = {'female': 0, 'male': 1}[row['Sex']]
            value = Decimal(row['Flow_estimate'])
            assert value.is_finite() and value >= 0 and value * 10 == int(value * 10)
            period = year // 5 * 5
            key = period, a, b
            bit = 1 << ((year - period) * 2 + sex)
            assert not coverage[key] & bit, f'Duplicate year/sex record: {key}'
            coverage[key] |= bit
            aggregates[key] += int(value * 10)
            annual[year, a, b] += int(value * 10)
            data_countries.update((a, b))
            if a not in countries: add_country(a)
            if b not in countries: add_country(b)
    assert all(mask == 1023 for mask in coverage.values()), 'Incomplete year/sex coverage'
    assert {k[0] for k in aggregates} == set(range(1960, 2025, 5))
    # Write only after the entire source and metadata pass validation.
    output.mkdir(parents=True, exist_ok=True)
    (output / 'annual').mkdir(exist_ok=True)
    for code, metadata in countries.items():
        metadata['hasData'] = code in data_countries
    def save(filename, data):
        temporary = output / (filename + '.tmp')
        temporary.write_text(json.dumps(data, separators=(',', ':')))
        temporary.replace(output / filename)
    for period in range(1960, 2025, 5):
        save(f'{period}.json', [[a, b, value / 10] for (p, a, b), value in aggregates.items() if p == period])
    for year in range(1960, 2025):
        save(f'annual/{year}.json', [[a, b, value / 10] for (y, a, b), value in annual.items() if y == year])
    for direction in ('out', 'in'):
        (output / 'series' / direction).mkdir(parents=True, exist_ok=True)
        for code in sorted(data_countries):
            peers = {}
            for peer in sorted(data_countries - {code}):
                a, b = (code, peer) if direction == 'out' else (peer, code)
                peers[peer] = [annual[y, a, b] for y in range(1960, 2025)]
            save(f'series/{direction}/{code}.json', dict(country=code, startYear=1960, peers=peers))
    save('countries.json', countries)
    save('world.json', world)
    print(f'Validated and exported {len(aggregates):,} five-year and {len(annual):,} annual aggregates; complete year/sex coverage.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=Path('/tmp/flow.csv'))
    parser.add_argument('--geometry', type=Path, default=Path('/tmp/countries.geojson'))
    parser.add_argument('--output', type=Path, default=BASE / 'dist/data')
    args = parser.parse_args()
    build(args.source, args.geometry, args.output)

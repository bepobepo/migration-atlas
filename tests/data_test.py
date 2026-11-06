"""Independently reconcile all annual and five-year values with the pinned CSV.
Run: python tests/data_test.py [/path/to/flow.csv]
"""
import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path

base = Path(__file__).resolve().parents[1]
root = base / 'dist/data'
source = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/flow.csv')
with source.open('rb') as file:
    assert hashlib.file_digest(file, 'sha256').hexdigest() == '7a300afcf5ab05c356c53826e8baecee78278608fb794514476cc73d3c564e52'
un = json.loads((base / 'reference/un-m49.json').read_text())
europe = {code for code, item in un.items() if item['region'] == 'Europe'}
countries = json.loads((root / 'countries.json').read_text())

def exported(directory, years):
    values = {}
    for year in years:
        for a, b, value in json.loads((directory / f'{year}.json').read_text()):
            key = year, a, b
            assert key not in values and a != b and value >= 0
            assert a in un and b in un
            assert countries[a]['hasData'] and countries[b]['hasData']
            values[key] = int(Decimal(str(value)) * 10)
    return values

expected_annual = exported(root / 'annual', range(1960, 2025))
expected_five = exported(root, range(1960, 2025, 5))
actual = Counter()
observations = defaultdict(int)
source_codes = set()
examples = Counter()
with source.open(newline='') as file:
    for row in csv.DictReader(file):
        a, b = row['Origin'], row['Destination']
        source_codes.update((a, b))
        assert a in un and b in un
        if a == b:
            continue
        year = int(row['Year'])
        assert 1960 <= year <= 2024
        key = year, a, b
        bit = {'female': 1, 'male': 2}[row['Sex']]
        assert not observations[key] & bit, f'Duplicate: {key}'
        observations[key] |= bit
        decimal = Decimal(row['Flow_estimate'])
        assert decimal.is_finite() and decimal >= 0 and decimal * 10 == int(decimal * 10)
        value = int(decimal * 10)
        actual[key] += value
        if a == 'ITA' and b == 'FRA' and 1999 <= year <= 2003: examples['ITA-FRA 1999-2003'] += value
        if a == 'BLR' and b == 'POL' and 2020 <= year <= 2022: examples['BLR-POL 2020-2022'] += value
        if b == 'POL' and 2020 <= year <= 2022: examples['All origins-POL 2020-2022'] += value
        if a == 'ITA' and b == 'FRA' and year == 2021: examples['ITA-FRA 2021'] += value
assert set(actual) == set(expected_annual), 'Missing or extra annual corridors'
assert actual == expected_annual, 'Annual estimate mismatch'
assert all(mask == 3 for mask in observations.values())
assert len(actual) == 2433730
assert len(source_codes) == 194
assert source_codes == {code for code, c in countries.items() if c['hasData']}
for code in source_codes:
    outgoing=json.loads((root/'series/out'/f'{code}.json').read_text())['peers']
    incoming=json.loads((root/'series/in'/f'{code}.json').read_text())['peers']
    for peer in source_codes-{code}:
        for year in range(1960,2025):
            assert outgoing[peer][year-1960] == actual[year,code,peer]
            assert incoming[peer][year-1960] == actual[year,peer,code]
actual_five = Counter()
for (year, a, b), value in actual.items(): actual_five[year // 5 * 5, a, b] += value
assert set(actual_five) == set(expected_five)
assert actual_five == expected_five
assert len(expected_five) == 486746
assert all(len([1 for y, a, b in expected_annual if y == year]) == 37442 for year in (1960, 2024))
assert not (root / '1950.json').exists() and not (root / '1955.json').exists()
events = json.loads((root / 'events.json').read_text())
assert len(events) >= 24 and [e['id'] for e in events] == list(range(len(events)))
assert all(e.get('scope', 'route') in {'route', 'origin-country', 'destination-country'} for e in events)
assert all((e['origin'] in countries and e['destination'] in countries if e.get('scope', 'route') == 'route' else e['country'] in countries) and e['start'] <= e['end'] and e['source'].startswith('https://') for e in events)
assert events[0]['origin'] == 'ESP'
print(f'PASS: all {len(actual):,} annual and {len(expected_five):,} five-year estimates exactly match the source; 194 country codes verified against UN M49; complete year/sex coverage.')
print('Independent sample totals:', {key: value / 10 for key, value in examples.items()})

"""Independent reconciliation of published values, metadata and original FLOW rows.
Run: python tests/data_test.py [/path/to/flow.csv]
"""
import csv
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'dist/data'
source = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/flow.csv')
with source.open('rb') as file:
    assert hashlib.file_digest(file, 'sha256').hexdigest() == '7a300afcf5ab05c356c53826e8baecee78278608fb794514476cc73d3c564e52'
countries = json.loads((root/'countries.json').read_text())
expected = {}
for period in range(1960, 2025, 5):
    for a, b, value in json.loads((root/f'{period}.json').read_text()):
        key = period, a, b
        assert key not in expected and a != b and value >= 0
        assert countries[a]['europe'] or countries[b]['europe']
        for code in (a, b):
            assert countries[code]['name'] != code
            lon, lat = countries[code]['coordinates']
            assert math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90
        expected[key] = int(Decimal(str(value)) * 10)
actual = Counter()
observations = defaultdict(set)
with source.open(newline='') as file:
    for row in csv.DictReader(file):
        year = int(row['Year'])
        key = year // 5 * 5, row['Origin'], row['Destination']
        if key not in expected:
            continue
        observation = year, row['Sex']
        assert observation not in observations[key]
        observations[key].add(observation)
        actual[key] += int(Decimal(row['Flow_estimate']) * 10)
assert actual == expected
for (period, a, b), group in observations.items():
    assert group == {(y, s) for y in range(period, period+5) for s in ('female','male')}
assert len(expected) == 192296
assert not (root/'1950.json').exists() and not (root/'1955.json').exists()
events = json.loads((root/'events.json').read_text())
assert len(events) == 18 and len({e['id'] for e in events}) == 18
assert all(e['origin'] in countries and e['destination'] in countries and e['start'] <= e['end'] and e['source'].startswith('https://') for e in events)
assert events[0]['origin'] == 'ESP', 'Canaries must not be a separate national total'
print(f'PASS: all {len(expected):,} aggregates exactly match the source; complete year/sex coverage, unique rows, geographic endpoints, event integrity and historical gaps verified.')

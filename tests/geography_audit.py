"""Audit every published map identity against the canonical admin-0 feature.
Run: python tests/geography_audit.py /path/to/ne_10m_admin_0_countries.geojson
"""
import hashlib
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
raw = Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(raw).hexdigest() == '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255'
features = json.loads(raw)['features']
by_admin = {}
for feature in features:
    properties = feature['properties']
    assert properties['ADM0_A3'] not in by_admin
    by_admin[properties['ADM0_A3']] = properties
# Natural Earth's admin identifiers, not country ISO identities.
admin_aliases = {'ESH': 'SAH', 'PSE': 'PSX', 'SSD': 'SDS', 'XKX': 'KOS'}
metadata = json.loads((root / 'dist/data/countries.json').read_text())
for code, country in metadata.items():
    reference = by_admin[admin_aliases.get(code, code)]
    assert country['name'] == reference['NAME_EN'], (code, country['name'])
    assert country['coordinates'] == [reference['LABEL_X'], reference['LABEL_Y']], code
    assert country['code'] == code
world = json.loads((root / 'dist/data/world.json').read_text())
for feature in world['features']:
    p = feature['properties']
    assert p['name'] == metadata[p['code']]['name']
    assert p['europe'] == metadata[p['code']]['europe']
print(f'PASS: all {len(metadata)} map identities and endpoints match their canonical admin-0 features; all {len(world["features"])} rendered features have matching labels.')

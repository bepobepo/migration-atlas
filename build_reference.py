"""Extract country identities without letting dependent features overwrite countries.

Usage: python build_reference.py /path/to/ne_10m_admin_0_countries.geojson
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path

from prepare import country_code

SOURCE_SHA256 = '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255'


def extract_reference(features):
    grouped = defaultdict(list)
    for feature in features:
        properties = feature['properties']
        grouped[country_code(properties)].append(properties)
    reference = {}
    for code, candidates in grouped.items():
        if len(candidates) > 1:
            # ISO_A3_EH can be shared with dependencies, leases and disputed
            # features. Only the matching admin-0 country supplies its identity.
            candidates = [p for p in candidates if p['ADM0_A3'] == code]
        if len(candidates) != 1:
            raise ValueError(f'Ambiguous country identity for {code}; review the source features')
        properties = candidates[0]
        reference[code] = {
            'name': properties['NAME_EN'],
            'coordinates': [properties['LABEL_X'], properties['LABEL_Y']],
        }
    return reference


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).parent / 'reference/countries.json')
    args = parser.parse_args()
    raw = args.source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError('Unexpected Natural Earth version; review before extracting country identities')
    reference = extract_reference(json.loads(raw)['features'])
    args.output.write_text(json.dumps(reference, indent=2) + '\n')
    print(f'Extracted {len(reference)} unambiguous country identities.')

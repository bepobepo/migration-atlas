"""Import own-country, all-person immigration and emigration totals from pinned Eurostat tables."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

from import_eurostat import decode_cells

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'reference/official/eurostat-national'
OUTPUT = ROOT / 'dist/data/national/eurostat.json'
# The widest date coverage comes from the total-age tables. Where sources overlap,
# prefer the all-partner total for consistency with the residence-based map measures.
SERIES = {
    'immigration': ('migr_imm5prv', 'migr_imm8', 'migr_imm1ctz'),
    'emigration': ('migr_emi3nxt', 'migr_emi2', 'migr_emi1ctz'),
}


def observations(raw, source_id, reporters):
    """Resolve alternative age definitions, keeping one published value for each country/year."""
    chosen = {}
    for cell, value, flags in decode_cells(raw):
        if cell['geo'] not in reporters:
            continue
        if (cell['freq'], cell['unit'], cell['sex'], cell['age']) != ('A', 'NR', 'T', 'TOTAL'):
            raise ValueError(f'Unexpected filters for {source_id}')
        if any(cell.get(dimension, 'TOTAL') != 'TOTAL' for dimension in ('partner', 'citizen')):
            raise ValueError(f'Subgroup in the national total series: {source_id}')
        age_definition = cell['agedef']
        if age_definition not in ('COMPLET', 'REACH'):
            raise ValueError(f'Unknown age definition in {source_id}')
        if 'N' in flags or 'c' in flags:
            continue
        year = int(cell['time'])
        if not 1950 <= year <= 2024 or type(value) is not int or value < 0:
            raise ValueError(f'Unexpected calendar year or count in {source_id}')
        key = reporters[cell['geo']], year
        # Eurostat's isolated US entry includes just 76 in the US citizenship cell.
        # Whole-resident coverage, including returning citizens, could not be verified.
        if source_id == 'migr_imm1ctz' and key == ('USA', 2004):
            continue
        existing = chosen.get(key)
        if existing and existing['value'] != value:
            raise ValueError(f'Conflicting age definitions for {source_id}, {key}')
        if not existing or age_definition == 'COMPLET':
            chosen[key] = dict(value=value, source=source_id, flags=flags, ageDefinition=age_definition)
    return chosen


def build():
    inventory = json.loads((ROOT / 'dist/data/countries.json').read_text())
    m49 = json.loads((ROOT / 'reference/un-m49.json').read_text())
    reporters = {row['alpha2']: code for code, row in m49.items() if inventory.get(code, {}).get('hasData')}
    reporters.update(UK='GBR', EL='GRC')
    provenance = json.loads((REFERENCE / 'sources.json').read_text())
    countries, sources = {}, {}
    for direction, tables in SERIES.items():
        for table in tables:
            receipt = provenance[table]
            raw = gzip.decompress((REFERENCE / (table + '.json.gz')).read_bytes())
            if hashlib.sha256(raw).hexdigest() != receipt['sha256']:
                raise ValueError(f'Eurostat snapshot checksum failed: {table}')
            data = json.loads(raw)
            if data['class'] != 'dataset' or data['source'] != 'ESTAT':
                raise ValueError(f'Unexpected publisher for {table}')
            sources[table] = {
                'name': 'Eurostat · ' + data['label'],
                'measure': direction,
                'definition': ('Annual national all-person total reported to Eurostat. '
                               'Coverage and usual-residence definitions vary by reporting country and year. '
                               'Before 2008, national definitions apply.'),
                'url': f'https://ec.europa.eu/eurostat/databrowser/view/{table}/default/table?lang=en',
                'metadataUrl': 'https://ec.europa.eu/eurostat/cache/metadata/en/migr_immi_esms.htm',
                'releaseDate': data['updated'][:10],
                'retrieved': receipt['retrieved'],
                'flagLabels': data.get('extension', {}).get('status', {}).get('label', {}),
            }
            for (code, year), observation in observations(data, table, reporters).items():
                row = countries.setdefault(code, {}).setdefault(str(year), {})
                row.setdefault(direction, observation)
    return dict(sources=sources, countries=countries)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Compare every field with the published export')
    check = parser.parse_args().check
    payload = build()
    if check:
        if json.loads(OUTPUT.read_text()) != payload:
            raise SystemExit('National Eurostat export differs from the pinned sources')
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(payload, sort_keys=True, separators=(',', ':')) + '\n')
    countries = payload['countries']
    observations_count = sum(len(row) for years in countries.values() for row in years.values())
    print(f'Eurostat national totals: {observations_count} annual figures across {len(countries)} countries.')

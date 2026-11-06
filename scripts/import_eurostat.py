"""Import official annual migration by previous/next country of residence.

Download on explicit refresh; cached raw snapshots are otherwise replayable.
No nationality, residence-permit, visa, stock, or regional-aggregate counts are
substituted for bilateral flows. Numeric zero is retained; missing is missing.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import urllib.parse
import urllib.request

BASE = Path(__file__).resolve().parents[1]
DATASETS = {
    'eurostat_imm5prv': ('migr_imm5prv', 'immigration', 'previous_residence'),
    'eurostat_emi3nxt': ('migr_emi3nxt', 'emigration', 'next_residence'),
}
COLUMNS = ['origin', 'destination', 'year', 'value', 'sourceId', 'flags', 'ageDefinition']


def source_url(dataset: str, since: int, until: int) -> str:
    query = urllib.parse.urlencode(dict(lang='en', sex='T', age='TOTAL', unit='NR', sinceTimePeriod=since, untilTimePeriod=until))
    return f'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}?{query}'


def decode_cells(data: dict):
    """Decode all dimensions using JSON-stat's last-dimension-fastest layout."""
    ids, sizes = data['id'], data['size']
    if len(ids) != len(sizes):
        raise ValueError('Dimension/size mismatch')
    category_codes = []
    for dimension, size in zip(ids, sizes):
        index = data['dimension'][dimension]['category']['index']
        if isinstance(index, list):
            codes = index
        else:
            codes = [None] * size
            for code, position in index.items():
                codes[position] = code
        if len(codes) != size or any(code is None for code in codes):
            raise ValueError(f'Invalid category index: {dimension}')
        category_codes.append(codes)
    values, statuses = data.get('value', {}), data.get('status', {})
    items = enumerate(values) if isinstance(values, list) else values.items()
    for raw_index, value in items:
        if value is None:
            continue
        flat = int(raw_index)
        if flat < 0:
            raise ValueError('Negative cell index')
        cursor = flat
        cell = {}
        for dimension, size, codes in reversed(list(zip(ids, sizes, category_codes))):
            cell[dimension] = codes[cursor % size]
            cursor //= size
        if cursor:
            raise ValueError('Cell index outside dimensions')
        flag = statuses[flat] if isinstance(statuses, list) and flat < len(statuses) else statuses.get(str(flat), '') if isinstance(statuses, dict) else ''
        yield cell, value, flag or ''


def normalize(data: dict, source_id: str, code_map: dict, allowed: set):
    _, direction, _ = DATASETS[source_id]
    chosen = {}
    conflicts = []
    skipped = Counter()
    totals = {}
    for cell, value, flags in decode_cells(data):
        if cell.get('freq') != 'A' or cell.get('unit') != 'NR' or cell.get('sex') != 'T' or cell.get('age') != 'TOTAL':
            skipped['unexpected_dimensions'] += 1
            continue
        if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0 or int(value) != value:
            raise ValueError(f'Non-count value in {source_id}: {value}')
        if 'c' in flags or '|N' in flags:
            skipped['confidential_or_not_for_publication'] += 1
            continue
        reporter = code_map.get(cell['geo'])
        peer = code_map.get(cell['partner'])
        year = int(cell['time'])
        if reporter in allowed and cell['partner'] == 'TOTAL':
            total_key = f'{reporter}:{year}'
            previous = totals.get(total_key)
            if previous is None or cell.get('agedef') == 'COMPLET':
                totals[total_key] = dict(value=int(value), flags=flags, ageDefinition=cell.get('agedef'))
        if reporter not in allowed or peer not in allowed:
            skipped['aggregate_or_outside_app_scope'] += 1
            continue
        if reporter == peer:
            skipped['self_country'] += 1
            continue
        if cell.get('agedef') not in ('COMPLET', 'REACH'):
            skipped['unsupported_age_definition'] += 1
            continue
        origin, destination = (peer, reporter) if direction == 'immigration' else (reporter, peer)
        key = origin, destination, year
        row = [origin, destination, year, int(value), source_id, flags, cell['agedef']]
        previous = chosen.get(key)
        if previous is not None:
            if previous[3] != row[3]:
                conflicts.append(dict(origin=origin, destination=destination, year=year, values=[previous[3], row[3]], ageDefinitions=[previous[6], row[6]]))
            if previous[6] == 'COMPLET':
                continue
        chosen[key] = row
    return sorted(chosen.values()), dict(skipped), totals, conflicts


def run(since=2008, until=2024, download=False, input_dir=None):
    raw_dir = BASE / 'reference/official/eurostat'
    raw_dir.mkdir(parents=True, exist_ok=True)
    metadata = json.loads((BASE / 'dist/data/countries.json').read_text())
    allowed = {code for code, country in metadata.items() if country['hasData']}
    un = json.loads((BASE / 'reference/un-m49.json').read_text())
    code_map = {country['alpha2']: code for code, country in un.items()}
    code_map.update(EL='GRC', UK='GBR')
    sources, records, coverage = {}, [], {}
    provenance_path = raw_dir / 'provenance.json'
    previous_provenance = json.loads(provenance_path.read_text()) if provenance_path.exists() else {}
    now = datetime.now(timezone.utc).isoformat()
    for source_id, (dataset, direction, basis) in DATASETS.items():
        url = source_url(dataset, since, until)
        archived = raw_dir / f'{dataset}_{since}_{until}.json.gz'
        if input_dir:
            raw = (Path(input_dir) / ('imm.json' if direction == 'immigration' else 'emi.json')).read_bytes()
        elif download:
            request = urllib.request.Request(url, headers={'User-Agent': 'MigrationAtlas/1.0 official-source-review'})
            with urllib.request.urlopen(request, timeout=120) as response:
                raw = response.read()
        else:
            raw = gzip.decompress(archived.read_bytes())
        data = json.loads(raw)
        if 'error' in data or data.get('class') != 'dataset':
            raise ValueError(f'Invalid Eurostat response: {source_id}')
        normalized, skipped, totals, conflicts = normalize(data, source_id, code_map, allowed)
        if conflicts:
            raise ValueError(f'Conflicting TOTAL-age values require review in {source_id}: {conflicts[:5]}')
        archived.write_bytes(gzip.compress(raw, mtime=0))
        flag_labels = data.get('extension', {}).get('status', {}).get('label', {})
        digest = hashlib.sha256(raw).hexdigest()
        previous = previous_provenance.get(source_id, {})
        retrieved_at = now if download or previous.get('sha256') != digest else previous.get('retrievedAt', now)
        sources[source_id] = dict(
            provider='Eurostat', dataset=dataset, label=data['label'], direction=direction, basis=basis,
            unit='persons', classification='official_statistic',
            methodology='Annual changes of usual residence, generally actual or intended residence of at least 12 months. Country definitions, breaks and official estimation methods can differ; inspect source metadata and flags.',
            url=url, metadataUrl='https://ec.europa.eu/eurostat/cache/metadata/en/migr_immi_esms.htm',
            updated=data.get('updated'), retrievedAt=retrieved_at, sha256=digest,
            datasetVersion=data.get('extension', {}).get('version'), dataStructureVersion=data.get('extension', {}).get('datastructure', {}).get('version'),
            flags=flag_labels, selection=dict(freq='A',sex='T',age='TOTAL',unit='NR',ageDefinition='COMPLET preferred; REACH only when COMPLET unavailable'),
            yearsRequested=[since,until], missingPolicy='Absent/confidential/not-for-publication observations are not zero. Broad-region totals are never allocated to country pairs.',
        )
        records.extend(normalized)
        reporters = defaultdict(lambda: dict(years=set(), counterparties=set(), counts=Counter()))
        for origin, destination, year, value, _, flags, age in normalized:
            reporter = destination if direction == 'immigration' else origin
            peer = origin if direction == 'immigration' else destination
            reporters[reporter]['years'].add(year)
            reporters[reporter]['counterparties'].add(peer)
            reporters[reporter]['counts'][str(year)] += 1
        coverage[source_id] = dict(
            bilateralRecords=len(normalized), zeros=sum(row[3]==0 for row in normalized), skipped=skipped,
            reporters={code:dict(years=sorted(value['years']), counterparties=sorted(value['counterparties']), counterpartCountsByYear=dict(value['counts'])) for code,value in sorted(reporters.items())},
            reportedAllCountryTotals=totals,
        )
    result = dict(schemaVersion=1, sources=sources, columns=COLUMNS, records=sorted(records), coverage=coverage)
    output = BASE / 'dist/data/official/eurostat.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(',', ':')))
    (raw_dir / 'provenance.json').write_text(json.dumps(sources, indent=2) + '\n')
    print(json.dumps({key:{'records':value['bilateralRecords'],'zeros':value['zeros'],'reporters':len(value['reporters'])} for key,value in coverage.items()}))
    print('BLR→POL records:', [row for row in records if row[:2]==['BLR','POL']])
    return result


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--since',type=int,default=2008)
    parser.add_argument('--until',type=int,default=2024)
    parser.add_argument('--download',action='store_true')
    parser.add_argument('--input-dir',type=Path)
    args=parser.parse_args()
    run(args.since,args.until,args.download,args.input_dir)

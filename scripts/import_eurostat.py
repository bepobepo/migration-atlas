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
        if 'c' in flags or 'N' in flags:
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


def update_inventory(result, checksum, years):
    """Refresh the quantitative portion of the reviewed source inventory."""
    path = BASE / 'reference/official-sources.json'
    inventory = json.loads(path.read_text())
    inventory['coverageSnapshot'].update(sha256=checksum, yearsRequested=years)
    reports = {code: {} for code in inventory['countries']}
    by_country = defaultdict(lambda: defaultdict(list))
    for origin, destination, year, _, source_id, _, _ in result['records']:
        reporter = destination if result['sources'][source_id]['direction'] == 'immigration' else origin
        by_country[origin]['outgoing'].append((destination, year, source_id, reporter == origin))
        by_country[destination]['incoming'].append((origin, year, source_id, reporter == destination))
    for source_id, source in result['sources'].items():
        item = result['coverage'][source_id]
        inventory['sources'][source_id].update(
            primaryUrl=source['url'], updated=source['updated'], requestedYears=years,
            snapshotSha256=source['sha256'], reportingCountryCoverage=sorted(item['reporters']),
        )
        inventory['summary']['importedSources'][source_id] = {
            'observations': item['bilateralRecords'], 'reportingCountries': len(item['reporters']),
            'zeroObservations': item['zeros'],
        }
        for code, reporter in item['reporters'].items():
            reports[code][source_id] = {
                'direction': source['direction'], 'years': reporter['years'],
                'counterpartCountries': len(reporter['counterparties']),
                'observations': sum(reporter['counterpartCountsByYear'].values()),
                'counterpartCountsByYear': reporter['counterpartCountsByYear'],
            }
    own = sum(bool(reports[code]) for code in reports)
    inventory['summary'].update(countriesWithImportedReporterObservations=own,
                                countriesWithOnlyImportedMirrorObservations=len(by_country)-own,
                                countriesWithAnyImportedOfficialRouteObservation=len(by_country))
    for code, country in inventory['countries'].items():
        country['officialReportingCoverage'] = reports[code]
        country['comparableDataStatus'] = ('official_reporting_data_imported' if reports[code]
                                          else 'official_mirror_data_only' if code in by_country else 'model_only')
        route_coverage = {}
        for direction, data in by_country[code].items():
            own_count = sum(row[3] for row in data)
            route_coverage[direction] = dict(
                observations=len(data), reporterObservations=own_count, mirrorObservations=len(data)-own_count,
                counterpartCountries=len({row[0] for row in data}), years=sorted({row[1] for row in data}),
                sourceIds=sorted({row[2] for row in data}),
            )
        country['officialRouteCoverage'] = route_coverage
    path.write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + '\n')


def run(since=1960, until=2024, download=False, input_dir=None):
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
        spans = [(max(since, first), min(until, last)) for first, last in
                 ((since, 2007), (2008, until)) if max(since, first) <= min(until, last)]
        if not spans:
            raise ValueError("Invalid Eurostat date selection")
        normalized, totals, skipped, snapshots = [], {}, Counter(), []
        previous = previous_provenance.get(source_id, {})
        known_archives = {v['file']: v for v in previous.get('snapshots', [])}
        matching_vintages = {v['sha256']: v for v in previous.get('snapshots', [previous]) if v.get('sha256')}
        fingerprint = hashlib.sha256()
        for start, end in spans:
            archive_name = f'{dataset}_{start}_{end}.json.gz'
            archived = raw_dir / archive_name
            query = source_url(dataset, start, end)
            if input_dir:
                supplied = Path(input_dir) / archive_name.removesuffix(".gz")
                if len(spans) == 1 and not supplied.exists():
                    supplied = Path(input_dir) / ('imm.json' if direction == 'immigration' else 'emi.json')
                raw = supplied.read_bytes()
            elif download:
                request = urllib.request.Request(query, headers={'User-Agent': 'MigrationAtlas/1.0 official-source-review'})
                with urllib.request.urlopen(request, timeout=120) as response:
                    raw = response.read()
            else:
                raw = gzip.decompress(archived.read_bytes())
            data = json.loads(raw)
            if 'error' in data or data.get('class') != 'dataset':
                raise ValueError(f'Invalid Eurostat response: {source_id}')
            records_part, discarded, all_partners, conflicts = normalize(data, source_id, code_map, allowed)
            if conflicts or any(not start <= row[2] <= end for row in records_part) or all_partners.keys() & totals.keys():
                raise ValueError(f'Overlapping or conflicting observations in {archive_name}: {conflicts[:5]}')
            normalized.extend(records_part)
            skipped.update(discarded)
            totals.update(all_partners)
            digest = hashlib.sha256(raw).hexdigest()
            fingerprint.update(raw)
            prior = matching_vintages.get(digest)
            if not download and not input_dir and archive_name in known_archives and known_archives[archive_name]['sha256'] != digest:
                raise ValueError(f'Pinned source checksum mismatch for {archive_name}')
            if download or input_dir:
                archived.write_bytes(gzip.compress(raw, mtime=0))
            retrieved = prior['retrievedAt'] if prior and not download else now
            snapshots.append(dict(file=archive_name, url=query, yearsRequested=[start,end], sha256=digest,
                                  updated=data.get('updated'), retrievedAt=retrieved))
        flag_labels = data.get('extension', {}).get('status', {}).get('label', {})
        sources[source_id] = dict(
            provider='Eurostat', dataset=dataset, label=data['label'], direction=direction, basis=basis,
            unit='persons', classification='official_statistic',
            methodology='Annual changes of usual residence, generally actual or intended residence of at least 12 months. Country definitions, breaks and official estimation methods can differ; inspect source metadata and flags.',
            url=url, metadataUrl='https://ec.europa.eu/eurostat/cache/metadata/en/migr_immi_esms.htm',
            updated=max(s['updated'] for s in snapshots), retrievedAt=max(s['retrievedAt'] for s in snapshots),
            sha256=fingerprint.hexdigest(), snapshots=snapshots,
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
    update_inventory(result, hashlib.sha256(output.read_bytes()).hexdigest(), [since,until])
    (raw_dir / 'provenance.json').write_text(json.dumps(sources, indent=2) + '\n')
    print(json.dumps({key:{'records':value['bilateralRecords'],'zeros':value['zeros'],'reporters':len(value['reporters'])} for key,value in coverage.items()}))
    print('BLR→POL records:', [row for row in records if row[:2]==['BLR','POL']])
    return result


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--since',type=int,default=1960)
    parser.add_argument('--until',type=int,default=2024)
    parser.add_argument('--download',action='store_true')
    parser.add_argument('--input-dir',type=Path)
    args=parser.parse_args()
    run(args.since,args.until,args.download,args.input_dir)

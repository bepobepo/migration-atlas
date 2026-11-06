"""Build the public country/source coverage matrix from chosen official records.

This exports metadata, not migration values. Candidate sources never contribute
to coverage counts. Run after build_official.py and after updating the audited
source inventory; no network access or current-time timestamps are used.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YEARS = list(range(1960, 2025))


def create_coverage(flows: dict, inventory: dict, country_metadata: dict) -> dict:
    countries = {code: row for code, row in country_metadata.items() if row['hasData']}
    if len(countries) != 194 or set(countries) != set(inventory['countries']):
        raise ValueError('Coverage inventory must match exactly the 194 FLOW countries')
    if inventory['coverageSnapshot']['sha256'] != flows['sourceChecksum']:
        raise ValueError('Source inventory is stale: rebuild it for the current official import')
    if set(flows['coverage']) != set(countries):
        raise ValueError('Processed official coverage does not match the FLOW country scope')
    if not set(flows['sources']) <= set(inventory['sources']):
        raise ValueError('A chosen source is missing from the reviewed inventory')

    possible = (len(countries) - 1) * len(YEARS)
    counts = {code: {direction: [0] * len(YEARS) for direction in ('incoming', 'outgoing')} for code in countries}
    own_counts = defaultdict(Counter)
    own_years = defaultdict(lambda: defaultdict(set))
    source_counts = defaultdict(lambda: defaultdict(Counter))
    counterparties = defaultdict(lambda: defaultdict(set))
    selected_sources = Counter()
    seen = set()
    for row in flows['records']:
        origin, destination, year = row['origin'], row['destination'], row['year']
        source_id, reporter = row['sourceId'], row['reportingCountry']
        if origin not in countries or destination not in countries or origin == destination:
            raise ValueError('Invalid country pair in selected official record')
        if year not in YEARS or not isinstance(year, int) or isinstance(year, bool):
            raise ValueError('Official record outside the supported annual range')
        if source_id not in flows['sources'] or reporter not in (origin, destination):
            raise ValueError('Invalid selected source or reporting country')
        if row['value'] is None or isinstance(row['value'], bool) or not isinstance(row['value'], (int, float)) or row['value'] < 0:
            raise ValueError('A missing or invalid value is not a coverage observation')
        if 'c' in row['flags'] or 'N' in row['flags']:
            raise ValueError('Restricted observation cannot be published as coverage')
        key = origin, destination, year
        if key in seen:
            raise ValueError('Duplicate chosen route-year would overstate official coverage')
        seen.add(key)
        selected_sources[source_id] += 1
        for code, direction, counterpart in ((origin, 'outgoing', destination), (destination, 'incoming', origin)):
            counts[code][direction][year - YEARS[0]] += 1
            counterparties[code][direction].add(counterpart)
            source_counts[code][direction][source_id] += 1
            if reporter == code:
                own_counts[code][direction] += 1
                own_years[code][direction].add(year)

    result_countries = {}
    for code in sorted(countries):
        metadata = inventory['countries'][code]
        incoming, outgoing = sum(counts[code]['incoming']), sum(counts[code]['outgoing'])
        available_years = [year for i, year in enumerate(YEARS) if counts[code]['incoming'][i] or counts[code]['outgoing'][i]]
        processed = flows['coverage'][code]
        if (incoming, outgoing, available_years) != (processed['incomingRecordYears'], processed['outgoingRecordYears'], processed['years']):
            raise ValueError(f'Processed coverage disagrees with chosen observations for {code}')
        has_own_report = any(own_counts[code].values())
        status = 'complete_official_coverage' if incoming == possible and outgoing == possible else 'partial_official_coverage' if incoming or outgoing else 'model_only'
        referenced_sources = metadata['candidateSourceIds'] + metadata['nationalSourceIds']
        if any(source_id not in inventory['sources'] for source_id in referenced_sources):
            raise ValueError(f'Unresolved candidate source reference for {code}')
        if metadata['nationalPrimaryUrl'] is not None and not metadata['nationalSourceIds']:
            raise ValueError(f'National source URL lacks reviewed source metadata for {code}')
        result_countries[code] = {
            'name': countries[code]['name'],
            'region': metadata['region'],
            'status': status,
            'reportingStatus': 'own_report_observations_available' if has_own_report else 'mirror_observations_only' if incoming or outgoing else 'no_official_observations',
            'incomingRecordYears': incoming,
            'outgoingRecordYears': outgoing,
            'incomingModelRecordYears': possible - incoming,
            'outgoingModelRecordYears': possible - outgoing,
            'incomingByYear': counts[code]['incoming'],
            'outgoingByYear': counts[code]['outgoing'],
            'years': available_years,
            'ownReportCounts': {direction: own_counts[code][direction] for direction in ('incoming', 'outgoing')},
            'mirrorReportCounts': {'incoming': incoming - own_counts[code]['incoming'], 'outgoing': outgoing - own_counts[code]['outgoing']},
            'ownReporterYears': {direction: sorted(own_years[code][direction]) for direction in ('incoming', 'outgoing')},
            'counterpartCountries': {direction: len(counterparties[code][direction]) for direction in ('incoming', 'outgoing')},
            'selectedSourceCounts': {direction: dict(sorted(source_counts[code][direction].items())) for direction in ('incoming', 'outgoing')},
            'nationalReviewStatus': metadata['nationalReviewStatus'],
            'nationalPrimaryUrl': metadata['nationalPrimaryUrl'],
            'nationalSourceIds': metadata['nationalSourceIds'],
            'nationalAudit': metadata.get('nationalAudit'),
            'candidateSourceIds': metadata['candidateSourceIds'],
            'historicalUndesa2015Reporter': metadata['historicalUndesa2015Reporter'],
            'fallback': metadata['fallback'],
        }

    sources = {}
    for source_id, metadata in sorted(inventory['sources'].items()):
        # Actual selected-source metadata supersedes the inventory's imported
        # snapshot description, while retaining its metric caveats.
        item = {**metadata, **flows['sources'].get(source_id, {})}
        item['imported'] = source_id in flows['sources']
        item['dataStatus'] = 'official_observations_imported_partial_coverage' if item['imported'] else 'metadata_only_not_imported'
        item['selectedRecordCount'] = selected_sources[source_id]
        if item['imported']:
            item['primaryUrl'] = item['url']
        sources[source_id] = item

    own_country_count = sum(row['reportingStatus'] == 'own_report_observations_available' for row in result_countries.values())
    return {
        'schemaVersion': 1,
        'reviewedAt': inventory['reviewedAt'],
        'scope': 'All 194 FLOW countries; partial comparable official observations, explicit model fallback and unimported source candidates.',
        'annualYears': YEARS,
        'possibleRecordYearsPerDirection': possible,
        'definitions': {
            'recordYear': 'One selected directed country-pair/calendar-year observation, including a published numeric zero. This counts available observations, not migrants.',
            'annualCounts': 'incomingByYear and outgoingByYear align with annualYears; zero means no chosen official observation for that direction/year, not zero migration.',
            'ownReport': 'A chosen observation reported by this country; mirror reports are reported by the other end of the corridor.',
            'candidate': 'Primary-source metadata or a potential source only; contributes no official coverage until separately imported and selected.',
            'modelFallback': 'Missing official route-years stay unavailable in Official statistics. Only the opt-in Best available comparison fills gaps with FLOW; partial coverage is never a claim of complete national data.',
        },
        'summary': {
            'countries': len(countries),
            'chosenOfficialRecordYears': len(flows['records']),
            'modelFallbackRecordYears': len(countries) * possible - len(flows['records']),
            'countriesWithOwnReportedChosenObservations': own_country_count,
            'countriesWithOnlyMirrorChosenObservations': sum(row['reportingStatus'] == 'mirror_observations_only' for row in result_countries.values()),
            'countriesWithNationalSourceMetadataReviewed': sum(bool(row['nationalSourceIds']) for row in result_countries.values()),
            'countriesWithNationalSourceSearchCompleted': sum(bool(row['nationalAudit']) for row in result_countries.values()),
            'countriesWithUnresolvedNationalSource': sum(bool(row['nationalAudit']) and not row['nationalSourceIds'] for row in result_countries.values()),
            'selectedSourceCounts': dict(sorted(selected_sources.items())),
        },
        'policy': inventory['selectionPolicy'],
        'globalCandidateSourceIds': inventory['globalCandidateSourceIds'],
        'sources': sources,
        'countries': result_countries,
    }


def build(flows_path: Path, inventory_path: Path, countries_path: Path, output_path: Path) -> dict:
    flow_bytes, inventory_bytes = flows_path.read_bytes(), inventory_path.read_bytes()
    result = create_coverage(json.loads(flow_bytes), json.loads(inventory_bytes), json.loads(countries_path.read_bytes()))
    result['inputChecksums'] = {
        'chosenFlowsSha256': hashlib.sha256(flow_bytes).hexdigest(),
        'inventorySha256': hashlib.sha256(inventory_bytes).hexdigest(),
        'countriesSha256': hashlib.sha256(countries_path.read_bytes()).hexdigest(),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, separators=(',', ':'), ensure_ascii=False) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--flows', type=Path, default=ROOT / 'dist/data/official/flows.json')
    parser.add_argument('--inventory', type=Path, default=ROOT / 'reference/official-sources.json')
    parser.add_argument('--countries', type=Path, default=ROOT / 'dist/data/countries.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/data/official/coverage.json')
    args = parser.parse_args()
    result = build(args.flows, args.inventory, args.countries, args.output)
    print(json.dumps(result['summary'], separators=(',', ':')))

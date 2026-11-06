"""Merge evidence-backed national source reviews and generate the audit report.

This changes source metadata only. It cannot add numeric migration observations.
Pass the six reviewed JSON batches as arguments; archived evidence makes reruns
and the exact distinction between a completed search and verified data explicit.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATE = '2026-11-06'


def merge(inventory, batches):
    countries = inventory['countries']
    reviews = {}
    for batch in batches:
        for review in batch:
            code = review['code']
            if code not in countries or code in reviews:
                raise ValueError(f'Unknown or duplicate country: {code}')
            if review['status'] not in ('primary_source_metadata_verified', 'search_completed_no_verified_primary_source'):
                raise ValueError(f'Invalid research status: {code}')
            if not review['searchQueries'] or not review['finding'] or not review['nextStep']:
                raise ValueError(f'Incomplete search record: {code}')
            verified = review['status'] == 'primary_source_metadata_verified'
            if verified != bool(review['sources']) or (verified and not review['evidence']):
                raise ValueError(f'Verified status lacks primary evidence: {code}')
            for source in review['sources']:
                if source['imported'] or not source['primaryUrl'].startswith(('https://', 'http://')):
                    raise ValueError(f'Unsafe source metadata: {code}')
                if not source['metric'] or not source['geographicBasis'] or not source['caveats']:
                    raise ValueError(f'Missing source definition: {code}')
                source_id = source['id']
                metadata = {k: v for k, v in source.items() if k != 'id'}
                if source_id in inventory['sources'] and inventory['sources'][source_id] != metadata:
                    raise ValueError(f'Source ID collision: {source_id}')
                inventory['sources'][source_id] = metadata
            reviews[code] = {**review, 'reviewedAt': DATE}
            country = countries[code]
            source_ids = [source['id'] for source in review['sources']]
            country['nationalSourceIds'] = source_ids
            country['nationalPrimaryUrl'] = review['sources'][0]['primaryUrl'] if verified else None
            country['nationalReviewStatus'] = ('primary_source_metadata_reviewed_not_imported' if verified
                                                else 'search_completed_no_verified_primary_source')
            country['candidateSourceIds'] = list(dict.fromkeys(country['candidateSourceIds'] + source_ids))
    for code, country in countries.items():
        if code not in reviews:
            if not country['nationalSourceIds']:
                raise ValueError(f'Country still unresearched: {code}')
            sources = [dict(id=key, **inventory['sources'][key]) for key in country['nationalSourceIds']]
            reviews[code] = {
                'code': code, 'status': 'primary_source_metadata_verified', 'reviewedAt': DATE,
                'sources': sources,
                'finding': ' '.join(str(s.get('metric', s.get('label', ''))) for s in sources),
                'searchQueries': [], 'reviewMethod': 'previously_completed_primary_source_review',
                'evidence': [{'url': s['primaryUrl'], 'title': s['label'], 'summary': s.get('metric', '')} for s in sources],
                'nextStep': 'Not imported separately. Review table-level residence definitions, reference periods, revisions and numerical reconciliation before importing any annual bilateral flow.',
            }
        review = reviews[code]
        country['nationalAudit'] = {k: review[k] for k in ('status', 'reviewedAt', 'finding', 'nextStep')}
        country['notes'] = [n for n in country['notes'] if not n.startswith(('No national primary table', 'Every unfilled comparable'))]
        policy_note = 'Missing official route-years remain unavailable by default; only an explicitly selected comparison uses FLOW model values.'
        if policy_note not in country['notes']:
            country['notes'].append(policy_note)
    verified = sum(bool(c['nationalSourceIds']) for c in countries.values())
    inventory['summary'].update(countriesWithNationalSourceMetadataReviewed=verified,
                                countriesWithoutAnIndividuallyVerifiedNationalSource=len(countries)-verified,
                                countriesWithNationalSourceSearchCompleted=len(reviews),
                                countriesWithNationalSourceSearchPending=0)
    inventory['scope'] = 'Source discovery and metric assessment for all 194 FLOW countries. Completed searches are distinct from verified metadata and imported, reconciled annual observations.'
    inventory['definitions']['modelFallback'] = 'Official statistics leaves missing route-years unavailable. FLOW fills gaps only in the explicitly selected Best available comparison.'
    inventory['selectionPolicy']['defaultMode'] = 'official'
    inventory['selectionPolicy']['priority'] = ['compatible_destination_reported_flow', 'compatible_origin_reported_flow', 'unavailable']
    inventory['selectionPolicy']['comparisonFallback'] = 'FLOW model only when Best available comparison is explicitly selected'
    audit = {
        'schemaVersion': 1, 'reviewedAt': DATE,
        'scope': 'Country-by-country national source discovery and metric assessment, not certification of all migration counts or a claim of complete annual coverage.',
        'summary': {'countriesSearched': len(reviews), 'primaryMetadataVerified': verified,
                    'searchCompletedUnresolved': len(countries)-verified, 'pendingSearches': 0,
                    'numericNationalImportsFromThisAudit': 0},
        'countries': dict(sorted(reviews.items())),
    }
    return inventory, audit


def report(inventory, audit):
    summary = audit['summary']
    lines = ['# National migration source audit', '', f"Reviewed {DATE}. All {summary['countriesSearched']} country searches are complete: {summary['primaryMetadataVerified']} have verified primary-source metadata and {summary['searchCompletedUnresolved']} have unresolved primary-source evidence. No new national numerical observations are imported by this audit.", '',
             'Completion means every country received an assessment. It does not mean every country publishes comparable annual bilateral flows, that every candidate has been downloaded, or that official figures perfectly measure all movements. Annual residence flows, registration events, census stocks, permits, citizenship and border crossings remain distinct.', '',
             'The machine-readable evidence, queries and outcomes are in [reference/national-source-audit.json](reference/national-source-audit.json). Imported Eurostat coverage remains independently documented in [OFFICIAL_SOURCES.md](OFFICIAL_SOURCES.md). UNdata’s failed CSV endpoint is a source-specific access issue; it does not block these assessments.', '',
             '| Country | Primary metadata outcome | Sources and metric |', '| --- | --- | --- |']
    for code, review in sorted(audit['countries'].items(), key=lambda row: inventory['countries'][row[0]]['name']):
        name = inventory['countries'][code]['name']
        sources = '; '.join(f"[{s['label']}]({s['primaryUrl']}) — {s['metric']}" for s in review['sources']) or 'No verified primary migration source; see search outcome below.'
        lines.append(f"| {name} ({code}) | {'Verified metadata; not imported' if review['sources'] else 'Search completed; unresolved'} | {sources.replace('|', '/')} |")
    for code, review in sorted(audit['countries'].items(), key=lambda row: inventory['countries'][row[0]]['name']):
        lines.extend(['', f"## {inventory['countries'][code]['name']} · {code}", '', review['finding'], '', '**Import assessment:** ' + review['nextStep']])
        for source in review['sources']:
            lines.extend(['', f"[{source['label']}]({source['primaryUrl']})", '', 'Geographic basis: ' + str(source['geographicBasis']), ''])
            lines.extend('- ' + caveat for caveat in source['caveats'])
    return '\n'.join(lines) + '\n'


def update_overview(inventory, audit):
    path = ROOT / 'OFFICIAL_SOURCES.md'
    text = path.read_text()
    verified = audit['summary']['primaryMetadataVerified']
    unresolved = audit['summary']['searchCompletedUnresolved']
    text = re.sub(r'\| National primary-source metadata reviewed separately \| \d+ \|',
                  f'| National primary-source metadata reviewed separately | {verified} |', text)
    text = re.sub(r'\| Countries without individually verified national source metadata \| \d+ \|',
                  f'| Completed searches with unresolved primary-source evidence | {unresolved} |', text)
    text = re.sub(r'\| Completed searches with unresolved primary-source evidence \| \d+ \|',
                  f'| Completed searches with unresolved primary-source evidence | {unresolved} |', text)
    marker = '| National source searches completed | 194 |'
    if marker not in text:
        text = text.replace(f'| National primary-source metadata reviewed separately | {verified} |',
                            marker + f'\n| National primary-source metadata reviewed separately | {verified} |')
    text = text.replace("This is **not a claim that every country's national migration data has been reviewed or that every migration estimate is correct**.",
                        'All 194 countries have a recorded source-search outcome. **This is not a claim that every national dataset has been reconciled or that every migration estimate is correct**.')
    start = text.index('## Separately reviewed national sources')
    text = text[:start] + '\n'.join([
        '## Separately reviewed national sources', '',
        f'National source discovery and metric assessment is complete for all 194 countries: {verified} have verified primary-source metadata, while {unresolved} remain explicitly unresolved. See [the complete country report](NATIONAL_SOURCE_AUDIT.md) and [archived search evidence](reference/national-source-audit.json). Context-only findings include censuses, questionnaires, permits, registrations, nationality stocks and travel; they are not interchangeable with annual gross bilateral flows. No additional national numbers were imported by this review.', '',
        '## Country-by-country coverage matrix', '',
        'Own incoming/outgoing lists years with at least one chosen official observation reported by that country, not complete national coverage. Every country search is complete; verified metadata does not imply an imported national dataset.', '',
        '| ISO3 | Country | Own incoming report years | Own outgoing report years | Other official route coverage | National source outcome |',
        '| --- | --- | --- | --- | --- | --- |',
    ]) + '\n'
    coverage = json.loads((ROOT / 'dist/data/official/coverage.json').read_text())
    for code, country in sorted(inventory['countries'].items(), key=lambda item: item[1]['name']):
        row = coverage['countries'][code]
        incoming = ', '.join(map(str, row['ownReporterYears']['incoming'])) or '—'
        outgoing = ', '.join(map(str, row['ownReporterYears']['outgoing'])) or '—'
        status = 'Metadata verified; not imported' if country['nationalSourceIds'] else 'Search complete; unresolved'
        reports = 'Includes own reports' if any(row['ownReportCounts'].values()) else 'Mirror only'
        text += f"| {code} | {country['name']} | {incoming} | {outgoing} | {reports} | {status} |\n"
    path.write_text(text)
    path = ROOT / 'README.md'
    text = path.read_text()
    start = text.index('See [OFFICIAL_SOURCES.md]')
    end = text.index('\n', start)
    text = text[:start] + f'See [OFFICIAL_SOURCES.md](OFFICIAL_SOURCES.md) and [NATIONAL_SOURCE_AUDIT.md](NATIONAL_SOURCE_AUDIT.md): all 194 country source searches have an outcome; {verified} have verified primary metadata and {unresolved} remain unresolved. Findings and source definitions are searchable in the app. This audit imports no new national figures, and metadata candidates never count as official observations.' + text[end:]
    path.write_text(text)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('batches', type=Path, nargs='*')
    args = parser.parse_args()
    path = ROOT / 'reference/official-sources.json'
    inventory = json.loads(path.read_text())
    if args.batches:
        inventory, audit = merge(inventory, [json.loads(p.read_text()) for p in args.batches])
        path.write_text(json.dumps(inventory, indent=2, ensure_ascii=False) + '\n')
        (ROOT / 'reference/national-source-audit.json').write_text(json.dumps(audit, indent=2, ensure_ascii=False) + '\n')
    else:
        audit = json.loads((ROOT / 'reference/national-source-audit.json').read_text())
    (ROOT / 'NATIONAL_SOURCE_AUDIT.md').write_text(report(inventory, audit))
    update_overview(inventory, audit)
    print(json.dumps(audit['summary']))

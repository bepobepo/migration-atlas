"""Independently reconcile public country coverage with chosen official rows."""
from collections import Counter, defaultdict
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_coverage', ROOT / 'scripts/build_coverage.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class CoverageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.matrix = json.loads((ROOT / 'dist/data/official/coverage.json').read_text())
        cls.flows = json.loads((ROOT / 'dist/data/official/flows.json').read_text())
        cls.inventory = json.loads((ROOT / 'reference/official-sources.json').read_text())
        cls.countries = json.loads((ROOT / 'dist/data/countries.json').read_text())

    def test_exact_scope_and_fingerprints(self):
        codes = {code for code, country in self.countries.items() if country['hasData']}
        self.assertEqual(len(codes), 194)
        self.assertEqual(set(self.matrix['countries']), codes)
        self.assertEqual(set(self.inventory['countries']), codes)
        self.assertEqual(self.matrix['annualYears'], list(range(1960, 2025)))
        checks = self.matrix['inputChecksums']
        for key, path in [('chosenFlowsSha256', 'dist/data/official/flows.json'), ('inventorySha256', 'reference/official-sources.json'), ('countriesSha256', 'dist/data/countries.json')]:
            self.assertEqual(checks[key], hashlib.sha256((ROOT / path).read_bytes()).hexdigest())

    def test_every_chosen_observation_counted_once_per_direction(self):
        counts = Counter()
        sources = Counter()
        reporters = Counter()
        own_years = defaultdict(set)
        unique_routes = set()
        for row in self.flows['records']:
            route = row['origin'], row['destination'], row['year']
            self.assertNotIn(route, unique_routes)
            unique_routes.add(route)
            self.assertIsNotNone(row['value'])
            self.assertNotIn('c', row['flags'])
            self.assertNotIn('N', row['flags'])
            counts[(row['origin'], 'outgoing', row['year'])] += 1
            counts[(row['destination'], 'incoming', row['year'])] += 1
            sources[row['sourceId']] += 1
            for code, direction in [(row['origin'], 'outgoing'), (row['destination'], 'incoming')]:
                if row['reportingCountry'] == code:
                    reporters[(code, direction)] += 1
                    own_years[(code, direction)].add(row['year'])
        self.assertEqual(self.matrix['summary']['chosenOfficialRecordYears'], len(unique_routes))
        self.assertEqual(self.matrix['summary']['selectedSourceCounts'], dict(sources))
        incoming_total = outgoing_total = 0
        for code, country in self.matrix['countries'].items():
            observed_years = set()
            for direction in ('incoming', 'outgoing'):
                expected = [counts[(code, direction, year)] for year in self.matrix['annualYears']]
                self.assertEqual(country[direction + 'ByYear'], expected)
                total = sum(expected)
                self.assertEqual(country[direction + 'RecordYears'], total)
                self.assertEqual(country[direction + 'ModelRecordYears'] + total, 193 * 65)
                self.assertEqual(country['ownReportCounts'][direction], reporters[(code, direction)])
                self.assertEqual(country['ownReportCounts'][direction] + country['mirrorReportCounts'][direction], total)
                self.assertEqual(country['ownReporterYears'][direction], sorted(own_years[(code, direction)]))
                self.assertEqual(sum(country['selectedSourceCounts'][direction].values()), total)
                observed_years.update(year for year in self.matrix['annualYears'] if counts[(code, direction, year)])
            self.assertEqual(country['years'], sorted(observed_years))
            incoming_total += country['incomingRecordYears']
            outgoing_total += country['outgoingRecordYears']
        self.assertEqual(incoming_total, len(unique_routes))
        self.assertEqual(outgoing_total, len(unique_routes))

    def test_candidate_metadata_never_becomes_imported_coverage(self):
        for code, country in self.matrix['countries'].items():
            inventory = self.inventory['countries'][code]
            for key in ('nationalReviewStatus', 'nationalPrimaryUrl', 'nationalSourceIds', 'candidateSourceIds'):
                self.assertEqual(country[key], inventory[key])
            if not country['nationalSourceIds']:
                self.assertIsNone(country['nationalPrimaryUrl'])
            for source_id in country['candidateSourceIds'] + country['nationalSourceIds']:
                self.assertIn(source_id, self.matrix['sources'])
            for direction in ('incoming', 'outgoing'):
                for source_id in country['selectedSourceCounts'][direction]:
                    self.assertIn(source_id, self.flows['sources'])
                    self.assertTrue(self.matrix['sources'][source_id]['imported'])
        for source_id, source in self.matrix['sources'].items():
            self.assertEqual(source['imported'], source_id in self.flows['sources'])
            if not source['imported']:
                self.assertEqual(source['selectedRecordCount'], 0)
                self.assertEqual(source['dataStatus'], 'metadata_only_not_imported')

    def test_published_zero_counts_but_absence_does_not(self):
        zero = next(row for row in self.flows['records'] if row['value'] == 0)
        rows = [row for row in self.flows['records'] if row['origin'] == zero['origin'] and row['year'] == zero['year']]
        index = self.matrix['annualYears'].index(zero['year'])
        observed = self.matrix['countries'][zero['origin']]['outgoingByYear'][index]
        self.assertEqual(observed, len(rows))
        self.assertGreater(observed, sum(row['value'] > 0 for row in rows))
        self.assertFalse(any(row['origin'] == 'BLR' and row['destination'] == 'POL' and 2020 <= row['year'] <= 2024 for row in self.flows['records']))
        self.assertNotIn(2020, self.matrix['countries']['POL']['ownReporterYears']['incoming'])

    def test_duplicate_and_stale_inputs_are_rejected(self):
        duplicate = {**self.flows, 'records': self.flows['records'] + [self.flows['records'][0]]}
        with self.assertRaisesRegex(ValueError, 'Duplicate chosen route-year'):
            builder.create_coverage(duplicate, self.inventory, self.countries)
        stale = {**self.flows, 'sourceChecksum': '0' * 64}
        with self.assertRaisesRegex(ValueError, 'inventory is stale'):
            builder.create_coverage(stale, self.inventory, self.countries)

    def test_export_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'coverage.json'
            subprocess.run([sys.executable, str(ROOT / 'scripts/build_coverage.py'), '--output', str(path)], check=True, capture_output=True)
            self.assertEqual(path.read_bytes(), (ROOT / 'dist/data/official/coverage.json').read_bytes())


if __name__ == '__main__':
    unittest.main()

"""Regression checks for shared Natural Earth codes and country identity."""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build_reference import extract_reference


class CountryIdentityTests(unittest.TestCase):
    def test_every_data_country_matches_independent_un_codes_names_and_regions(self):
        un = json.loads((ROOT / 'reference/un-m49.json').read_text())
        aliases = json.loads((ROOT / 'reference/name-aliases.json').read_text())
        metadata = json.loads((ROOT / 'dist/data/countries.json').read_text())
        data = json.loads((ROOT / 'dist/data/2020.json').read_text())
        codes = {code for a, b, _ in data for code in (a, b)}
        self.assertEqual(len(codes), 194)
        for code in codes:
            self.assertIn(code, un)
            self.assertEqual(metadata[code]['name'], aliases.get(code, un[code]['name']), code)
            self.assertEqual(metadata[code]['europe'], un[code]['region'] == 'Europe', code)
        for code, country in metadata.items():
            self.assertEqual(country['hasData'], code in codes, code)

    def test_dependencies_cannot_replace_country_in_either_order(self):
        country = {'properties': {
            'ISO_A3_EH': 'FRA', 'ISO_A3': '-99', 'ADM0_A3': 'FRA',
            'NAME_EN': 'France', 'LABEL_X': 2.552275, 'LABEL_Y': 46.696113,
        }}
        dependency = {'properties': {
            'ISO_A3_EH': 'FRA', 'ISO_A3': '-99', 'ADM0_A3': 'CLP',
            'NAME_EN': 'Clipperton Island', 'LABEL_X': -109.22045, 'LABEL_Y': 10.297324,
        }}
        for features in ([country, dependency], [dependency, country]):
            result = extract_reference(features)
            self.assertEqual(result['FRA']['name'], 'France')
            self.assertEqual(result['FRA']['coordinates'], [2.552275, 46.696113])

    def test_ambiguous_identity_fails_instead_of_last_feature_winning(self):
        features = [{'properties': {
            'ISO_A3_EH': 'FRA', 'ISO_A3': '-99', 'ADM0_A3': admin,
            'NAME_EN': admin, 'LABEL_X': 0, 'LABEL_Y': 0,
        }} for admin in ['CLP', 'UNKNOWN']]
        with self.assertRaisesRegex(ValueError, 'Ambiguous country identity for FRA'):
            extract_reference(features)

    def test_duplicate_canonical_features_require_review(self):
        feature = {'properties': {
            'ISO_A3_EH': 'FRA', 'ISO_A3': '-99', 'ADM0_A3': 'FRA',
            'NAME_EN': 'France', 'LABEL_X': 2, 'LABEL_Y': 46,
        }}
        with self.assertRaises(ValueError):
            extract_reference([feature, feature])

    def test_corrected_countries_have_their_own_names_and_locations(self):
        # Independent ISO3 identities and broad geographic bounds catch valid
        # but semantically wrong territory labels/coordinates.
        expected = {
            'FRA': ('France', (-5, 10, 42, 51)),
            'AUS': ('Australia', (112, 155, -44, -10)),
            'BRA': ('Brazil', (-75, -34, -34, 6)),
            'KAZ': ('Kazakhstan', (46, 88, 40, 56)),
        }
        for filename in ['reference/countries.json', 'dist/data/countries.json']:
            metadata = json.loads((ROOT / filename).read_text())
            for code, (name, (west, east, south, north)) in expected.items():
                country = metadata[code]
                self.assertEqual(country['name'], name, f'{filename}: {code}')
                lon, lat = country['coordinates']
                self.assertTrue(west <= lon <= east and south <= lat <= north, code)
        world = json.loads((ROOT / 'dist/data/world.json').read_text())
        for feature in world['features']:
            properties = feature['properties']
            if properties['code'] in expected:
                self.assertEqual(properties['name'], expected[properties['code']][0])


if __name__ == '__main__':
    unittest.main()

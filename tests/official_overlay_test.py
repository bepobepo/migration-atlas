"""Independently verify chosen overlay values, mirror priority and model baselines."""
import hashlib,json,unittest
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1]
class OverlayTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.source=json.loads((ROOT/'dist/data/official/eurostat.json').read_text())
  cls.output=json.loads((ROOT/'dist/data/official/flows.json').read_text())
 def test_all_selected_values_and_alternatives(self):
  bykey=defaultdict(list)
  for row in self.source['records']:
   item=dict(zip(self.source['columns'],row));bykey[item['origin'],item['destination'],item['year']].append(item)
  self.assertEqual(len(bykey),111297)
  self.assertEqual(len(self.output['records']),len(bykey))
  seen=set()
  for row in self.output['records']:
   key=row['origin'],row['destination'],row['year'];self.assertNotIn(key,seen);seen.add(key)
   candidates=sorted(bykey[key],key=lambda r:r['sourceId']!='eurostat_imm5prv')
   first=candidates[0]
   for field in ['origin','destination','year','value','sourceId','flags','ageDefinition']:self.assertEqual(row[field],first[field])
   self.assertEqual(row['reportingCountry'],row['destination'] if row['sourceId']=='eurostat_imm5prv' else row['origin'])
   self.assertEqual(self.output['sources'][row['sourceId']]['measure'],'previous_residence' if row['sourceId']=='eurostat_imm5prv' else 'next_residence')
   self.assertEqual([(r['sourceId'],r['value']) for r in row['alternatives']],[(r['sourceId'],r['value']) for r in candidates[1:]])
  self.assertEqual(seen,set(bykey))
 def test_every_model_baseline(self):
  records=defaultdict(list)
  for row in self.output['records']:records[row['year']].append(row)
  for year,rows in records.items():
   baseline={(a,b):v for a,b,v in json.loads((ROOT/f'dist/data/annual/{year}.json').read_text())}
   for row in rows:self.assertEqual(row['modelValue'],baseline[row['origin'],row['destination']])
 def test_pinned_input_and_no_permits(self):
  self.assertEqual(self.output['sourceChecksum'],hashlib.sha256((ROOT/'dist/data/official/eurostat.json').read_bytes()).hexdigest())
  self.assertEqual(set(self.output['sources']),{'eurostat_imm5prv','eurostat_emi3nxt'})
  self.assertTrue(all(r['value']>=0 and 'N' not in r['flags'] and 'c' not in r['flags'] for r in self.output['records']))
 def test_belarus_poland_gap_is_not_fabricated(self):
  self.assertFalse(any(r['origin']=='BLR' and r['destination']=='POL' and 2020<=r['year']<=2024 for r in self.output['records']))
  context=json.loads((ROOT/'dist/data/official/context.json').read_text())
  self.assertEqual([r['value'] for r in context['records']],[28000,124500,133000])
  self.assertTrue(all(r['notComparableToFlow'] for r in context['records']))
if __name__=='__main__':unittest.main()

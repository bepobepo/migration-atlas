import gzip,json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
raw=gzip.decompress((root/'reference/wdi-population.json.gz').read_bytes());source=json.loads(raw);data=json.loads((root/'dist/data/population.json').read_text())
assert hashlib.sha256(raw).hexdigest()==data['source']['sha256']
expected={(r['countryiso3code'],int(r['date'])):r['value'] for r in source[1]}
assert len(data['countries'])==194
for code,values in data['countries'].items():
 assert len(values)==65
 for i,value in enumerate(values): assert value==expected[code,1960+i]
assert all(data['countries']['PSE'][i] is None for i in range(30))
print('PASS all 12,610 population country-years match archived WDI; missing baselines retained.')

"""Build the pinned population baseline from an archived WDI response."""
import json,gzip,hashlib,sys
from pathlib import Path
raw=Path(sys.argv[1]).read_bytes(); response=json.loads(raw)
base=Path(__file__).parent
codes={c for c,v in json.loads((base/'dist/data/countries.json').read_text()).items() if v['hasData']}
values={c:[None]*65 for c in sorted(codes)}
for row in response[1]:
 c=row['countryiso3code']; y=int(row['date'])
 if c in values and 1960<=y<=2024: values[c][y-1960]=row['value']
assert len(values)==194
snapshot=base/'reference/wdi-population.json.gz'; snapshot.write_bytes(gzip.compress(raw,mtime=0))
output={'startYear':1960,'source':{'indicator':'SP.POP.TOTL','url':'https://data.worldbank.org/indicator/SP.POP.TOTL','updated':response[0]['lastupdated'],'retrieved':'2026-11-05','sha256':hashlib.sha256(raw).hexdigest(),'definition':'Midyear de facto population'},'countries':values}
(base/'dist/data/population.json').write_text(json.dumps(output,separators=(',',':')))
print('Population snapshot:',len(values),'countries; missing values',sum(v is None for a in values.values() for v in a))

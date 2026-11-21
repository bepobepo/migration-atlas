"""Build a sparse, reproducible official-flow overlay; preserve raw FLOW exports."""
import json, hashlib
from collections import defaultdict,Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]


def pack_flows(result):
    """Store repeated receipt metadata once while preserving both reporters."""
    countries = sorted(result['coverage'])
    country_ids = {code: index for index, code in enumerate(countries)}
    profiles = []
    profile_ids = {}
    years = defaultdict(list)
    alternate_count = 0

    def profile_id(receipt):
        reporter = receipt['reportingCountry']
        if reporter == receipt['destination']:
            endpoint = 'destination'
        elif reporter == receipt['origin']:
            endpoint = 'origin'
        else:
            raise ValueError('Reporter must be a corridor endpoint')
        signature = (
            receipt['sourceId'], receipt['flags'], receipt['ageDefinition'], endpoint,
        )
        if signature not in profile_ids:
            profile_ids[signature] = len(profiles)
            names = ('sourceId', 'flags', 'ageDefinition', 'reporter')
            profiles.append(dict(zip(names, signature)))
        return profile_ids[signature]

    for record in result['records']:
        origin, destination, year = record['origin'], record['destination'], record['year']
        row = [
            country_ids[origin], country_ids[destination], profile_id(record),
            record['value'], record['modelValue'],
        ]
        if record['alternatives']:
            alternates = []
            for receipt in record['alternatives']:
                route_year = (receipt['origin'], receipt['destination'], receipt['year'])
                if route_year != (origin, destination, year):
                    raise ValueError('Alternative receipt has a different corridor or year')
                alternates.append([profile_id(receipt), receipt['value']])
            row.append(alternates)
            alternate_count += len(alternates)
        years[year].append(row)

    return {
        'schemaVersion': 2,
        'sources': result['sources'], 'coverage': result['coverage'],
        'policy': result['policy'], 'sourceChecksum': result['sourceChecksum'],
        'countries': countries, 'profiles': profiles,
        'recordCount': len(result['records']), 'alternativeCount': alternate_count,
        'years': sorted(years.items()),
    }


raw=ROOT/'dist/data/official/eurostat.json'
payload=json.loads(raw.read_text()); chosen={}; alternatives=defaultdict(list)
for source in payload['sources'].values(): source['measure']=source['basis']
priority={'eurostat_imm5prv':0,'eurostat_emi3nxt':1}
for values in payload['records']:
 row=dict(zip(payload['columns'],values)); key=(row['year'],row['origin'],row['destination'])
 if row['sourceId'] not in priority: raise ValueError('Unreviewed measure')
 if row['value'] is None or not isinstance(row['value'],(int,float)) or row['value']<0: raise ValueError('Invalid official observation')
 if 'N' in row['flags'] or 'c' in row['flags']: raise ValueError('Nonpublishable observation')
 row['reportingCountry']=row['destination'] if priority[row['sourceId']]==0 else row['origin']
 if key not in chosen: chosen[key]=row
 elif priority[row['sourceId']]<priority[chosen[key]['sourceId']]:
  alternatives[key].append(chosen[key]);chosen[key]=row
 else: alternatives[key].append(row)
for year in range(1960,2025):
 rows=[(key,row) for key,row in chosen.items() if key[0]==year]
 if not rows: continue
 baseline={(a,b):v for a,b,v in json.loads((ROOT/f'dist/data/annual/{year}.json').read_text())}
 for key,row in rows:
  assert (row['origin'],row['destination']) in baseline
  row['modelValue']=baseline[row['origin'],row['destination']]
  row['alternatives']=alternatives[key]
  row['flags']=row['flags'] or ''
records=[chosen[key] for key in sorted(chosen)]
coverage={}
for code,country in json.loads((ROOT/'dist/data/countries.json').read_text()).items():
 if not country['hasData']: continue
 incoming=[r for r in records if r['destination']==code];outgoing=[r for r in records if r['origin']==code]
 coverage[code]={'incomingRecordYears':len(incoming),'outgoingRecordYears':len(outgoing),'years':sorted({r['year'] for r in incoming+outgoing}),'status':'partial_official_coverage' if incoming or outgoing else 'model_only'}
result={'schemaVersion':1,'sources':payload['sources'],'records':records,'coverage':coverage,'sourceChecksum':hashlib.sha256(raw.read_bytes()).hexdigest(),'policy':'Receiver-reported immigration by previous residence; sender-reported emigration by next residence; otherwise FLOW model. Residence stocks, citizenship flows, admissions and permit/visa counts are not substituted.'}
(ROOT/'dist/data/official/flows.json').write_text(json.dumps(result,separators=(',',':')))
(ROOT/'dist/data/official/flows.compact.json').write_text(json.dumps(pack_flows(result),separators=(',',':')))
context=json.loads((ROOT/'reference/official/belarus-poland-context.json').read_text())
(ROOT/'dist/data/official/context.json').write_text(json.dumps(context,separators=(',',':')))
print('Official selected observations:',len(records),'alternative reports:',sum(map(len,alternatives.values())),'countries:',len(coverage),'source types:',dict(Counter(r['sourceId'] for r in records)))

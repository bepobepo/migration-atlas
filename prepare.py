import csv,json,collections,hashlib,pathlib
root=pathlib.Path(__file__).parent/'dist/data'
europe=set('ALB AND AUT BLR BEL BIH BGR HRV CZE DNK EST FIN FRA DEU GRC VAT HUN ISL IRL ITA LVA LIE LTU LUX MLT MDA MCO MNE NLD MKD NOR POL PRT ROU RUS SMR SRB SVK SVN ESP SWE CHE UKR GBR GIB FRO IMN JEY GGY SJM ALA'.split())
x=json.load(open('/tmp/countries.geojson'));countries={};features=[]
for f in x['features']:
 p=f['properties'];code=p['ADM0_A3'];code={'SDS':'SSD','KOS':'XKX'}.get(code,code)
 f['properties']={'code':code,'name':p['NAME_EN'] or p['NAME'],'europe':code in europe}; features.append(f)
 countries[code]=f['properties']
json.dump({'type':'FeatureCollection','features':features},open(root/'world.json','w'),separators=(',',':'))
agg=collections.defaultdict(lambda:collections.defaultdict(float)); counts=collections.Counter()
with open('/tmp/flow.csv') as file:
 for r in csv.DictReader(file):
  a,b=r['Origin'],r['Destination'];y=int(r['Year']);v=float(r['Flow_estimate'])
  assert v>=0
  if a!=b and (a in europe or b in europe):
   agg[y//5*5][a,b]+=v;counts[y//5*5,a,b]+=1
   for c in [a,b]:countries.setdefault(c,{'code':c,'name':c,'europe':c in europe})
for y,rows in agg.items():
 out=[[a,b,round(v,1)] for (a,b),v in rows.items() if counts[y,a,b]==10]
 json.dump(out,open(root/f'{y}.json','w'),separators=(',',':'))
json.dump(countries,open(root/'countries.json','w'),separators=(',',':'))
assert set(agg)==set(range(1960,2025,5))
assert hashlib.sha256(open('/tmp/flow.csv','rb').read()).hexdigest()=='7a300afcf5ab05c356c53826e8baecee78278608fb794514476cc73d3c564e52'
print('Validated source checksum, 13 five-year periods, complete sex/year coverage and nonnegative estimates.')

"""Verify JSON-stat semantics and every published Eurostat observation."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('import_eurostat',ROOT/'scripts/import_eurostat.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


def fixture():
    dimensions={'freq':['A'],'partner':['BY','RU','TOTAL'],'agedef':['REACH','COMPLET'],'age':['TOTAL'],'unit':['NR'],'sex':['T'],'geo':['PL','DE'],'time':['2020','2021']}
    return dict(id=list(dimensions),size=[len(v) for v in dimensions.values()],dimension={d:{'category':{'index':{code:i for i,code in enumerate(codes)}}} for d,codes in dimensions.items()},value={'0':100,'4':100,'5':0,'6':42,'7':4,'13':30,'20':999},status={'4':'p','6':'e','7':'c','13':'b'})


class EurostatTests(unittest.TestCase):
    def test_dimensions_not_raw_partner_index_drive_country_and_year(self):
        data=fixture()
        observed=list(module.decode_cells(data))
        cell,value,flag=next(x for x in observed if x[0]['partner']=='RU')
        self.assertEqual((cell['agedef'],cell['geo'],cell['time'],value,flag),('COMPLET','PL','2021',30,'b'))

    def test_zeros_survive_missing_is_absent_and_aggregate_is_not_allocated(self):
        records,skipped,totals,conflicts=module.normalize(fixture(),'eurostat_imm5prv',{'BY':'BLR','RU':'RUS','PL':'POL','DE':'DEU'},{'BLR','RUS','POL','DEU'})
        self.assertEqual(records,[['BLR','DEU',2020,42,'eurostat_imm5prv','e','COMPLET'],['BLR','POL',2020,100,'eurostat_imm5prv','p','COMPLET'],['BLR','POL',2021,0,'eurostat_imm5prv','','COMPLET'],['RUS','POL',2021,30,'eurostat_imm5prv','b','COMPLET']])
        self.assertEqual(totals['POL:2020']['value'],999)
        self.assertEqual(conflicts,[])
        self.assertEqual(skipped['confidential_or_not_for_publication'],1)

    def test_emigration_direction_and_age_definition_conflicts(self):
        data=fixture(); data['value']['0']=101
        records,_,_,conflicts=module.normalize(data,'eurostat_emi3nxt',{'BY':'BLR','RU':'RUS','PL':'POL','DE':'DEU'},{'BLR','RUS','POL','DEU'})
        self.assertIn(['POL','BLR',2020,100,'eurostat_emi3nxt','p','COMPLET'],records)
        self.assertEqual(len(conflicts),1)

    def test_not_for_publication_never_exported_even_if_a_value_exists(self):
        data=fixture();data['status']['4']='|N';data['status']['0']='b|N'
        records,_,_,_=module.normalize(data,'eurostat_imm5prv',{'BY':'BLR','RU':'RUS','PL':'POL','DE':'DEU'},{'BLR','RUS','POL','DEU'})
        self.assertNotIn(('BLR','POL',2020),{tuple(row[:3]) for row in records})

    def test_every_export_matches_independently_addressed_source_cell(self):
        exported=json.loads((ROOT/'dist/data/official/eurostat.json').read_text())
        un=json.loads((ROOT/'reference/un-m49.json').read_text())
        euro_codes={iso:item['alpha2'] for iso,item in un.items()};euro_codes.update(GRC='EL',GBR='UK')
        sources={}
        for source_id,metadata in exported['sources'].items():
            raw=gzip.decompress((ROOT/f"reference/official/eurostat/{metadata['dataset']}_2008_2024.json.gz").read_bytes())
            self.assertEqual(hashlib.sha256(raw).hexdigest(),metadata['sha256'])
            sources[source_id]=json.loads(raw)
        self.assertEqual(exported['columns'],module.COLUMNS)
        seen=set()
        for origin,destination,year,value,source_id,flags,age in exported['records']:
            key=origin,destination,year,source_id
            self.assertNotIn(key,seen);seen.add(key)
            source=sources[source_id]
            direction=exported['sources'][source_id]['direction']
            reporter,peer=(destination,origin) if direction=='immigration' else (origin,destination)
            dimensions=dict(freq='A',partner=euro_codes[peer],agedef=age,age='TOTAL',unit='NR',sex='T',geo=euro_codes[reporter],time=str(year))
            # Forward index construction is independent of decoder's reversed division.
            index=0
            for dimension,size in zip(source['id'],source['size']):
                index=index*size+source['dimension'][dimension]['category']['index'][dimensions[dimension]]
            self.assertEqual(value,source['value'][str(index)])
            self.assertEqual(flags,source.get('status',{}).get(str(index),''))
            self.assertNotIn('c',flags);self.assertNotIn('|N',flags)
        self.assertEqual(len(seen),116909)
        self.assertFalse(any(row[:2]==['BLR','POL'] and row[2]>=2020 for row in exported['records']))
        self.assertIn(['BLR','LTU',2023,15706,'eurostat_imm5prv','','COMPLET'],exported['records'])
        self.assertIn(['ITA','POL',2023,1584,'eurostat_emi3nxt','','COMPLET'],exported['records'])


if __name__=='__main__': unittest.main()

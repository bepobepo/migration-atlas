"""Build 1991–2011 UK long-term migration totals from Parliament's dated ONS compilation."""
import argparse
import hashlib
import json
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'reference/official/ons-history'
OUTPUT = ROOT / 'dist/data/national/uk-history.json'
DIRECTIONS = ('immigration', 'emigration', 'net')


def build():
    receipt = json.loads((REFERENCE / 'source.json').read_text())
    workbook = REFERENCE / receipt['filename']
    if hashlib.sha256(workbook.read_bytes()).hexdigest() != receipt['sha256']:
        raise ValueError('Historical ONS workbook checksum failed')
    book = load_workbook(workbook, read_only=True, data_only=True)
    years = {}
    try:
        sheet = book['2.1(1)']
        if 'in the UK' not in sheet['B2'].value or sheet['B3'].value != 'Thousands':
            raise ValueError('Expected UK total, thousands of persons')
        if tuple(sheet.cell(5, col).value for col in range(3, 7)) != ('Year ending', 'Immigration', 'Emigration', 'Net migration'):
            raise ValueError('Unexpected column definitions in Table 2.1(1)')
        for _, year, quarter, immigration, emigration, net in sheet.iter_rows(min_row=6, max_col=6, values_only=True):
            if quarter != 'Q4' or type(year) is not int or not 1991 <= year <= 2011:
                continue
            values = (immigration, emigration, net)
            if any(type(value) is not int for value in values) or min(values[:2]) < 0 or str(year) in years:
                raise ValueError(f'Invalid annual UK observation: {year}')
            years[str(year)] = {
                field: {'value': value * 1000, 'source': 'ons_historic_ltim',
                        'flags': 'er' if field == 'net' and year >= 2001 else 'e'}
                for field, value in zip(DIRECTIONS, values)
            }
    finally:
        book.close()
    if set(years) != {str(year) for year in range(1991, 2012)}:
        raise ValueError('Historical ONS series incomplete')
    return {'countries': {'GBR': years}, 'sources': {'ons_historic_ltim': receipt['source']}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify the exported figures against the workbook')
    options = parser.parse_args()
    payload = build()
    if options.check:
        if payload != json.loads(OUTPUT.read_text()):
            raise SystemExit('Historical UK estimates differ from the pinned workbook')
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(payload, sort_keys=True, separators=(',', ':')) + '\n')
    print('Verified 63 historical UK national estimates for 1991–2011.')

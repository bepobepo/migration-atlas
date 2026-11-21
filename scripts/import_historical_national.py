"""Build reviewed ABS and UNECE nationwide calendar-year flows from pinned official tables."""
import argparse
import csv
import io
import itertools
import json
import re
from decimal import Decimal
from hashlib import sha256
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'reference/official/historical-national'
OUTPUT = ROOT / 'dist/data/national/historical.json'
FILES = {
    'abs-310101-mar2026.xlsx': '79eb16006d54bb0f0dbb1e71bdcb2fcb0e098ecb3ae2f29d6e9418a3e5a48a74',
    'abs-calendar-table13-mar2026.xlsx': 'bb488202116f9d3eb45d1fbdb0f13b5fb8e9f6b69a493de28811f6d29bc5f32f',
    'unece-long-term-immigration.px': '59ab60ea1785ccbd255308dfdc53083f7eaf359769422d9c0b6633ee31f80d31',
    'unece-long-term-emigration.px': 'ef53132e81f71618121a0f2c733f655d38a69779f97cb627f0e1c23d23a5eceb',
}
ABS_URL = 'https://www.abs.gov.au/statistics/people/population/national-state-and-territory-population/mar-2026'
UNECE_UI = 'https://w3.unece.org/PXWeb2015/pxweb/en/STAT/STAT__30-GE__99-MCH_1/'
UNECE_TABLES = {'immigration': '051_en_MCH_LT_Imm2_r.px', 'emigration': '061_en_MCH_LT_Emig2_r.px'}
SOURCES = {
    'abs_population': {
        'name': 'Australian Bureau of Statistics · National, state and territory population, Table 1',
        'url': ABS_URL, 'workbookUrl': ABS_URL + '/310101.xlsx',
        'methodologyUrl': 'https://www.abs.gov.au/methodologies/national-state-and-territory-population-methodology/mar-2026',
        'releaseDate': '2026-09-17', 'pairGroup': 'abs_population',
        'definition': 'Australia-wide overseas migration. Four calendar quarters are added for each annual measure, including the published net. ABS rounds the quarterly figures to the nearest hundred people. From September 2006, residence is measured over 12 of 16 months. Earlier estimates used 12 continuous months and included a separate migration adjustment in net migration.',
    },
}
SOURCES['abs_calendar'] = {
    **SOURCES['abs_population'],
    'name': 'Australian Bureau of Statistics · Overseas migration, Table 13',
    'workbookUrl': ABS_URL + '/31010do001_202603.xlsx',
    'definition': 'Published calendar-year estimates for all Australia, all citizenships. Migrants change residence for at least 12 months out of 16. Each count uses the national total in persons.',
}
for measure, table in UNECE_TABLES.items():
    SOURCES['unece_' + measure] = {
        'name': 'UNECE Clearing House · ' + ('Long-term immigration (Table 5.1)' if measure == 'immigration' else 'Long-term emigration (Table 6.1)'),
        'url': UNECE_UI + table + '/', 'pairGroup': 'unece_long_term',
        'definition': 'Country-reported calendar-year changes of usual residence for a year or more, covering both sexes and all citizenships. Data come from national administrative registers or retrospective estimates, subject to national definitions documented in the table.',
    }


def pinned(filename):
    data = (INPUT / filename).read_bytes()
    if sha256(data).hexdigest() != FILES[filename]:
        raise ValueError('Unexpected source checksum for ' + filename)
    return data


def abs_calendar():
    book = load_workbook(io.BytesIO(pinned('abs-calendar-table13-mar2026.xlsx')), read_only=True, data_only=True)
    try:
        rows = list(book['Table_13'].values)
    finally:
        book.close()
    col = rows[4].index('Australia')
    groups = {'OVERSEAS MIGRATION ARRIVALS': 'immigration',
              'OVERSEAS MIGRATION DEPARTURES': 'emigration', 'NET OVERSEAS MIGRATION': 'net'}
    result = {}
    measure = None
    for row in rows[5:]:
        label, people = row[0], row[col]
        if label in groups:
            measure = groups[label]
        # Quarter-section headings have no value. Fiscal year labels have a dash.
        if not re.fullmatch(r'20[0-9]{2}', str(label)) or people is None or int(label) > 2024:
            continue
        key = (int(label), measure)
        if measure is None or type(people) is not int or key in result:
            raise ValueError('Unexpected calendar row in ABS Table 13')
        result[key] = people
    if set(result) != set(itertools.product(range(2020, 2025), groups.values())):
        raise ValueError('Incomplete published national annual series')
    return result


def australian_rows():
    book = load_workbook(io.BytesIO(pinned('abs-310101-mar2026.xlsx')), read_only=True, data_only=True)
    try:
        rows = list(book['Data1'].values)
    finally:
        book.close()
    fields = {'immigration': 'A2133248J', 'emigration': 'A2133249K', 'net': 'A2133254C'}
    columns = {name: rows[9].index(series) for name, series in fields.items()}
    if any((rows[1][col], rows[3][col], rows[4][col]) != ('000', 'FLOW', 'Quarter') for col in columns.values()):
        raise ValueError('Unexpected ABS measure/unit/frequency')
    quarters = {}
    for row in rows[10:]:
        when = row[0]
        if when.year > 2024:
            continue
        year = quarters.setdefault(when.year, {})
        if when.month not in (3, 6, 9, 12) or when.month in year:
            raise ValueError('Unexpected or duplicate ABS quarter')
        year[when.month] = {}
        for name, col in columns.items():
            persons = Decimal(str(row[col])) * 1000
            if persons != persons.to_integral_value() or (name != 'net' and persons < 0):
                raise ValueError('Invalid ABS value')
            year[when.month][name] = int(persons)
    annual = abs_calendar()
    for year, periods in quarters.items():
        if periods.keys() != {3, 6, 9, 12}:
            if year == 1981 and periods.keys() == {6, 9, 12}:
                continue
            raise ValueError('Incomplete ABS calendar year')
        for name in fields:
            quarterly_sum = sum(period[name] for period in periods.values())
            value = annual.get((year, name), quarterly_sum)
            if abs(value - quarterly_sum) > 200:
                raise ValueError('Published calendar and quarterly totals exceed rounding tolerance')
            yield 'AUS', year, name, {
                'value': value, 'source': 'abs_calendar' if (year, name) in annual else 'abs_population',
                'flags': 'eb' if year == 2006 else 'e',
            }


def compatible(country, year, measure):
    # Review of the country-specific CELLNOTEX fields in the pinned PX tables.
    if country in ('ARM', 'KGZ', 'UZB', 'MDA'):
        return True
    if country == 'RUS':
        return year < (2011 if measure == 'immigration' else 2012)
    if country == 'UKR':
        return measure == 'emigration' and year < 2014
    return False


def unece_rows(measure):
    contents = pinned('unece-long-term-' + measure + '.px').decode('cp1252')
    metadata, raw = contents.split('\nDATA=', 1)
    def dimension(field):
        value = re.search(r'^' + re.escape(field) + r'=(.*?);', metadata, re.MULTILINE)
        if not value:
            raise ValueError('Missing PX dimension ' + field)
        return next(csv.reader([value[1]]))

    if dimension('STUB') != ['Country', 'Citizenship', 'Sex'] or dimension('HEADING') != ['Year'] or dimension('UNITS') != ['Persons']:
        raise ValueError('UNECE table structure changed')
    countries = dimension('CODES("Country")')
    citizenships = dimension('VALUES("Citizenship")')
    sexes = dimension('VALUES("Sex")')
    years = list(map(int, dimension('VALUES("Year")')))
    total = 'Total inflow' if measure == 'immigration' else 'Total outflow'
    if total not in citizenships or 'Both sexes' not in sexes:
        raise ValueError('Missing total indicator')
    mapping = json.loads((ROOT / 'reference/stock/m49-iso3.json').read_text())
    iso = {number.zfill(3): code for number, code in mapping.items()}
    cells = raw.strip().removesuffix(';').split()
    coordinates = itertools.product(countries, citizenships, sexes, years)
    for (code, citizenship, sex, year), value in zip(coordinates, cells, strict=True):
        country = iso[code]
        if (citizenship != total or sex != 'Both sexes' or value == '".."' or not compatible(country, year, measure)):
            continue
        if not value.isdecimal():
            raise ValueError('Unexpected UNECE value ' + value)
        yield country, year, measure, {'value': int(value), 'source': 'unece_' + measure, 'flags': ''}


def build():
    countries = {}
    rows = itertools.chain(australian_rows(), *[unece_rows(d) for d in UNECE_TABLES])
    for code, year, measure, record in rows:
        entry = countries.setdefault(code, {}).setdefault(year, {})
        if measure in entry:
            raise ValueError(f'Duplicate {code} {year} {measure}')
        entry[measure] = record
    return {'sources': SOURCES, 'countries': countries}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = build()
    saved = json.dumps(result, separators=(',', ':'), sort_keys=True, ensure_ascii=False) + '\n'
    if args.check:
        if OUTPUT.read_text() != saved:
            raise SystemExit('National flow export differs from official source tables')
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(saved)
    print('Verified Australian and UNECE national flows:', {country: len(years) for country, years in result['countries'].items()})

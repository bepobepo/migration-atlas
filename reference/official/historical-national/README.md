# Historical national flow sources

The atlas uses nationwide totals across all citizenships for full calendar years. The files in this directory are official snapshots retrieved on 21 November 2026. File hashes are pinned in the importer. Run `python scripts/import_historical_national.py --check` to reproduce the export offline.

## Australia

The Australian Bureau of Statistics published its March 2026 population release on 17 September 2026. Table 1 (series A2133248J, A2133249K and A2133254C) supplies quarterly national overseas arrivals, departures and net migration from June 1981. The first complete calendar year is 1982. The importer sums four quarters and converts thousands to persons. Table 13 in the companion workbook provides higher-precision calendar-year totals for 2020–2024. For each measure and year the importer checks that the annual row agrees with the four rounded quarters within 200 people.

Each annual net uses ABS's own net measure. In the earlier years ABS adjusted the net for differences between intended and actual movements. In September 2006 the residence rule changed from 12 continuous months to 12 months out of 16. The 2006 figures carry a break flag. All Australian values are statistics-agency estimates. The national totals include Australia's other territories according to the ABS definition.

[Data release and spreadsheets](https://www.abs.gov.au/statistics/people/population/national-state-and-territory-population/mar-2026) · [ABS methodology](https://www.abs.gov.au/methodologies/national-state-and-territory-population-methodology/mar-2026).

## UNECE Clearing House

The UN Economic Commission for Europe republishes submissions from national statistical offices. Tables 5.1 and 6.1 define long-term migration as a change in country of usual residence lasting at least one year, subject to reporting-country exceptions. The importer selects the explicit total inflow or outflow, both sexes, persons, and one reference year. Coordinates and country codes are decoded from the PX files. The importer retains reported zeros and leaves missing values unavailable.

The two PX files include the original footnotes in the `CELLNOTEX` field. Armenia, Kyrgyzstan and Uzbekistan supplied administrative or population-register reports. Moldova supplied departures from its population register. The retained Russian immigration observations precede 2011, and its emigration observations precede 2012, when registration rules changed to nine months. Ukraine's departure observations precede the 2014 change in territorial coverage.

Excluded entries include Azerbaijani foreigner-only permits, Belarusian and Kazakh permit-based measures, Georgia's six-month measure and associated census back-projections, Ukraine's 2001 lifetime-mobility figure and 2011–2012 incoming permit series, and Ukraine's restricted territorial coverage from 2014. Some country-year pairs have only one comparable direction.

[UNECE immigration, table 5.1](https://w3.unece.org/PXWeb2015/pxweb/en/STAT/STAT__30-GE__99-MCH_1/051_en_MCH_LT_Imm2_r.px/) · [UNECE emigration, table 6.1](https://w3.unece.org/PXWeb2015/pxweb/en/STAT/STAT__30-GE__99-MCH_1/061_en_MCH_LT_Emig2_r.px/).

The snapshots were downloaded by posting a PXWeb query to each table under `https://w3.unece.org/PXWeb2015/api/v1/en/STAT/30-GE/99-MCH_1/`. The query selected all values in Country, Citizenship, Sex and Year with response format `px`. The full source preserves the country exceptions recorded by the publisher.

## Other sources checked

UNdata Demographic Yearbook tables 404 and 407 mix source types, residence rules and populations. For example Japan’s table 404 total for 2023 contains over 35 million border movements, Canada's series counts immigrants granted permanent status, and the United States entry covers foreign citizens only. A generic “Total” cell cannot establish coverage of all usual-residence changes. The atlas uses the direct ABS national source for Australia. These UNdata series did not supply a comparable global gross-flow series for this release.

[UNdata incoming migrants](https://data.un.org/Data.aspx?d=POP&f=tableCode%3A404) · [UNdata departing migrants](https://data.un.org/Data.aspx?d=POP&f=tableCode%3A407) · [Statistics Canada component definitions](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710004001).

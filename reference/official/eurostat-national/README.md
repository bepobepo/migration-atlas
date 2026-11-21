# Eurostat national immigration and emigration

The six archives contain Eurostat's own-country annual all-person totals retrieved on 21 November 2026. The data provider updated the tables on 13 November 2026. Each table's request URL and the SHA-256 of its uncompressed response appear in [sources.json](sources.json).

The queries request 1950–2024. Eurostat's earliest available gross figure in these tables is from 1990. The output contains 1,040 immigration and 1,009 emigration observations across 45 atlas countries through 2024. A country can have one direction without the other. In 1990, 17 countries have an immigration figure and 16 have an emigration figure. A published zero is preserved. Missing and restricted observations have no value.

## How a country-year is selected

1. Use the reporting country's published all-partner total for annual immigration or emigration. The residence-partner tables start in 1998. [Immigration by previous residence](https://ec.europa.eu/eurostat/databrowser/view/migr_imm5prv/default/table?lang=en) · [Emigration by next residence](https://ec.europa.eu/eurostat/databrowser/view/migr_emi3nxt/default/table?lang=en)
2. Fill a missing direction or year from the country's annual all-age, both-sexes total. These tables reach back to 1990. [Immigration by age and sex](https://ec.europa.eu/eurostat/databrowser/view/migr_imm8/default/table?lang=en) · [Emigration by age and sex](https://ec.europa.eu/eurostat/databrowser/view/migr_emi2/default/table?lang=en)
3. Check the published all-citizenships totals for remaining gaps. None supplied additional verified whole-resident counts. Eurostat lists 1,020,527 for the United States in 2004. Its breakdown records only 76 under United States citizenship and lacks the reporting-country-national observation. An independent all-resident measure for that year, including returning US citizens, could not be established from Eurostat. That observation is withheld from the national overview. [US citizenship breakdown](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/migr_imm1ctz?lang=en&freq=A&time=2004&age=TOTAL&sex=T&unit=NR&geo=US) · [Pinned breakdown](us_2004_citizenship_breakdown.json.gz)

Every series uses annual frequency, persons, both sexes and all ages. The importer selects the geographic reporting country by its Eurostat code using the atlas ISO mapping. The EU aggregate and non-atlas areas are excluded. Where both age definitions exist, COMPLET takes precedence over REACH. All overlapping age definitions in the pinned observations agree in value. Across different tables there are occasional differences, so the importer chooses one observation per direction and year. The export retains the chosen source, age definition and original publication flags. National definitions and reporting practices can change across periods, especially before EU migration-statistics harmonisation. [Eurostat metadata and national exceptions](https://ec.europa.eu/eurostat/cache/metadata/en/migr_immi_esms.htm)

Two further sets of observations have a documented narrower scope.

- For Azerbaijan, Eurostat's 2005 arrivals/departures (2,013/2,906) and 2007 observations (1,954/3,083) reproduce the State Statistical Committee's counts of people moving for permanent residence. These four entries are withheld from the all-resident headline. [Committee Table 7.2](https://www.stat.gov.az/source/demoqraphy/en/007_2en.xls) · [Archived table](az_permanent_residence.xls)
- For Ukraine, Eurostat's 19,121 emigrants in 2020 and 22,587 in 2021 reproduce the State Statistics Service figures. The agency's footnote excludes Crimea, Sevastopol and part of Donetsk and Luhansk from these years. The national overview withholds both geographically partial counts. [State Statistics Service migration dataset](https://stat.gov.ua/uk/datasets/mihratsiynyy-rukh-naselennya) · [Archived agency workbook](ukraine_territorial_coverage.zip)

## Reproduction and cross-check

Run `python scripts/import_national_eurostat.py` to rebuild or `python scripts/import_national_eurostat.py --check` to verify the current export. The importer validates all six archive checksums and compares the full rebuilt payload, including source flags, with the published JSON.

The November national series includes updated Portugal immigration observations for 2021–2023 and emigration observations for 2021–2024 compared with the older Eurostat snapshots committed in the UK update. For example, the newer 2022 national immigration figure is 495,979, compared with 167,098 in the earlier release. Every other numeric own-reporter observation in the earlier all-partner archives matches the November release. Route figures and country totals each retain their own release and coverage.

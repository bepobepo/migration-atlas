# Migration Atlas

Static educational migration map; serve `dist` over HTTP. No build or backend is required. See [REVIEW.md](REVIEW.md) for the functional/data review and verification limits.

**Official statistics** is the default data view. It shows imported Eurostat annual residence flows where available (1998–2024), labels partial coverage, and leaves missing official figures unavailable. Source flags distinguish official estimates and provisional values. **Best available comparison** adds FLOW estimates for gaps; **FLOW model only** shows the unchanged model for 1960–2024. Source provenance is visible for each direction and range. The national overview reaches 1950. Bilateral flow comparisons begin in 1960.

FLOW v1.0 (CC BY) sums annual female and male estimates across the inclusive selected years. Source: Beyer RM, Schewe J, Abel GJ, Warner K, Campo SR (2026), *Annual Migration Flow Estimates by Sex between all Countries since 1960*, Scientific Data 13 (1389), https://www.nature.com/articles/s41597-026-07983-w. It supports broad trends rather than verified individual-corridor headcounts.

## Reproduce

Obtain https://osf.io/download/p58ay/ as `/tmp/flow.csv`, and Natural Earth's `ne_110m_admin_0_countries.geojson` as `/tmp/countries.geojson`. Run `python prepare.py` and `python make_events.py`. Optional `--source`, `--geometry`, `--output` arguments select other paths. The processor checks source version, duplicate records and full year/sex coverage before writing. The original 118.7 MB CSV is not shipped to browsers.

Names and schematic map endpoints are pinned in `reference/countries.json`; provenance is in `reference/README.md`. Natural Earth is public domain. D3 v7 uses the ISC license.

## Exploring a country

Choose a country on the main page to see its arrivals and departures for the selected years, including how much of each figure is covered by the sources. Choose **Who arrived?** to rank origins or **Where did people go?** to rank destinations. The comparison shows how the leading partners changed from the preceding period. Open a route to see both directions, yearly evidence and available historical context. Scrubbing the timeline also updates the ranked figures and the dates opened by a route card. **Discover routes** opens selected official comparisons with the countries and dates already set.

The national overview covers all 194 countries used for the routes and seven additional map areas from 1950 through 2024. Four selectable map features have no separate series in the national sources. By default it follows the map's date range. **Full history** and the national date fields let you explore earlier periods independently. National annual figures, sources, publication flags, and measurement definitions are available under **Annual figures and sources**. Multi-year totals require a value in each selected year for that measure.

The national series prioritizes compatible published nationwide figures. A source's published net takes precedence over subtracting rounded or separately revised components. Where available, net can also be calculated from compatible national components. UN World Population Prospects 2024 supplies the remaining net values. Its 1950–2023 figures are historical demographic estimates and its 2024 medium variant is a projection. Unknown gross arrivals and departures stay unavailable. The atlas never allocates a national balance to country pairs. Mixed annual series and periods including projections carry a label alongside the figure. [UN WPP](https://population.un.org/wpp/) · [Eurostat national totals](reference/official/eurostat-national/README.md) · [ONS Table 1](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/longterminternationalimmigrationemigrationandnetmigrationflowsprovisional/yearendingdecember2025)

The UK uses ONS estimates back to 1991. Australia has national gross and net figures from 1982, and New Zealand from 2001. Canada’s calendar-year net estimates from 1972 use the Statistics Canada demographic components. Eurostat national totals begin in 1990, with different reporting years and definitions by country. UNECE supplies additional historical flows. [UK sources](reference/official/ons-history/README.md) · [Australia and UNECE sources](reference/official/historical-national/README.md) · [Statistics Canada](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710004001) · [Stats NZ](https://www.stats.govt.nz/information-releases/international-migration-september-2026/)

Source archives and retrieval details are in `reference/official`. Rebuild the per-country payloads with `python scripts/build_national.py`. Verify deterministic output with `python scripts/build_national.py --check` and check the exported series against the source datasets with `python tests/national_flows_test.py`.

**Who lives here?** shows the international migrant population resident in the selected country on 1 July of a published observation year. The UN DESA International Migrant Stock 2024 covers eight snapshots from 1990 to 2024. For the 194 destinations, the UN records birthplace data for 147, citizenship data for 42, both sources for Benin and Guinea, and imputed figures for Bosnia and Herzegovina, Eritrea and Somalia. Refugee and displacement figures supplement 142 destination series across these groups. The country view displays the destination’s source definition and geographic coverage notes. The headline compares migrant residents with the same destination’s total population on 1 July, using UN World Population Prospects 2024. The 2024 denominator is the medium-variant projection. The origin table uses the destination’s migrant residents as its denominator. Changes of residence over a time range use separate flow data. [UN DESA release](https://www.un.org/development/desa/pd/content/International-migrant-stock)

The pinned workbook, checksum and provenance are in `reference/stock/`. Rebuild with `python scripts/import_migrant_stock.py` and verify with `python tests/resident_stock_test.py`. Both commands use openpyxl. The browser fetches a single destination’s stock file on demand.

Advanced selection supports multiple counterparts, Everywhere and either arrows or color. Search and the arrow limit leave the selected range totals and coverage intact.

Use **From year**, **To year**, and **Apply range** on the timeline or in route details for any inclusive range within 1960–2024, including a single year. For the origins of immigration, choose a country and **Incoming**; **Outgoing** shows emigration, while **All movement** combines the two. Counts use integer tenths internally; official figures retain their published precision. Five-year files and annual files are reconciled through one source resolver. Failed loads never produce a partial total. Published official gaps are shown as unavailable, and reported subtotals with incomplete coverage are labelled rather than presented as complete range totals. Country/area selectors explicitly mark the 11 map features without FLOW estimates.

Historical drivers are sourced stories overlapping the chosen years and direction. Opening one retains the selected range; a link returns to the figures. The 32 curated stories do not explain every corridor or assign counts to causes. Missing historical coverage is explicitly stated. Arrow shafts are limited to 0.7–2.4 screen pixels, arrowheads to a 7-pixel marker, and country points to a 2.5-pixel radius across zoom and viewport changes.

## Checks

Run `npm ci && npm test` for DOM integration tests and `python tests/reference_test.py` for country identity, UN M49 and duplicate-code regression checks. Run `python tests/geography_audit.py /path/to/ne_10m_admin_0_countries.geojson` to verify all map identities and endpoints against canonical administrative country features. Run `python tests/data_test.py /path/to/flow.csv` to independently reconcile all 2,433,730 annual and 486,746 five-year estimates. `node --check dist/app.js` validates JavaScript syntax. DOM checks do not replace full browser visual and accessibility testing.

## Color movement playback

Choose a focus country, Incoming or Outgoing, and Everywhere or selected counterparts. A new selection previews the full range. Press Play to replay from the start; playback accumulates available annual observations and stops at the selected end. Official coverage gaps remain explicit and are not interpreted as years with no migration. Pause, restart, scrub, and 1×/2×/4× speed are available. Color movement is the default country view; Arrows remains available.

Volume uses a square-root blue scale relative to the largest counterpart’s final selected-range total. The focal country is outlined and stays white; zero-flow and unselected countries stay white. Outgoing compares recipients, Incoming compares contributing origins, and All movement compares combined totals. The scale stays fixed during playback and inspection. Population mode uses cumulative movements divided by each country's fixed start-year midyear population, with a square-root color scale saturating at 10%. Displayed ratios are uncapped. Gross movements can include repeat migration; they do not measure net population growth. World Bank WDI SP.POP.TOTL is archived in `reference/wdi-population.json.gz`; `python build_population.py <response.json>` reproduces the compact baseline. Missing PSE values before 1990 remain unavailable.

The comparison-model baseline covers all 194 FLOW countries and 37,442 directed country pairs worldwide; official coverage is partial. `prepare.py` generates worldwide annual/five-year exports and compact incoming/outgoing series. `tests/data_test.py` independently checks every one of 2,433,730 annual sums and both series orientations against the original CSV. `tests/population_test.py` checks all 12,610 country-years against the archived WDI response. `tests/color.test.cjs` covers the color scales, example scenarios, inspection and playback controls.


## Focused map and historical context

Playback controls, year scrubbing, cumulative counts and the quantitative legend sit directly below the map. Selection/dates, contributions, migration details, historical drivers, routes and methodology can be collapsed independently. **Focus map** hides ancillary panels and expands the map; **Restore panels** restores section states without changing playback or zoom. Section preferences persist locally; Focus mode starts off after reload.

History has explicit route, origin-country and destination-country scopes, matched by one shared date/direction filter. Venezuela → USA now shows Venezuelan country context from 2014 and a separate 2024 election/mobility record. The Spain-specific story stays confined to Venezuela → Spain. These accounts identify relevant historical circumstances rather than attributing the full migration total to a cause. Sources: [UNHCR, May 2018](https://data.unhcr.org/en/documents/download/63883) and [R4V, 2024 end-year report](https://rmrp.r4v.info/eyr2024/).

## Official statistics and country inventory — 6 November 2026

The default **Official statistics** view uses destination-reported annual immigration by previous residence, then origin-reported emigration by next residence. It never fills missing official observations with model values. **Best available comparison** uses the same official priority and fills gaps with FLOW; **FLOW model only** supplies a consistent model comparison. Every count surface and playback series uses `dist/provenance.js`; raw FLOW exports stay intact for independent reconciliation. Published numeric zero is retained; missing/confidential observations stay unavailable. Official-only aggregates distinguish complete figures from reported subtotals with partial coverage.

Four pinned Eurostat snapshots contain 175,496 source observations for 1998–2024. The map selects one report for each of **167,073 distinct route-years** (90,706 destination reports and 76,367 origin reports). Another 8,423 reports remain available for comparison. Official reporting covers 6.9% of the 2,433,730 global annual route-years in the model. Forty-two countries contribute their own reports. Earlier national reporting arrangements can differ from the harmonised definitions used since 2008. The full audit export is archived at `reference/official/flows.json.gz`. Sources can be estimated/imputed, provisional or subject to definition breaks, and those flags remain visible. Mixed totals combine differing provenance and must not be interpreted as a consistently measured official series.

Route details show separate source coverage for both directions, annual published values, reporting countries, flags, alternatives and FLOW comparisons. The playback dock retains the source label in Focus mode. The searchable **Country coverage & sources** dialog records imported coverage and research status for every source country. See [OFFICIAL_SOURCES.md](OFFICIAL_SOURCES.md) and [NATIONAL_SOURCE_AUDIT.md](NATIONAL_SOURCE_AUDIT.md): all 194 country source searches have an outcome; 192 have verified primary metadata and 2 remain unresolved. Findings and source definitions are searchable in the app. This audit imports no new national figures, and metadata candidates never count as official observations.

Belarus → Poland in 2020–2024 still lacks a comparable annual flow in these official imports, so the default arrival figure is unavailable. Dated official residence figures are prominent: approximately 28,000 residence-document holders in August 2020, nearly 124,500 on 29 February 2024, and approximately 133,000 Belarusian citizens holding Polish residence permits, excluding visas, on 30 June 2024. The latest applicable figure is a point-in-time residence stock, not arrivals during the selected range. Stocks are never summed, substituted for flows, or used to size arrows and migration shading. The optional FLOW comparison totals 19,476.5 modelled movements for 2020–2024; it is **not validated as a headcount of the post-2020 exodus**.

Reproduce the official overlay offline from pinned snapshots:

```sh
python scripts/import_eurostat.py
python scripts/build_official.py
python scripts/build_coverage.py
python tests/eurostat_test.py
python tests/official_overlay_test.py
python tests/coverage_test.py
npm test
```

Use `python scripts/import_eurostat.py --download` only for an intentional refresh; review changed definitions, flags, dates and country-year coverage before rebuilding. The importer archives response checksums, retrieval dates and provider update dates. [Eurostat migration metadata](https://ec.europa.eu/eurostat/cache/metadata/en/migr_immi_esms.htm) documents reporting definitions and national exceptions. Official publication does not guarantee a complete observed headcount; protection populations, citizenship and administrative classifications require separate attention. Browser visual QA remains unverified when the prescribed browser tooling is unavailable.

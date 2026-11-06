# Migration Atlas

Static educational migration map; serve `dist` over HTTP. No build or backend is required. See [REVIEW.md](REVIEW.md) for the functional/data review and verification limits.

**Official statistics** is the default data view. It shows imported Eurostat annual residence flows where available (2008–2024), labels partial coverage, and leaves missing official figures unavailable. Source flags distinguish official estimates and provisional values. **Best available comparison** adds FLOW estimates for gaps; **FLOW model only** shows the unchanged model for 1960–2024. Source provenance is visible for each direction and range. The 1950s have historical context only.

FLOW v1.0 (CC BY) sums annual female and male estimates across the inclusive selected years. Source: Beyer RM, Schewe J, Abel GJ, Warner K, Campo SR (2026), *Annual Migration Flow Estimates by Sex between all Countries since 1960*, Scientific Data 13 (1389), https://www.nature.com/articles/s41597-026-07983-w. It supports broad trends rather than verified individual-corridor headcounts.

## Reproduce

Obtain https://osf.io/download/p58ay/ as `/tmp/flow.csv`, and Natural Earth's `ne_110m_admin_0_countries.geojson` as `/tmp/countries.geojson`. Run `python prepare.py` and `python make_events.py`. Optional `--source`, `--geometry`, `--output` arguments select other paths. The processor checks source version, duplicate records and full year/sex coverage before writing. The original 118.7 MB CSV is not shipped to browsers.

Names and schematic map endpoints are pinned in `reference/countries.json`; provenance is in `reference/README.md`. Natural Earth is public domain. D3 v7 uses the ISC license.

Choose an origin under **From** and **Everywhere** under **To** to explore all covered outgoing destinations. The map compares positive reported flows; arrows can show all selected destinations or the largest 30. Missing official observations do not become zeroes. Search and the arrow limit do not change the selected reported subtotal or its coverage label. Click an arrow for its tooltip or a destination for full migration details; the details include a link back to all destinations. Worldwide counterparts are included for every source country.

Use **From year**, **To year**, and **Apply range** on the timeline or in route details for any inclusive range within 1960–2024, including a single year. For total immigration, choose a country and **Incoming**; **Outgoing** shows emigration, while **All movement** combines the two. Counts use integer tenths internally; official figures retain their published precision. Five-year files and annual files are reconciled through one source resolver. Failed loads never produce a partial total. Published official gaps are shown as unavailable, and reported subtotals with incomplete coverage are labelled rather than presented as complete range totals. Country/area selectors explicitly mark the 11 map features without FLOW estimates.

Historical drivers are sourced stories overlapping the chosen years and direction. Opening one retains the selected range; a link returns to the figures. The 20 curated stories do not explain every corridor or assign counts to causes. Missing historical coverage is explicitly stated. Arrow shafts are limited to 0.7–2.4 screen pixels, arrowheads to a 7-pixel marker, and country points to a 2.5-pixel radius across zoom and viewport changes.

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

The pinned Eurostat snapshots contain 116,909 source observations for 2008–2024. Choosing one reporter per corridor/year produces **111,297 official observations** (60,056 destination reports and 51,241 origin reports); 5,612 alternative reports remain inspectable and are never summed or averaged. This is about 4.6% of the 2,433,730 global annual country-pair/year combinations, so official world coverage remains limited. Thirty countries contribute their own reports; other countries appear through partner reports. Coverage remains partial. Sources can be estimated/imputed, provisional or subject to definition breaks, and those flags remain visible. Mixed totals combine differing provenance and must not be interpreted as a consistently measured official series.

Route details show separate source coverage for both directions, annual published values, reporting countries, flags, alternatives and FLOW comparisons. The playback dock retains the source label in Focus mode. The searchable **Country coverage & sources** dialog records imported coverage and research status for every source country. See [OFFICIAL_SOURCES.md](OFFICIAL_SOURCES.md) and [reference/official-sources.json](reference/official-sources.json): eleven national agencies' metadata was checked; 183 have not been individually verified. Candidate sources are not presented as imported official data.

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

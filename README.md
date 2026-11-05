# Migration Atlas

Static educational migration map; serve `dist` over HTTP. No build or backend is required. See [REVIEW.md](REVIEW.md) for the functional/data review and verification limits.

Data: FLOW v1.0 (CC BY), 1960–2024. Annual female/male estimates are summed across every calendar year in the selected range, including both endpoints. Five-year quick steps remain available. Source: Beyer RM, Schewe J, Abel GJ, Warner K, Campo SR (2026), *Annual Migration Flow Estimates by Sex between all Countries since 1960*, Scientific Data 13 (1389), https://www.nature.com/articles/s41597-026-07983-w. The model supports broad trends; precise individual-corridor counts should use official records where available. 1950s have historical context only.

## Reproduce

Obtain https://osf.io/download/p58ay/ as `/tmp/flow.csv`, and Natural Earth's `ne_110m_admin_0_countries.geojson` as `/tmp/countries.geojson`. Run `python prepare.py` and `python make_events.py`. Optional `--source`, `--geometry`, `--output` arguments select other paths. The processor checks source version, duplicate records and full year/sex coverage before writing. The original 118.7 MB CSV is not shipped to browsers.

Names and schematic map endpoints are pinned in `reference/countries.json`; provenance is in `reference/README.md`. Natural Earth is public domain. D3 v7 uses the ISC license.

Choose an origin under **From** and **Everywhere** under **To** to explore all covered outgoing destinations. This view shows every positive estimate on the map by default, with an option to limit arrows to the largest 30, and a total for the selected years. Search and the arrow limit do not change the total. Click an arrow for its tooltip or a destination for full migration details; the details include a link back to all destinations. Worldwide counterparts are included for every source country.

Use **From year**, **To year**, and **Apply range** on the timeline or in route details for any inclusive range within 1960–2024, including a single year. For total immigration, choose a country and **Incoming**; **Outgoing** shows emigration, while **All movement** combines the two. Totals use integer tenths internally and round only for display. Complete five-year files are reused where possible, with annual files for remaining years; failed or incomplete coverage never produces a partial total. Country/area selectors explicitly mark the 11 map features without FLOW estimates.

Historical drivers are sourced stories overlapping the chosen years and direction. Opening one retains the selected range; a link returns to the figures. The 20 curated stories do not explain every corridor or assign counts to causes. Missing historical coverage is explicitly stated. Arrow shafts are limited to 0.7–2.4 screen pixels, arrowheads to a 7-pixel marker, and country points to a 2.5-pixel radius across zoom and viewport changes.

## Checks

Run `npm ci && npm test` for DOM integration tests and `python tests/reference_test.py` for country identity, UN M49 and duplicate-code regression checks. Run `python tests/geography_audit.py /path/to/ne_10m_admin_0_countries.geojson` to verify all map identities and endpoints against canonical administrative country features. Run `python tests/data_test.py /path/to/flow.csv` to independently reconcile all 2,433,730 annual and 486,746 five-year estimates. `node --check dist/app.js` validates JavaScript syntax. DOM checks do not replace full browser visual and accessibility testing.

## Color movement playback

Choose a focus country, Incoming or Outgoing, and Everywhere or selected counterparts. A new selection previews the full range. Press Play to replay from the start; playback accumulates complete annual observations and stops at the selected end. Pause, restart, scrub, and 1×/2×/4× speed are available. Color movement is the default country view; Arrows remains available.

Volume uses a square-root blue scale relative to the largest counterpart’s final selected-range total. The focal country is outlined and stays white; zero-flow and unselected countries stay white. Outgoing compares recipients, Incoming compares contributing origins, and All movement compares combined totals. The scale stays fixed during playback and inspection. Population mode uses cumulative movements divided by each country's fixed start-year midyear population, with a square-root color scale saturating at 10%. Displayed ratios are uncapped. Gross movements can include repeat migration; they do not measure net population growth. World Bank WDI SP.POP.TOTL is archived in `reference/wdi-population.json.gz`; `python build_population.py <response.json>` reproduces the compact baseline. Missing PSE values before 1990 remain unavailable.

Coverage now includes all 194 FLOW countries and 37,442 directed country pairs worldwide. `prepare.py` generates worldwide annual/five-year exports and compact incoming/outgoing series. `tests/data_test.py` independently checks every one of 2,433,730 annual sums and both series orientations against the original CSV. `tests/population_test.py` checks all 12,610 country-years against the archived WDI response. `tests/color.test.cjs` covers the color scales, example scenarios, inspection and playback controls.


## Focused map and historical context

Playback controls, year scrubbing, cumulative counts and the quantitative legend sit directly below the map. Selection/dates, contributions, migration details, historical drivers, routes and methodology can be collapsed independently. **Focus map** hides ancillary panels and expands the map; **Restore panels** restores section states without changing playback or zoom. Section preferences persist locally; Focus mode starts off after reload.

History has explicit route, origin-country and destination-country scopes, matched by one shared date/direction filter. Venezuela → USA now shows Venezuelan country context from 2014 and a separate 2024 election/mobility record. The Spain-specific story stays confined to Venezuela → Spain. These accounts identify relevant historical circumstances rather than attributing the full migration total to a cause. Sources: [UNHCR, May 2018](https://data.unhcr.org/en/documents/download/63883) and [R4V, 2024 end-year report](https://rmrp.r4v.info/eyr2024/).

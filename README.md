# Migration Atlas

Static educational migration map; serve `dist` over HTTP. No build or backend is required. See [REVIEW.md](REVIEW.md) for the functional/data review and verification limits.

Data: FLOW v1.0 (CC BY), 1960–2024. Annual female/male estimates are summed across every calendar year in the selected range, including both endpoints. Five-year quick steps remain available. Source: Beyer RM, Schewe J, Abel GJ, Warner K, Campo SR (2026), *Annual Migration Flow Estimates by Sex between all Countries since 1960*, Scientific Data 13 (1389), https://www.nature.com/articles/s41597-026-07983-w. The model supports broad trends; precise individual-corridor counts should use official records where available. 1950s have historical context only.

## Reproduce

Obtain https://osf.io/download/p58ay/ as `/tmp/flow.csv`, and Natural Earth's `ne_110m_admin_0_countries.geojson` as `/tmp/countries.geojson`. Run `python prepare.py` and `python make_events.py`. Optional `--source`, `--geometry`, `--output` arguments select other paths. The processor checks source version, duplicate records and full year/sex coverage before writing. The original 118.7 MB CSV is not shipped to browsers.

Names and schematic map endpoints are pinned in `reference/countries.json`; provenance is in `reference/README.md`. Natural Earth is public domain. D3 v7 uses the ISC license.

Choose an origin under **From** and **Everywhere** under **To** to explore all covered outgoing destinations. This view shows every positive estimate on the map by default, with an option to limit arrows to the largest 30, and a total for the selected years. Search and the arrow limit do not change the total. Click an arrow for its tooltip or a destination for full migration details; the details include a link back to all destinations. Origins outside Europe cover European destinations only in stage 1, and their totals are explicitly labelled accordingly.

Use **From year**, **To year**, and **Apply range** on the timeline or in route details for any inclusive range within 1960–2024, including a single year. For total immigration, choose a country and **Incoming**; **Outgoing** shows emigration, while **All movement** combines the two. Totals use integer tenths internally and round only for display. Complete five-year files are reused where possible, with annual files for remaining years; failed or incomplete coverage never produces a partial total. Country/area selectors explicitly mark the 11 map features without FLOW estimates.

Historical drivers are sourced stories overlapping the chosen years and direction. Opening one retains the selected range; a link returns to the figures. The 18 curated stories do not explain every corridor or assign counts to causes. Missing historical coverage is explicitly stated. Arrow shafts are limited to 0.7–2.4 screen pixels, arrowheads to a 7-pixel marker, and country points to a 2.5-pixel radius across zoom and viewport changes.

## Checks

Run `npm ci && npm test` for DOM integration tests and `python tests/reference_test.py` for country identity, UN M49 and duplicate-code regression checks. Run `python tests/geography_audit.py /path/to/ne_10m_admin_0_countries.geojson` to verify all map identities and endpoints against canonical administrative country features. Run `python tests/data_test.py /path/to/flow.csv` to independently reconcile all 961,480 annual and 192,296 five-year estimates. `node --check dist/app.js` validates JavaScript syntax. DOM checks do not replace full browser visual and accessibility testing.

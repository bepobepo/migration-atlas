# Migration Atlas

Static educational migration map; serve `dist` over HTTP. No build or backend is required. See [REVIEW.md](REVIEW.md) for the functional/data review and verification limits.

Data: FLOW v1.0 (CC BY), 1960–2024. Annual female/male estimates are summed into complete five-year periods. Source: Beyer RM, Schewe J, Abel GJ, Warner K, Campo SR (2026), *Annual Migration Flow Estimates by Sex between all Countries since 1960*, Scientific Data 13 (1389), https://www.nature.com/articles/s41597-026-07983-w. The model supports broad trends; precise individual-corridor counts should use official records where available. 1950s have historical context only.

## Reproduce

Obtain https://osf.io/download/p58ay/ as `/tmp/flow.csv`, and Natural Earth's `ne_110m_admin_0_countries.geojson` as `/tmp/countries.geojson`. Run `python prepare.py` and `python make_events.py`. Optional `--source`, `--geometry`, `--output` arguments select other paths. The processor checks source version, duplicate records and full year/sex coverage before writing. The original 118.7 MB CSV is not shipped to browsers.

Names and schematic map endpoints are pinned in `reference/countries.json`; provenance is in `reference/README.md`. Natural Earth is public domain. D3 v7 uses the ISC license.

Choose an origin under **From** and **Everywhere** under **To** to explore all covered outgoing destinations. This view shows every positive estimate on the map by default, with an option to limit arrows to the largest 30, and a total for the five-year period. Search and the arrow limit do not change the total. Click an arrow for its tooltip or a destination for full migration details; the details include a link back to all destinations. Origins outside Europe cover European destinations only in stage 1, and their totals are explicitly labelled accordingly.

## Checks

Run `npm ci && npm test` for DOM integration tests and `python tests/reference_test.py` for country identity and duplicate-code regression checks. Run `python tests/data_test.py /path/to/flow.csv` to independently reconcile all exported values and metadata. `node --check dist/app.js` validates JavaScript syntax. DOM checks do not replace full browser visual and accessibility testing.

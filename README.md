# Migration Atlas

Static educational migration map; serve `dist` over HTTP. No build or backend is required. See [REVIEW.md](REVIEW.md) for the functional/data review and verification limits.

Data: FLOW v1.0 (CC BY), 1960–2024. Annual female/male estimates are summed into complete five-year periods. Source: Beyer RM, Schewe J, Abel GJ, Warner K, Campo SR (2026), *Annual Migration Flow Estimates by Sex between all Countries since 1960*, Scientific Data 13 (1389), https://www.nature.com/articles/s41597-026-07983-w. The model supports broad trends; precise individual-corridor counts should use official records where available. 1950s have historical context only.

## Reproduce

Obtain https://osf.io/download/p58ay/ as `/tmp/flow.csv`, and Natural Earth's `ne_110m_admin_0_countries.geojson` as `/tmp/countries.geojson`. Run `python prepare.py` and `python make_events.py`. Optional `--source`, `--geometry`, `--output` arguments select other paths. The processor checks source version, duplicate records and full year/sex coverage before writing. The original 118.7 MB CSV is not shipped to browsers.

Names and schematic map endpoints are pinned in `reference/countries.json`; provenance is in `reference/README.md`. Natural Earth is public domain. D3 v7 uses the ISC license.

## Checks

Run `npm ci && npm test` for DOM integration tests. Run `python tests/data_test.py /path/to/flow.csv` to independently reconcile all exported values and metadata. `node --check dist/app.js` validates JavaScript syntax. DOM checks do not replace full browser visual and accessibility testing.

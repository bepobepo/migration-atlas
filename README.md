# Migration Atlas
Static educational migration map. Serve `dist` over HTTP. Data: FLOW v1.0 (CC BY), 1960–2024, annual male/female estimates summed into complete five-year periods. See in-app methodology for definitions and caveats. Natural Earth boundaries (public domain); D3 v7 (ISC).

To reproduce data: obtain the archived FLOW CSV at https://osf.io/download/p58ay/ as `/tmp/flow.csv` and Natural Earth ne_110m_admin_0_countries.geojson as `/tmp/countries.geojson`, then run `python prepare.py` and `python make_events.py`. The preparation script checks the source SHA256 and complete year/sex coverage. No source CSV is shipped to the browser. Event narratives are distinct from modelled estimates. 1950s have historical context only.

Browser QA was unavailable in the build environment. JavaScript syntax, local asset references, source checksum, period totals and content integrity were checked.

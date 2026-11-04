# Country names and map endpoints

`countries.json` contains `NAME_EN`, `LABEL_X` and `LABEL_Y` from Natural Earth's public-domain 10m admin-0 countries dataset, retrieved 2026-11-04:
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_0_countries.geojson

The exact extracted reference is committed here for reproducibility. Prefer ISO_A3_EH, then ISO_A3; retain Natural Earth's identifier for map features without an ISO code (KOS is represented as XKX). Migration records keep their original source ISO3 keys. Europe membership is the explicit UN M49 country/area set in prepare.py. No migration values are allocated to disputed map subdivisions.

The rendered polygons use Natural Earth's 110m countries. Label points provide consistent schematic endpoints, including small countries omitted at 110m. They do not represent actual border crossings or travel paths.

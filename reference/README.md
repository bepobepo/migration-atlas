# Country names and map endpoints

`countries.json` contains `NAME_EN`, `LABEL_X` and `LABEL_Y` from Natural Earth's public-domain 10m admin-0 countries dataset, retrieved 2026-11-04:
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_0_countries.geojson

The exact extracted reference is committed here for reproducibility. Run `python build_reference.py /path/to/ne_10m_admin_0_countries.geojson` from the repository root to regenerate it. The source SHA256 is pinned in the extractor: `239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255`.

Country keys prefer ISO_A3_EH, then ISO_A3; retain Natural Earth's identifier for map features without an ISO code (KOS is represented as XKX). These fields are **not unique per feature**. When multiple features share a key, the extractor requires exactly one matching ADM0_A3 country feature and takes its name and label point. It fails on ambiguity instead of allowing the last feature to overwrite a country's identity. This prevents France from becoming Clipperton Island, Australia from becoming Ashmore and Cartier Islands, Brazil from becoming Brazilian Island, and Kazakhstan from becoming Baikonur.

Migration records keep their original source ISO3 keys. Europe membership is the explicit UN M49 country/area set in prepare.py. No migration values are allocated to disputed map subdivisions.

The rendered polygons use Natural Earth's 110m countries. Label points provide consistent schematic endpoints, including small countries omitted at 110m. They do not represent actual border crossings or travel paths.

`un-m49.json` is the English country-code and region table from https://unstats.un.org/unsd/methodology/m49/overview/, retrieved 2026-11-04 (248 country/area entries). It provides an independent check on all 194 FLOW country codes and their Europe membership. `name-aliases.json` pins the 27 reviewed display-name differences, such as South Korea / Republic of Korea and United Kingdom / United Kingdom of Great Britain and Northern Ireland. Any other name mismatch fails the tests instead of silently becoming an alias.

`tests/geography_audit.py` independently indexes the pinned Natural Earth source by ADM0_A3 and explicitly handles ESH/SAH, PSE/PSX, SSD/SDS and XKX/KOS. It verifies all 205 published map names and endpoints and all 177 polygon labels. It does not reuse the reference extractor's ISO grouping logic. The migration selectors mark the 11 map features absent from FLOW as having no estimates; they must never be read as estimated zeros.

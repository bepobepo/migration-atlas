# Function and data review — 4 November 2026

## Corrected defects

- 29 source countries had missing map endpoints; their routes could be listed without visible arrows. Their names also appeared as ISO3 codes because Intl.DisplayNames expects ISO2 region identifiers. Added a checked Natural Earth name/coordinate reference, tiny-country markers, and canonical ISO mapping (including Palestine).
- Play stopped immediately at the default 2020–2024 interval. It now starts again at 1950 and advances in five-year steps.
- A failed earlier request could overwrite a newer timeline selection. Both success and failure now check request identity; old arrows disappear while a new period loads.
- Changing direction could leave a selected route outside the filter. Selection now resets on direction/search changes; event navigation clears stale search text.
- Repeated renders could duplicate trend bars and accumulate empty SVG groups. Detail requests are versioned and map layers are replaced cleanly.
- Estimated-zero routes could be drawn when selected; zero remains visible in the list but never creates a quantitative arrow. Missing trend observations have a separate hatch style.
- Controls could run before required assets loaded. They remain disabled until initialization completes.
- Fixed the ONS 2004 enlargement citation's 404 URL and updated the Ukraine UNHCR citation to its indexed canonical URL. Added a contemporary UNHCR source for the Venezuelan migration context.

## Quantitative audit

Independently reconciled all 192,296 corridor-period aggregates across thirteen five-year intervals against the archived FLOW v1.0 CSV, using integer tenths derived with Decimal. Zero value mismatches, zero duplicate input year/sex records and zero incomplete groups. All exported corridors have a European endpoint, readable country names and valid map coordinates. The data checksum matches the archived version. Numerical estimates were not changed by this review.

The preparation script now validates its input checksum before writing, rejects duplicate year/sex records, checks all ten observations per period, and exports only after validation. `tests/data_test.py` independently verifies the output without invoking the preparation implementation.

## Source suitability and historical review

FLOW is modelled migration, not observed counts. The original README explicitly describes detailed individual-corridor analysis and replacing official records as its least suitable uses. This is a material limitation of the app as a route-level research tool, even though its aggregation is correct. Methodology and route details now state it more directly. Five-year sums can include repeat migrants. Estimated zero is not proof of no movement. 1950–1959 remain an explicit quantitative gap.

Checked all eighteen primary citation URLs. Eleven originally returned content directly, one was a confirmed 404 and has been repaired, and six returned access restrictions/rate limits or a timeout. Indexed primary-source pages corroborated the Hungarian, Ugandan, Angolan, Colombian and Ukrainian contexts. The Bosnia chapter was identified in UNHCR's index, but its full PDF could not be re-fetched due to rate limiting. These access failures are not evidence that the historical accounts are false. Readable government sources support the recruitment, Polish/Romanian mobility, Spain/Germany, and Belarus stories. The Canary government PDF was downloaded and its chronology checked; Venezuela also now links to a contemporary 2019 UNHCR account.

Historical event periods are editorial focus periods, not proof of exact wave start/end dates or quantified causation. Administrative counts, nationality statistics, population stocks and modelled movement estimates remain distinct.

## Validation limits

Eleven DOM integration checks cover initialization, map routes, small-country selection, playback, direction filters, event navigation, chart rendering, loading races, failures/retry, estimated zero and zoom controls. The deployment's existing desktop screenshot was inspected. Live browser automation was unavailable under the Sites environment's prescribed preview workflow, so full browser/mobile layout, touch interactions and screen-reader behavior remain unverified.

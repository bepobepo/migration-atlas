# Migration Atlas audit · 6 November 2026

The country-by-country source-discovery and metric-assessment pass covers all **194 source countries**. Primary metadata was verified for **192**; **Eritrea and North Korea** retain explicit unresolved findings. There are no countries left without a search outcome. The evidence and definitions are in [NATIONAL_SOURCE_AUDIT.md](NATIONAL_SOURCE_AUDIT.md) and [reference/national-source-audit.json](reference/national-source-audit.json).

This is not certification of every official dataset, nor a claim that all countries have comparable annual bilateral figures. Verified metadata includes historical censuses, questionnaires, surveys and administrative statistics. No additional national numerical observations were imported in this pass. Imported official coverage remains 111,297 chosen country-pair/year observations, with missing official values unavailable and FLOW comparisons opt-in.

## Numerical reconciliation

- All **2,433,730 annual** and **486,746 five-year** model aggregates match the pinned FLOW CSV exactly. Both incoming and outgoing compact country series reconcile with those aggregates.
- All **116,909 source-specific Eurostat observations** match independently addressed cells in the two pinned source responses. The overlay chooses **111,297** observations and retains **5,612** alternative reports without adding them together. Source flags and published zeros are preserved.
- All **12,610 population country-years** match the archived World Bank snapshot, including missing baselines.
- All **205 map identities and endpoints** match canonical Natural Earth features; all 177 rendered features have matching labels. Only 194 identities have FLOW estimates.

These checks establish correct processing of the pinned sources. They do not establish that a statistical estimate counts every actual migrant or that different national definitions are interchangeable.

## Spain and Romania, 2020–2024

The displayed **231,388 Spain → Romania** and **185,328 Romania → Spain** reproduce the selected Eurostat reports. They describe previous/next residence, including people of any citizenship; they are not counts of Spanish versus Romanian citizens. Return migration can be included, but its share cannot be inferred from this table.

| Year | Spain → Romania | Romania → Spain |
| --- | ---: | ---: |
| 2020 | 32,671 | 14,891 |
| 2021 | 51,126 | 45,619 |
| 2022 | 49,231 (estimated) | 45,591 |
| 2023 | 51,316 | 43,480 |
| 2024 | 47,044 | 35,747 |

There are material comparability limits. Spain's [EMCR methodology](https://www.ine.es/en/metodologia/meto_emcr_en.pdf) starts a new series in 2021; the imported records retain the break flag. Mirror reports can disagree: for 2021 Spain reports 67,158 departures to Romania while Romania reports 51,126 arrivals from Spain; Romania reports 15,727 departures to Spain while Spain reports 45,619 arrivals from Romania. The app prioritizes destination reports, using the origin report where the destination observation is unavailable. The two headline totals must not be presented as an exact, consistently measured net population change.

Sources: [Eurostat arrivals by previous residence](https://ec.europa.eu/eurostat/databrowser/view/migr_imm5prv/default/table?lang=en), [departures by next residence](https://ec.europa.eu/eurostat/databrowser/view/migr_emi3nxt/default/table?lang=en), [definitions and national exceptions](https://ec.europa.eu/eurostat/cache/metadata/en/migr_immi_esms.htm). Per-year source and alternative-report details remain inspectable in the app.

## Historical context and interface

Eight new sourced accounts bring the catalog to **32 stories**: Myanmar → Bangladesh, South Sudan → Uganda, Ethiopia → Sudan, Nicaragua, Haiti, Rwanda, Cuba → United States, and Vietnam → United States. Country context and specific corridors have separate directional matching. Date windows prevent these additions appearing before the described event; internal displacement and refugee figures are not substituted for international migration totals. Uncovered histories remain explicit gaps.

Country coverage now shows a data-driven review summary, country findings, import assessments, primary links and expandable metric definitions. Metadata-only sources contribute no numeric coverage. Repeated national source links are removed. The obsolete fixed event-count test was replaced with a contiguous unique-ID check; catalog tests follow the actual event file.

Automated DOM checks exercise route-card dialogs, country and arrow tooltips, official-only and comparison modes, provenance, source coverage, annual playback, historical matching and collapsible layout. Visual desktop/mobile browser QA remains unverified because the prescribed browser tooling is unavailable in this session.

## Source-specific limitations

UNdata's bulk CSV endpoint returned HTTP 404. Some national portals timed out, required JavaScript, or exposed only collection metadata. Wherever possible, original national reports were checked in UN, ILO, UNFPA, SPC or other attributable archives, including direct PDF retrieval when the web reader failed. The scanned Republic of the Congo questionnaire was verified by rendering its page images, resolving its initial text-extraction gap. A failed endpoint is recorded against that source; it does not block independent research or publication of verified work. The two unresolved national cases are evidence gaps, not missing user permission.

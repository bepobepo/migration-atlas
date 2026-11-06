# Official migration source inventory

Reviewed 2026-11-06. The machine-readable inventory is [reference/official-sources.json](reference/official-sources.json). It covers exactly the **194 FLOW countries**, matched to the pinned UN M49 ISO3 identities. Country entries distinguish actual imported observations, source metadata that has been reviewed, and candidates that still require verification.

All 194 countries have a recorded source-search outcome. **This is not a claim that every national dataset has been reconciled or that every migration estimate is correct**. The importer currently provides partial comparable official coverage from Eurostat. The default Official statistics view keeps gaps unavailable. FLOW remains an explicitly selected model comparison outside those route-years. A national statistics agency can publish estimates, provisional values or imputed values; “official” does not mean a complete observed headcount.

## What is imported

The archived Eurostat source responses are `reference/official/eurostat/migr_imm5prv_2008_2024.json.gz` and `reference/official/eurostat/migr_emi3nxt_2008_2024.json.gz`. Their source URLs, retrieval times, update dates and SHA-256 hashes are pinned in [reference/official/eurostat/provenance.json](reference/official/eurostat/provenance.json). Normalized observations and reporter coverage are in `dist/data/official/eurostat.json`.

| Coverage measure | Verified result |
| --- | ---: |
| FLOW country identities matched by ISO3 | 194 |
| Countries with imported observations reported by their own authority | 30 |
| Countries represented only as partners in another country's imported report | 164 |
| Countries appearing in at least one imported official corridor-year | 194 |
| National source searches completed | 194 |
| National primary-source metadata reviewed separately | 192 |
| Completed searches with unresolved primary-source evidence | 2 |
| Documented historical UNDESA 2015 reporting countries | 45 |

“Appears in an official corridor” does not imply complete national or world coverage. The observation counts below count source-specific pair-year rows, including published zeroes. An immigration report and an emigration report may describe the same movement and must not be added together.

| Imported source | Requested years | Available bilateral observations | Reporters | Published zero observations |
| --- | --- | ---: | ---: | ---: |
| `migr_imm5prv` | 2008–2024 | 60,056 | 29 | 15,748 |
| `migr_emi3nxt` | 2008–2024 | 56,853 | 27 | 19,320 |

## Metric and selection rules

The preferred map measure is an annual change of usual residence: arrivals by **previous residence**, or departures by **next residence**, generally using an actual/intended stay of at least 12 months. Prefer a compatible destination-country report, then a compatible origin-country report, then an unavailable observation in the default view. The optional Best available comparison instead fills such gaps with a clearly labelled FLOW estimate. Preserve the individual source and flags for each year.

Country of citizenship, birth and previous residence answer different questions. A Belarusian citizen could arrive in Poland from another country; a person arriving from Belarus might have another citizenship. A stock of valid residence permits, visas issued, border crossings, permanent-registration events and migrant residents at a date also measures different things. None is silently substituted for annual changes of usual residence. Never allocate an unspecified regional total across missing country pairs. Missing, confidential or restricted values are unavailable; a published numeric zero is a valid zero.

For a multi-year range, source coverage is checked annually. The default official view labels incomplete coverage as a reported subtotal. If the optional comparison fills some years with FLOW, the result must disclose its mixed provenance. It must not be labelled entirely observed official migration. Origin/destination mirror statistics can disagree; choose according to the stated priority and keep both reports inspectable instead of summing them.

This distinction matters for **Belarus → Poland**. A count of Belarusian citizens holding valid Polish residence documents is a legal-residence stock on a date. It includes people resident before the selected range and excludes some people living under other legal arrangements. The GUS permanent-residence series is narrower than all long-term immigration. Neither is automatically the same as all arrivals from Belarus during 2020–2024, and neither validates the FLOW model's precise corridor estimate.

## International and regional sources

| Primary source | Verified scope | Use and limits |
| --- | --- | --- |
| [Eurostat immigration by previous residence](https://ec.europa.eu/eurostat/databrowser/view/migr_imm5prv/default/table?lang=en), [emigration by next residence](https://ec.europa.eu/eurostat/databrowser/view/migr_emi3nxt/default/table?lang=en), [metadata](https://ec.europa.eu/eurostat/cache/metadata/en/migr_immi_esms.htm) | Imported, partial annual bilateral residence-flow observations for 2008–2024 | Country and year gaps remain. Official values may be estimated/provisional; preserve flags and country-specific definitions. |
| [UNSD / UNdata incoming migrants by previous residence, table 406](https://data.un.org/Data.aspx?d=POP&f=tableCode%3A406), [migration collection](https://unstats.un.org/unsd/demographic-social/sconcerns/migration/) | Primary metadata describes national reports for 2010 onward as available; UNdata update 10 August 2026 | Promising comparable collector. Not imported. The unfiltered web view listed 40 reporting countries or areas and 65,203 records on 6 November 2026, including aggregate entries; per-country/year availability remains unverified. The CSV download handler returned HTTP 404 during this review. |
| [UNDESA International Migration Flows 2015](https://www.un.org/development/desa/pd/data/international-migration-flows), [official documentation](https://www.un.org/development/desa/pd/sites/www.un.org.development.desa.pd/files/undesa_pd_2015_migration_flow_documentation.pdf) | Exactly 45 reporters, recorded per country in the source inventory from the official documentation's indexed text | Historical candidate, not imported. Mixes residence, birth and citizenship definitions; cannot supply post-2020 migration. Direct UN page/PDF fetch returned HTTP 403 during review. |
| [OECD International Migration Database](https://www.oecd.org/en/data/datasets/overview-data-on-migration-flows-and-migrant-populations.html), [national definition notes](https://www.oecd.org/en/publications/international-migration-outlook-2025_ae26c893-en/full-report/statistical-annex_b490cd01.html) | Annual flows of foreign populations/asylum applicants, stocks and citizenship acquisitions; `DSD_MIG@DF_MIG` | Mostly nationality-based flow tables, with varying national administrative definitions. Not imported. Country-year membership has not been extracted; OECD membership is not treated as data coverage. |
| [UNHCR forcibly displaced flow data](https://www.unhcr.org/refugee-statistics/insights/explainers/forcibly-displaced-flow-data.html) | Estimated annual flows of forcibly displaced people by country of origin and asylum | Research candidate, not imported. These flows describe a protection population and may involve onward movement; origin/asylum is not automatically previous/next residence. Country-year completeness and revisions need review. |
| [UNDESA International Migrant Stock 2024](https://www.un.org/development/desa/pd/content/international-migrant-stock) | Migrant-population stocks for 233 countries/areas, 1990–2024 | Context only. Stocks and their changes are not gross annual immigration/emigration. |

## Separately reviewed national sources

National source discovery and metric assessment is complete for all 194 countries: 192 have verified primary-source metadata, while 2 remain explicitly unresolved. See [the complete country report](NATIONAL_SOURCE_AUDIT.md) and [archived search evidence](reference/national-source-audit.json). Context-only findings include censuses, questionnaires, permits, registrations, nationality stocks and travel; they are not interchangeable with annual gross bilateral flows. No additional national numbers were imported by this review.

## Country-by-country coverage matrix

Own incoming/outgoing lists years with at least one chosen official observation reported by that country, not complete national coverage. Every country search is complete; verified metadata does not imply an imported national dataset.

| ISO3 | Country | Own incoming report years | Own outgoing report years | Other official route coverage | National source outcome |
| --- | --- | --- | --- | --- | --- |
| AFG | Afghanistan | — | — | Mirror only | Metadata verified; not imported |
| ALB | Albania | — | — | Mirror only | Metadata verified; not imported |
| DZA | Algeria | — | — | Mirror only | Metadata verified; not imported |
| AND | Andorra | — | — | Mirror only | Metadata verified; not imported |
| AGO | Angola | — | — | Mirror only | Metadata verified; not imported |
| ATG | Antigua and Barbuda | — | — | Mirror only | Metadata verified; not imported |
| ARG | Argentina | — | — | Mirror only | Metadata verified; not imported |
| ARM | Armenia | — | — | Mirror only | Metadata verified; not imported |
| AUS | Australia | — | — | Mirror only | Metadata verified; not imported |
| AUT | Austria | 2008, 2009, 2010, 2011, 2012, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2009, 2010, 2011, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| AZE | Azerbaijan | — | — | Mirror only | Metadata verified; not imported |
| BHR | Bahrain | — | — | Mirror only | Metadata verified; not imported |
| BGD | Bangladesh | — | — | Mirror only | Metadata verified; not imported |
| BRB | Barbados | — | — | Mirror only | Metadata verified; not imported |
| BLR | Belarus | — | — | Mirror only | Metadata verified; not imported |
| BEL | Belgium | 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2022, 2023, 2024 | 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| BLZ | Belize | — | — | Mirror only | Metadata verified; not imported |
| BEN | Benin | — | — | Mirror only | Metadata verified; not imported |
| BTN | Bhutan | — | — | Mirror only | Metadata verified; not imported |
| BOL | Bolivia | — | — | Mirror only | Metadata verified; not imported |
| BIH | Bosnia and Herzegovina | — | — | Mirror only | Metadata verified; not imported |
| BWA | Botswana | — | — | Mirror only | Metadata verified; not imported |
| BRA | Brazil | — | — | Mirror only | Metadata verified; not imported |
| BRN | Brunei | — | — | Mirror only | Metadata verified; not imported |
| BGR | Bulgaria | 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| BFA | Burkina Faso | — | — | Mirror only | Metadata verified; not imported |
| BDI | Burundi | — | — | Mirror only | Metadata verified; not imported |
| KHM | Cambodia | — | — | Mirror only | Metadata verified; not imported |
| CMR | Cameroon | — | — | Mirror only | Metadata verified; not imported |
| CAN | Canada | — | — | Mirror only | Metadata verified; not imported |
| CPV | Cape Verde | — | — | Mirror only | Metadata verified; not imported |
| CAF | Central African Republic | — | — | Mirror only | Metadata verified; not imported |
| TCD | Chad | — | — | Mirror only | Metadata verified; not imported |
| CHL | Chile | — | — | Mirror only | Metadata verified; not imported |
| COL | Colombia | — | — | Mirror only | Metadata verified; not imported |
| COM | Comoros | — | — | Mirror only | Metadata verified; not imported |
| CRI | Costa Rica | — | — | Mirror only | Metadata verified; not imported |
| HRV | Croatia | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| CUB | Cuba | — | — | Mirror only | Metadata verified; not imported |
| CYP | Cyprus | — | — | Mirror only | Metadata verified; not imported |
| CZE | Czech Republic | 2021, 2022, 2023, 2024 | — | Includes own reports | Metadata verified; not imported |
| COD | Democratic Republic of the Congo | — | — | Mirror only | Metadata verified; not imported |
| DNK | Denmark | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021 | Includes own reports | Metadata verified; not imported |
| DJI | Djibouti | — | — | Mirror only | Metadata verified; not imported |
| DMA | Dominica | — | — | Mirror only | Metadata verified; not imported |
| DOM | Dominican Republic | — | — | Mirror only | Metadata verified; not imported |
| TLS | East Timor | — | — | Mirror only | Metadata verified; not imported |
| ECU | Ecuador | — | — | Mirror only | Metadata verified; not imported |
| EGY | Egypt | — | — | Mirror only | Metadata verified; not imported |
| SLV | El Salvador | — | — | Mirror only | Metadata verified; not imported |
| GNQ | Equatorial Guinea | — | — | Mirror only | Metadata verified; not imported |
| ERI | Eritrea | — | — | Mirror only | Search complete; unresolved |
| EST | Estonia | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| SWZ | Eswatini | — | — | Mirror only | Metadata verified; not imported |
| ETH | Ethiopia | — | — | Mirror only | Metadata verified; not imported |
| FSM | Federated States of Micronesia | — | — | Mirror only | Metadata verified; not imported |
| FJI | Fiji | — | — | Mirror only | Metadata verified; not imported |
| FIN | Finland | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| FRA | France | 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2013, 2014, 2015, 2016, 2017 | Includes own reports | Metadata verified; not imported |
| GAB | Gabon | — | — | Mirror only | Metadata verified; not imported |
| GEO | Georgia | — | — | Mirror only | Metadata verified; not imported |
| DEU | Germany | 2008, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| GHA | Ghana | — | — | Mirror only | Metadata verified; not imported |
| GRC | Greece | — | — | Mirror only | Metadata verified; not imported |
| GRD | Grenada | — | — | Mirror only | Metadata verified; not imported |
| GTM | Guatemala | — | — | Mirror only | Metadata verified; not imported |
| GIN | Guinea | — | — | Mirror only | Metadata verified; not imported |
| GNB | Guinea-Bissau | — | — | Mirror only | Metadata verified; not imported |
| GUY | Guyana | — | — | Mirror only | Metadata verified; not imported |
| HTI | Haiti | — | — | Mirror only | Metadata verified; not imported |
| HND | Honduras | — | — | Mirror only | Metadata verified; not imported |
| HUN | Hungary | 2021, 2022 | — | Includes own reports | Metadata verified; not imported |
| ISL | Iceland | 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| IND | India | — | — | Mirror only | Metadata verified; not imported |
| IDN | Indonesia | — | — | Mirror only | Metadata verified; not imported |
| IRN | Iran | — | — | Mirror only | Metadata verified; not imported |
| IRQ | Iraq | — | — | Mirror only | Metadata verified; not imported |
| IRL | Ireland | 2008, 2009, 2010 | 2008, 2009, 2010 | Includes own reports | Metadata verified; not imported |
| ISR | Israel | — | — | Mirror only | Metadata verified; not imported |
| ITA | Italy | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| CIV | Ivory Coast | — | — | Mirror only | Metadata verified; not imported |
| JAM | Jamaica | — | — | Mirror only | Metadata verified; not imported |
| JPN | Japan | — | — | Mirror only | Metadata verified; not imported |
| JOR | Jordan | — | — | Mirror only | Metadata verified; not imported |
| KAZ | Kazakhstan | — | — | Mirror only | Metadata verified; not imported |
| KEN | Kenya | — | — | Mirror only | Metadata verified; not imported |
| KIR | Kiribati | — | — | Mirror only | Metadata verified; not imported |
| KWT | Kuwait | — | — | Mirror only | Metadata verified; not imported |
| KGZ | Kyrgyzstan | — | — | Mirror only | Metadata verified; not imported |
| LAO | Laos | — | — | Mirror only | Metadata verified; not imported |
| LVA | Latvia | 2019 | 2019 | Includes own reports | Metadata verified; not imported |
| LBN | Lebanon | — | — | Mirror only | Metadata verified; not imported |
| LSO | Lesotho | — | — | Mirror only | Metadata verified; not imported |
| LBR | Liberia | — | — | Mirror only | Metadata verified; not imported |
| LBY | Libya | — | — | Mirror only | Metadata verified; not imported |
| LIE | Liechtenstein | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021 | Includes own reports | Metadata verified; not imported |
| LTU | Lithuania | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| LUX | Luxembourg | — | — | Mirror only | Metadata verified; not imported |
| MDG | Madagascar | — | — | Mirror only | Metadata verified; not imported |
| MWI | Malawi | — | — | Mirror only | Metadata verified; not imported |
| MYS | Malaysia | — | — | Mirror only | Metadata verified; not imported |
| MDV | Maldives | — | — | Mirror only | Metadata verified; not imported |
| MLI | Mali | — | — | Mirror only | Metadata verified; not imported |
| MLT | Malta | — | — | Mirror only | Metadata verified; not imported |
| MHL | Marshall Islands | — | — | Mirror only | Metadata verified; not imported |
| MRT | Mauritania | — | — | Mirror only | Metadata verified; not imported |
| MUS | Mauritius | — | — | Mirror only | Metadata verified; not imported |
| MEX | Mexico | — | — | Mirror only | Metadata verified; not imported |
| MDA | Moldova | — | — | Mirror only | Metadata verified; not imported |
| MCO | Monaco | — | — | Mirror only | Metadata verified; not imported |
| MNG | Mongolia | — | — | Mirror only | Metadata verified; not imported |
| MNE | Montenegro | 2010, 2011, 2012, 2020 | — | Includes own reports | Metadata verified; not imported |
| MAR | Morocco | — | — | Mirror only | Metadata verified; not imported |
| MOZ | Mozambique | — | — | Mirror only | Metadata verified; not imported |
| MMR | Myanmar | — | — | Mirror only | Metadata verified; not imported |
| NAM | Namibia | — | — | Mirror only | Metadata verified; not imported |
| NRU | Nauru | — | — | Mirror only | Metadata verified; not imported |
| NPL | Nepal | — | — | Mirror only | Metadata verified; not imported |
| NLD | Netherlands | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| NZL | New Zealand | — | — | Mirror only | Metadata verified; not imported |
| NIC | Nicaragua | — | — | Mirror only | Metadata verified; not imported |
| NER | Niger | — | — | Mirror only | Metadata verified; not imported |
| NGA | Nigeria | — | — | Mirror only | Metadata verified; not imported |
| PRK | North Korea | — | — | Mirror only | Search complete; unresolved |
| MKD | North Macedonia | 2008, 2009, 2010, 2011, 2012, 2020, 2021 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021 | Includes own reports | Metadata verified; not imported |
| NOR | Norway | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| OMN | Oman | — | — | Mirror only | Metadata verified; not imported |
| PAK | Pakistan | — | — | Mirror only | Metadata verified; not imported |
| PLW | Palau | — | — | Mirror only | Metadata verified; not imported |
| PSE | Palestine | — | — | Mirror only | Metadata verified; not imported |
| PAN | Panama | — | — | Mirror only | Metadata verified; not imported |
| PNG | Papua New Guinea | — | — | Mirror only | Metadata verified; not imported |
| PRY | Paraguay | — | — | Mirror only | Metadata verified; not imported |
| CHN | People's Republic of China | — | — | Mirror only | Metadata verified; not imported |
| PER | Peru | — | — | Mirror only | Metadata verified; not imported |
| PHL | Philippines | — | — | Mirror only | Metadata verified; not imported |
| POL | Poland | 2019 | 2019 | Includes own reports | Metadata verified; not imported |
| PRT | Portugal | — | — | Mirror only | Metadata verified; not imported |
| QAT | Qatar | — | — | Mirror only | Metadata verified; not imported |
| COG | Republic of the Congo | — | — | Mirror only | Metadata verified; not imported |
| ROU | Romania | 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024 | 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| RUS | Russia | — | — | Mirror only | Metadata verified; not imported |
| RWA | Rwanda | — | — | Mirror only | Metadata verified; not imported |
| KNA | Saint Kitts and Nevis | — | — | Mirror only | Metadata verified; not imported |
| LCA | Saint Lucia | — | — | Mirror only | Metadata verified; not imported |
| VCT | Saint Vincent and the Grenadines | — | — | Mirror only | Metadata verified; not imported |
| WSM | Samoa | — | — | Mirror only | Metadata verified; not imported |
| SMR | San Marino | — | — | Mirror only | Metadata verified; not imported |
| SAU | Saudi Arabia | — | — | Mirror only | Metadata verified; not imported |
| SEN | Senegal | — | — | Mirror only | Metadata verified; not imported |
| SRB | Serbia | — | — | Mirror only | Metadata verified; not imported |
| SYC | Seychelles | — | — | Mirror only | Metadata verified; not imported |
| SLE | Sierra Leone | — | — | Mirror only | Metadata verified; not imported |
| SGP | Singapore | — | — | Mirror only | Metadata verified; not imported |
| SVK | Slovakia | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| SVN | Slovenia | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| SLB | Solomon Islands | — | — | Mirror only | Metadata verified; not imported |
| SOM | Somalia | — | — | Mirror only | Metadata verified; not imported |
| ZAF | South Africa | — | — | Mirror only | Metadata verified; not imported |
| KOR | South Korea | — | — | Mirror only | Metadata verified; not imported |
| SSD | South Sudan | — | — | Mirror only | Metadata verified; not imported |
| ESP | Spain | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| LKA | Sri Lanka | — | — | Mirror only | Metadata verified; not imported |
| SDN | Sudan | — | — | Mirror only | Metadata verified; not imported |
| SUR | Suriname | — | — | Mirror only | Metadata verified; not imported |
| SWE | Sweden | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2022, 2023, 2024 | Includes own reports | Metadata verified; not imported |
| CHE | Switzerland | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020 | 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020 | Includes own reports | Metadata verified; not imported |
| SYR | Syria | — | — | Mirror only | Metadata verified; not imported |
| STP | São Tomé and Príncipe | — | — | Mirror only | Metadata verified; not imported |
| TJK | Tajikistan | — | — | Mirror only | Metadata verified; not imported |
| TZA | Tanzania | — | — | Mirror only | Metadata verified; not imported |
| THA | Thailand | — | — | Mirror only | Metadata verified; not imported |
| BHS | The Bahamas | — | — | Mirror only | Metadata verified; not imported |
| GMB | The Gambia | — | — | Mirror only | Metadata verified; not imported |
| TGO | Togo | — | — | Mirror only | Metadata verified; not imported |
| TON | Tonga | — | — | Mirror only | Metadata verified; not imported |
| TTO | Trinidad and Tobago | — | — | Mirror only | Metadata verified; not imported |
| TUN | Tunisia | — | — | Mirror only | Metadata verified; not imported |
| TUR | Turkey | — | — | Mirror only | Metadata verified; not imported |
| TKM | Turkmenistan | — | — | Mirror only | Metadata verified; not imported |
| TUV | Tuvalu | — | — | Mirror only | Metadata verified; not imported |
| UGA | Uganda | — | — | Mirror only | Metadata verified; not imported |
| UKR | Ukraine | — | 2020, 2021 | Includes own reports | Metadata verified; not imported |
| ARE | United Arab Emirates | — | — | Mirror only | Metadata verified; not imported |
| GBR | United Kingdom | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019 | 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019 | Includes own reports | Metadata verified; not imported |
| USA | United States of America | — | — | Mirror only | Metadata verified; not imported |
| URY | Uruguay | — | — | Mirror only | Metadata verified; not imported |
| UZB | Uzbekistan | — | — | Mirror only | Metadata verified; not imported |
| VUT | Vanuatu | — | — | Mirror only | Metadata verified; not imported |
| VEN | Venezuela | — | — | Mirror only | Metadata verified; not imported |
| VNM | Vietnam | — | — | Mirror only | Metadata verified; not imported |
| YEM | Yemen | — | — | Mirror only | Metadata verified; not imported |
| ZMB | Zambia | — | — | Mirror only | Metadata verified; not imported |
| ZWE | Zimbabwe | — | — | Mirror only | Metadata verified; not imported |

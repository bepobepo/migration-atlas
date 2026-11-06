# Official migration source inventory

Reviewed 2026-11-06. The machine-readable inventory is [reference/official-sources.json](reference/official-sources.json). It covers exactly the **194 FLOW countries**, matched to the pinned UN M49 ISO3 identities. Country entries distinguish actual imported observations, source metadata that has been reviewed, and candidates that still require verification.

This is **not a claim that every country's national migration data has been reviewed or that every migration estimate is correct**. The importer currently provides partial comparable official coverage from Eurostat. The default Official statistics view keeps gaps unavailable. FLOW remains an explicitly selected model comparison outside those route-years. A national statistics agency can publish estimates, provisional values or imputed values; “official” does not mean a complete observed headcount.

## What is imported

The archived Eurostat source responses are `reference/official/eurostat/migr_imm5prv_2008_2024.json.gz` and `reference/official/eurostat/migr_emi3nxt_2008_2024.json.gz`. Their source URLs, retrieval times, update dates and SHA-256 hashes are pinned in [reference/official/eurostat/provenance.json](reference/official/eurostat/provenance.json). Normalized observations and reporter coverage are in `dist/data/official/eurostat.json`.

| Coverage measure | Verified result |
| --- | ---: |
| FLOW country identities matched by ISO3 | 194 |
| Countries with imported observations reported by their own authority | 30 |
| Countries represented only as partners in another country's imported report | 164 |
| Countries appearing in at least one imported official corridor-year | 194 |
| National primary-source metadata reviewed separately | 14 |
| Countries without individually verified national source metadata | 180 |
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
| [UNDESA International Migration Flows 2015](https://www.un.org/development/desa/pd/data/international-migration-flows), [official documentation](https://www.un.org/development/desa/pd/sites/www.un.org.development.desa.pd/files/undesa_pd_2015_migration_flow_documentation.pdf) | Exactly 45 reporters, recorded per country below from the official documentation's indexed text | Historical candidate, not imported. Mixes residence, birth and citizenship definitions; cannot supply post-2020 migration. Direct UN page/PDF fetch returned HTTP 403 during review. |
| [OECD International Migration Database](https://www.oecd.org/en/data/datasets/overview-data-on-migration-flows-and-migrant-populations.html), [national definition notes](https://www.oecd.org/en/publications/international-migration-outlook-2025_ae26c893-en/full-report/statistical-annex_b490cd01.html) | Annual flows of foreign populations/asylum applicants, stocks and citizenship acquisitions; `DSD_MIG@DF_MIG` | Mostly nationality-based flow tables, with varying national administrative definitions. Not imported. Country-year membership has not been extracted; OECD membership is not treated as data coverage. |
| [UNHCR forcibly displaced flow data](https://www.unhcr.org/refugee-statistics/insights/explainers/forcibly-displaced-flow-data.html) | Estimated annual flows of forcibly displaced people by country of origin and asylum | Research candidate, not imported. These flows describe a protection population and may involve onward movement; origin/asylum is not automatically previous/next residence. Country-year completeness and revisions need review. |
| [UNDESA International Migrant Stock 2024](https://www.un.org/development/desa/pd/content/international-migrant-stock) | Migrant-population stocks for 233 countries/areas, 1990–2024 | Context only. Stocks and their changes are not gross annual immigration/emigration. |

## Separately reviewed national sources

Review here means the linked primary source's identity and metric were checked. **None of these separate national sources has been imported by this inventory.** Imported UK/Polish observations, for example, come from the Eurostat files described above. “Candidate” is deliberately different from “data verified”.

| Country | Verified primary source | Metric and import constraint |
| --- | --- | --- |
| United States | [DHS OHSS 2024 yearbook](https://ohss.dhs.gov/topics/immigration/yearbook/2024), [Census ACS migration guidance](https://www.census.gov/topics/population/migration/guidance/migration-flows.html) | LPR grants, including adjustments of people already resident, use fiscal years; last residence appears in table 11. ACS guidance mainly lists domestic flows and would need a weighted, uncertainty-aware international extract. Neither is imported as all annual arrivals. |
| Canada | [StatCan annual components](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710001401), [historical last-residence table](https://open.canada.ca/data/en/dataset/fc6ad2eb-51f8-467c-be01-c4bda5b6186b), [IRCC permanent resident admissions](https://open.canada.ca/data/en/dataset/f7e5498e-0ad8-4417-85c9-9b8aff9b9eda) | Components are not bilateral; historical last-residence categories are limited. IRCC tables are mostly citizenship-based legal-status admissions, include people already resident and may be rounded. |
| Australia | [ABS Overseas Migration 2023–24](https://www.abs.gov.au/statistics/people/population/overseas-migration/2023-24), [methodology](https://www.abs.gov.au/methodologies/overseas-migration-methodology/2023-24) | Residence-outcome estimates use 12 months in a 16-month window. Main country breakdowns are birth/visa; verify an actual bilateral previous-residence table and calendar periods before import. |
| New Zealand | [Stats NZ June 2024 release](https://www.stats.govt.nz/information-releases/international-migration-june-2024/), [method changes](https://www.stats.govt.nz/about-us/what-we-do/current-projects/migration-data-transformation-project/) | Separate last-permanent-residence CSV is a strong import candidate. Reconcile non-overlapping calendar periods, revisions, unknown residence responses and model vintages; no independent outgoing coverage claim. |
| United Kingdom | [ONS international migration methodology](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/methodologies/understandinginternationalmigrationstatistics) | Long-term usual residence with official estimation and revised sources. Verify the geographic basis of the specific table; nationality and visa grants are different measures. |
| Israel | [CBS immigrants by selected last country of residence, table 6](https://www.cbs.gov.il/he/mediarelease/doclib/2024/234/01_24_234t6.pdf) | Immigrant/aliyah category and selected countries; do not imply that all residence changes are counted. |
| Poland | [GUS permanent-residence directions 1966–2024](https://publikacje.new.stat.gov.pl/en/node/33134), [UdSC statistics](https://www.gov.pl/web/udsc/statystyki-migracyjne), [Belarus context](https://www.gov.pl/web/udsc/dane-migracyjne-dotyczace-obywateli-bialorusi) | GUS permanent registration is narrow. UdSC valid permits are stocks; permits/visas issued are administrative events. Retain as distinct context. |
| Colombia | [Migración Colombia regular-movement definitions](https://www.migracioncolombia.gov.co/planeacion-y-estadistica/observatorio-om3/dinamicas-migratorias/migracion-regular), [microdata gateway](https://www.migracioncolombia.gov.co/planeacion-y-estadistica/observatorio-om3/datos-abiertos/microdatos) | Provider explicitly counts journeys, not unique people. Entries/exits include short visits and repeat trips; these are not residence flows. |
| Chile | [SERMIG open administrative data](https://serviciomigraciones.cl/estudios-migratorios/datos-abiertos/), [INE demography / resident estimates](https://www.ine.gob.cl/estadisticas-por-tema/demografia-y-poblacion/demografia) | SERMIG explicitly counts permits, not people. INE/SERMIG EPE is a resident stock at 31 December; neither is an annual gross-flow substitute. |
| South Africa | [Statistics South Africa Migration Profile 2023](https://www.statssa.gov.za/publications/03-09-17/03-09-172023.pdf) | Official profile exists; a complete annual country-pair residence-flow extract has not been verified. Underlying table definitions vary. |
| Japan | [Immigration Services Agency statistics gateway](https://www.moj.go.jp/isa/policies/statistics/index.html) | Administrative entry/exit and status processing gateway verified. A comparable bilateral residence-flow table remains unverified. |
| Brazil | [IBGE 2022 census migration results](https://www.ibge.gov.br/Estatisticas/Sociais/Populacao/22827-censo-demografico-2022.html?edicao=43821) | Resident population, birth and previous residence; five-year reference. The census does not measure international emigration. Not imported as annual flows. |
| Argentina | [INDEC 2022 census migration results](https://www.indec.gob.ar/indec/web/Nivel4-Tema-2-41-165?lang=es) | Census residents by birthplace and arrival period; excludes people no longer resident at census. Not imported as annual flows. |
| Mexico | [INEGI census conceptual framework](https://www.inegi.org.mx/contenidos/productos/prod_serv/contenidos/espanol/bvinegi/productos/nueva_estruc/702825197520.pdf), [ENADID 2023](https://www.inegi.org.mx/programas/enadid/2023/) | Census and household survey include previous residence or international departures over reference periods. These are not automatically annual bilateral flows; survey uncertainty and definitions require review before import. |
| Belarus | No current national primary residence-flow table verified | The attempted national-source search did not establish a current comparable Belstat table. Its country entry deliberately uses a null national URL. Historical UNDESA reporting membership and partner-reported official observations are separate evidence. |

## Country-by-country coverage matrix

“Own incoming/outgoing” lists **years with at least one imported bilateral observation**, not complete years or all-country totals. Counts in the JSON distinguish own reports from partner reports. “Mirror only” means a country has no imported own-authority reporter observations but appears in other countries' reports. National-source review is deliberately limited to the primary metadata above; an em dash is not a claim that no national data exist.

| ISO3 | FLOW country | Own incoming report years | Own outgoing report years | Other official route coverage | National metadata reviewed | Historic UNDESA 2015 reporter |
| --- | --- | --- | --- | --- | --- | --- |
| AFG | Afghanistan | — | — | Mirror only | — | — |
| ALB | Albania | — | — | Mirror only | — | — |
| DZA | Algeria | — | — | Mirror only | — | — |
| AND | Andorra | — | — | Mirror only | — | — |
| AGO | Angola | — | — | Mirror only | — | — |
| ATG | Antigua and Barbuda | — | — | Mirror only | — | — |
| ARG | Argentina | — | — | Mirror only | — | — |
| ARM | Armenia | — | — | Mirror only | — | Yes |
| AUS | Australia | — | — | Mirror only | Yes, metadata only | Yes |
| AUT | Austria | 2008–2012, 2014–2024 | 2008–2011, 2015–2024 | Includes mirror reports | — | Yes |
| AZE | Azerbaijan | — | — | Mirror only | — | Yes |
| BHR | Bahrain | — | — | Mirror only | — | — |
| BGD | Bangladesh | — | — | Mirror only | — | — |
| BRB | Barbados | — | — | Mirror only | — | — |
| BLR | Belarus | — | — | Mirror only | Not verified | Yes |
| BEL | Belgium | 2010–2019, 2022–2024 | 2010–2020, 2022–2024 | Includes mirror reports | — | Yes |
| BLZ | Belize | — | — | Mirror only | — | — |
| BEN | Benin | — | — | Mirror only | — | — |
| BTN | Bhutan | — | — | Mirror only | — | — |
| BOL | Bolivia | — | — | Mirror only | — | — |
| BIH | Bosnia and Herzegovina | — | — | Mirror only | — | — |
| BWA | Botswana | — | — | Mirror only | — | — |
| BRA | Brazil | — | — | Mirror only | — | — |
| BRN | Brunei | — | — | Mirror only | — | — |
| BGR | Bulgaria | 2012–2024 | 2012–2024 | Includes mirror reports | — | Yes |
| BFA | Burkina Faso | — | — | Mirror only | — | — |
| BDI | Burundi | — | — | Mirror only | — | — |
| KHM | Cambodia | — | — | Mirror only | — | — |
| CMR | Cameroon | — | — | Mirror only | — | — |
| CAN | Canada | — | — | Mirror only | Yes, metadata only | Yes |
| CPV | Cape Verde | — | — | Mirror only | — | — |
| CAF | Central African Republic | — | — | Mirror only | — | — |
| TCD | Chad | — | — | Mirror only | — | — |
| CHL | Chile | — | — | Mirror only | Yes, metadata only | — |
| COL | Colombia | — | — | Mirror only | Yes, metadata only | — |
| COM | Comoros | — | — | Mirror only | — | — |
| CRI | Costa Rica | — | — | Mirror only | — | — |
| HRV | Croatia | 2008–2024 | 2011–2024 | Includes mirror reports | — | Yes |
| CUB | Cuba | — | — | Mirror only | — | — |
| CYP | Cyprus | — | — | Mirror only | — | Yes |
| CZE | Czech Republic | 2021–2024 | — | Includes mirror reports | — | Yes |
| COD | Democratic Republic of the Congo | — | — | Mirror only | — | — |
| DNK | Denmark | 2008–2021 | 2008–2021 | Includes mirror reports | — | Yes |
| DJI | Djibouti | — | — | Mirror only | — | — |
| DMA | Dominica | — | — | Mirror only | — | — |
| DOM | Dominican Republic | — | — | Mirror only | — | — |
| TLS | East Timor | — | — | Mirror only | — | — |
| ECU | Ecuador | — | — | Mirror only | — | — |
| EGY | Egypt | — | — | Mirror only | — | — |
| SLV | El Salvador | — | — | Mirror only | — | — |
| GNQ | Equatorial Guinea | — | — | Mirror only | — | — |
| ERI | Eritrea | — | — | Mirror only | — | — |
| EST | Estonia | 2008–2024 | 2008–2019, 2022–2024 | Includes mirror reports | — | Yes |
| SWZ | Eswatini | — | — | Mirror only | — | — |
| ETH | Ethiopia | — | — | Mirror only | — | — |
| FSM | Federated States of Micronesia | — | — | Mirror only | — | — |
| FJI | Fiji | — | — | Mirror only | — | — |
| FIN | Finland | 2008–2024 | 2008–2024 | Includes mirror reports | — | Yes |
| FRA | France | 2013–2024 | 2013–2017 | Includes mirror reports | — | Yes |
| GAB | Gabon | — | — | Mirror only | — | — |
| GEO | Georgia | — | — | Mirror only | — | — |
| DEU | Germany | 2008, 2014–2024 | 2008, 2014–2024 | Includes mirror reports | — | Yes |
| GHA | Ghana | — | — | Mirror only | — | — |
| GRC | Greece | — | — | Mirror only | — | Yes |
| GRD | Grenada | — | — | Mirror only | — | — |
| GTM | Guatemala | — | — | Mirror only | — | — |
| GIN | Guinea | — | — | Mirror only | — | — |
| GNB | Guinea-Bissau | — | — | Mirror only | — | — |
| GUY | Guyana | — | — | Mirror only | — | — |
| HTI | Haiti | — | — | Mirror only | — | — |
| HND | Honduras | — | — | Mirror only | — | — |
| HUN | Hungary | 2021–2022 | — | Includes mirror reports | — | Yes |
| ISL | Iceland | 2009–2024 | 2009–2024 | Includes mirror reports | — | Yes |
| IND | India | — | — | Mirror only | — | — |
| IDN | Indonesia | — | — | Mirror only | — | — |
| IRN | Iran | — | — | Mirror only | — | — |
| IRQ | Iraq | — | — | Mirror only | — | — |
| IRL | Ireland | 2008–2010 | 2008–2010 | Includes mirror reports | — | Yes |
| ISR | Israel | — | — | Mirror only | Yes, metadata only | — |
| ITA | Italy | 2008–2024 | 2008–2024 | Includes mirror reports | — | Yes |
| CIV | Ivory Coast | — | — | Mirror only | — | — |
| JAM | Jamaica | — | — | Mirror only | — | — |
| JPN | Japan | — | — | Mirror only | Yes, metadata only | — |
| JOR | Jordan | — | — | Mirror only | — | — |
| KAZ | Kazakhstan | — | — | Mirror only | — | Yes |
| KEN | Kenya | — | — | Mirror only | — | — |
| KIR | Kiribati | — | — | Mirror only | — | — |
| KWT | Kuwait | — | — | Mirror only | — | — |
| KGZ | Kyrgyzstan | — | — | Mirror only | — | Yes |
| LAO | Laos | — | — | Mirror only | — | — |
| LVA | Latvia | 2019 | 2019 | Includes mirror reports | — | Yes |
| LBN | Lebanon | — | — | Mirror only | — | — |
| LSO | Lesotho | — | — | Mirror only | — | — |
| LBR | Liberia | — | — | Mirror only | — | — |
| LBY | Libya | — | — | Mirror only | — | — |
| LIE | Liechtenstein | 2008–2021 | 2008–2019, 2021 | Includes mirror reports | — | Yes |
| LTU | Lithuania | 2008–2024 | 2008–2024 | Includes mirror reports | — | Yes |
| LUX | Luxembourg | — | — | Mirror only | — | Yes |
| MDG | Madagascar | — | — | Mirror only | — | — |
| MWI | Malawi | — | — | Mirror only | — | — |
| MYS | Malaysia | — | — | Mirror only | — | — |
| MDV | Maldives | — | — | Mirror only | — | — |
| MLI | Mali | — | — | Mirror only | — | — |
| MLT | Malta | — | — | Mirror only | — | Yes |
| MHL | Marshall Islands | — | — | Mirror only | — | — |
| MRT | Mauritania | — | — | Mirror only | — | — |
| MUS | Mauritius | — | — | Mirror only | — | — |
| MEX | Mexico | — | — | Mirror only | — | — |
| MDA | Moldova | — | — | Mirror only | — | Yes |
| MCO | Monaco | — | — | Mirror only | — | — |
| MNG | Mongolia | — | — | Mirror only | — | — |
| MNE | Montenegro | 2010–2012, 2020 | — | Includes mirror reports | — | — |
| MAR | Morocco | — | — | Mirror only | — | — |
| MOZ | Mozambique | — | — | Mirror only | — | — |
| MMR | Myanmar | — | — | Mirror only | — | — |
| NAM | Namibia | — | — | Mirror only | — | — |
| NRU | Nauru | — | — | Mirror only | — | — |
| NPL | Nepal | — | — | Mirror only | — | — |
| NLD | Netherlands | 2008–2024 | 2008, 2012–2024 | Includes mirror reports | — | Yes |
| NZL | New Zealand | — | — | Mirror only | Yes, metadata only | Yes |
| NIC | Nicaragua | — | — | Mirror only | — | — |
| NER | Niger | — | — | Mirror only | — | — |
| NGA | Nigeria | — | — | Mirror only | — | — |
| PRK | North Korea | — | — | Mirror only | — | — |
| MKD | North Macedonia | 2008–2012, 2020–2021 | 2008–2021 | Includes mirror reports | — | Yes |
| NOR | Norway | 2008–2024 | 2008–2024 | Includes mirror reports | — | Yes |
| OMN | Oman | — | — | Mirror only | — | — |
| PAK | Pakistan | — | — | Mirror only | — | — |
| PLW | Palau | — | — | Mirror only | — | — |
| PSE | Palestine | — | — | Mirror only | — | — |
| PAN | Panama | — | — | Mirror only | — | — |
| PNG | Papua New Guinea | — | — | Mirror only | — | — |
| PRY | Paraguay | — | — | Mirror only | — | — |
| CHN | People's Republic of China | — | — | Mirror only | — | — |
| PER | Peru | — | — | Mirror only | — | — |
| PHL | Philippines | — | — | Mirror only | — | — |
| POL | Poland | 2019 | 2019 | Includes mirror reports | Yes, metadata only | Yes |
| PRT | Portugal | — | — | Mirror only | — | Yes |
| QAT | Qatar | — | — | Mirror only | — | — |
| COG | Republic of the Congo | — | — | Mirror only | — | — |
| ROU | Romania | 2013–2019, 2021–2024 | 2019, 2021–2024 | Includes mirror reports | — | Yes |
| RUS | Russia | — | — | Mirror only | — | Yes |
| RWA | Rwanda | — | — | Mirror only | — | — |
| KNA | Saint Kitts and Nevis | — | — | Mirror only | — | — |
| LCA | Saint Lucia | — | — | Mirror only | — | — |
| VCT | Saint Vincent and the Grenadines | — | — | Mirror only | — | — |
| WSM | Samoa | — | — | Mirror only | — | — |
| SMR | San Marino | — | — | Mirror only | — | — |
| SAU | Saudi Arabia | — | — | Mirror only | — | — |
| SEN | Senegal | — | — | Mirror only | — | — |
| SRB | Serbia | — | — | Mirror only | — | — |
| SYC | Seychelles | — | — | Mirror only | — | — |
| SLE | Sierra Leone | — | — | Mirror only | — | — |
| SGP | Singapore | — | — | Mirror only | — | — |
| SVK | Slovakia | 2008–2024 | 2008–2024 | Includes mirror reports | — | Yes |
| SVN | Slovenia | 2008–2024 | 2008–2024 | Includes mirror reports | — | Yes |
| SLB | Solomon Islands | — | — | Mirror only | — | — |
| SOM | Somalia | — | — | Mirror only | — | — |
| ZAF | South Africa | — | — | Mirror only | Yes, metadata only | — |
| KOR | South Korea | — | — | Mirror only | — | — |
| SSD | South Sudan | — | — | Mirror only | — | — |
| ESP | Spain | 2008–2024 | 2008–2024 | Includes mirror reports | — | Yes |
| LKA | Sri Lanka | — | — | Mirror only | — | — |
| SDN | Sudan | — | — | Mirror only | — | — |
| SUR | Suriname | — | — | Mirror only | — | — |
| SWE | Sweden | 2008–2024 | 2008–2020, 2022–2024 | Includes mirror reports | — | Yes |
| CHE | Switzerland | 2011–2020 | 2011–2020 | Includes mirror reports | — | Yes |
| SYR | Syria | — | — | Mirror only | — | — |
| STP | São Tomé and Príncipe | — | — | Mirror only | — | — |
| TJK | Tajikistan | — | — | Mirror only | — | — |
| TZA | Tanzania | — | — | Mirror only | — | — |
| THA | Thailand | — | — | Mirror only | — | — |
| BHS | The Bahamas | — | — | Mirror only | — | — |
| GMB | The Gambia | — | — | Mirror only | — | — |
| TGO | Togo | — | — | Mirror only | — | — |
| TON | Tonga | — | — | Mirror only | — | — |
| TTO | Trinidad and Tobago | — | — | Mirror only | — | — |
| TUN | Tunisia | — | — | Mirror only | — | — |
| TUR | Turkey | — | — | Mirror only | — | — |
| TKM | Turkmenistan | — | — | Mirror only | — | — |
| TUV | Tuvalu | — | — | Mirror only | — | — |
| UGA | Uganda | — | — | Mirror only | — | — |
| UKR | Ukraine | — | 2020–2021 | Includes mirror reports | — | Yes |
| ARE | United Arab Emirates | — | — | Mirror only | — | — |
| GBR | United Kingdom | 2008–2019 | 2008–2019 | Includes mirror reports | Yes, metadata only | Yes |
| USA | United States of America | — | — | Mirror only | Yes, metadata only | Yes |
| URY | Uruguay | — | — | Mirror only | — | — |
| UZB | Uzbekistan | — | — | Mirror only | — | — |
| VUT | Vanuatu | — | — | Mirror only | — | — |
| VEN | Venezuela | — | — | Mirror only | — | — |
| VNM | Vietnam | — | — | Mirror only | — | — |
| YEM | Yemen | — | — | Mirror only | — | — |
| ZMB | Zambia | — | — | Mirror only | — | — |
| ZWE | Zimbabwe | — | — | Mirror only | — | — |

## Audit boundary and updating

The JSON's `coverageSnapshot.sha256` fingerprints the exact normalized file used for these coverage counts. Rebuild this inventory after changing that file. Per-country source references must resolve to the source catalog; national URLs remain null unless a primary source was verified. The inventory does not add quantitative migration values, overwrite FLOW, or turn a candidate source into data coverage.

Before any further source is selected for the map, archive its response and provenance; match ISO codes; verify reference period, units, residence definition, age/sex totals, missing/suppression flags and revisions; and reconcile imported route-years independently. Keep stocks, nationality/aliyah categories, permits and travel events in separate context fields. Historical drivers describe relevant circumstances and cannot attribute a statistical number of movements to a cause.

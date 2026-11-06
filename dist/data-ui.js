/* Visible provenance follows the same annual resolver as every count. */
const dataUI = {
  mounted: false,
  routeToken: 0,
  routeKey: "",
  raw: new Map(),
  context: null,
};
function formatSourceValue(value, summary, policy = dataPolicy) {
  if (policy === "official") {
    if (summary?.total === 0 && value === 0) return "0 · before observations";
    if (!summary?.official || value == null || !Number.isFinite(value))
      return "Official data unavailable";
    const number =
      (summary.officialEstimated ? "≈ " : "") +
      value.toLocaleString("en", { maximumFractionDigits: 1 });
    return summary.missing ? number + " reported · incomplete" : number;
  }
  if (value == null || !Number.isFinite(value)) return "No comparable data";
  if (value === 0)
    return summary?.basis === "official-statistic"
      ? "0"
      : summary?.basis === "modelled"
        ? "Estimated zero"
        : "≈ 0";
  const exact = summary?.basis === "official-statistic";
  const published = exact || summary?.basis === "official-estimate";
  return (
    (exact ? "" : "≈ ") +
    value.toLocaleString(
      "en",
      published
        ? { maximumFractionDigits: 1 }
        : { maximumSignificantDigits: 3 },
    )
  );
}
function sourceSummaryText(summary) {
  if (!summary?.total) return "No annual observations included yet.";
  const n = (value) => value.toLocaleString("en");
  const parts = [
    summary.label +
      ": " +
      n(summary.official) +
      " official / " +
      n(summary.total) +
      " corridor-year records",
  ];
  if (summary.missing)
    parts.push(
      n(summary.missing) +
        " unavailable; excluded from reported subtotals, not treated as zero",
    );
  if (summary.modelled)
    parts.push(n(summary.modelled) + " FLOW model fallback");
  if (summary.officialEstimated)
    parts.push(n(summary.officialEstimated) + " official estimated or imputed");
  const flags = (summary.flags || []).filter((x) => x !== "e" && x !== "i");
  if (flags.length)
    parts.push("flags: " + flags.map(flagDescription).join(", "));
  return (
    parts.join(" · ") +
    ". Official statistics can have reporting gaps and revisions."
  );
}
function flagDescription(flag) {
  return (
    {
      e: "estimated",
      i: "imputed",
      p: "provisional",
      b: "break in series",
      d: "definition differs",
      u: "low reliability",
      r: "revised",
    }[flag] || flag
  );
}
function sourceForSummary(summary) {
  return (
    currentOfficialResolver().sources[summary?.sourceIds?.[0]] ||
    (dataPolicy === "official"
      ? {
          name: "Official coverage and definitions",
          url: "https://ec.europa.eu/eurostat/cache/metadata/en/migr_immi_esms.htm",
        }
      : currentOfficialResolver().sources[MODEL_SOURCE_ID])
  );
}
function sourceNode(source) {
  const a = document.createElement("a");
  a.href = source.url || source.primaryUrl;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = (source.name || source.label || source.provider) + " ↗";
  return a;
}
function scenarioProvenance() {
  if (typeof movement !== "undefined" && movement.series)
    return {
      corridors: movementCorridors(),
      start: movement.start,
      end: movement.end,
      through: movement.start + movement.cursor - 1,
    };
  if (
    typeof countries === "undefined" ||
    !countries ||
    typeof state === "undefined"
  )
    return null;
  const key = [state.country, state.dir, (state.route || []).join(":")].join(
    "|",
  );
  if (dataUI.corridorKey !== key) {
    const codes = Object.values(countries)
      .filter((c) => c.hasData)
      .map((c) => c.code);
    dataUI.corridors = state.route
      ? [state.route]
      : state.country
        ? countries[state.country]?.hasData
          ? codes
              .filter((c) => c !== state.country)
              .flatMap((c) =>
                state.dir === "both"
                  ? [
                      [state.country, c],
                      [c, state.country],
                    ]
                  : [
                      state.dir === "in"
                        ? [c, state.country]
                        : [state.country, c],
                    ],
              )
          : []
        : codes.flatMap((a) => codes.filter((b) => a !== b).map((b) => [a, b]));
    dataUI.corridorKey = key;
  }
  return {
    corridors: dataUI.corridors,
    start: state.year,
    end: state.endYear,
    through: state.endYear,
  };
}
function hasBelarusPoland(corridors, start, end) {
  return (
    end >= 2020 &&
    start <= 2024 &&
    corridors.some(([a, b]) => a === "BLR" && b === "POL")
  );
}
const belarusCaution =
  "Belarus → Poland, 2020–2024: no comparable official annual flow is available in the imported sources. The FLOW estimate is not validated as a headcount of the post-2020 exodus. Official residence-document figures are shown separately in route details.";
function updateDataDisclosure() {
  if (!dataUI.mounted || !officialResolver) return;
  const select = document.querySelector("#data-policy");
  if (select) {
    select.value = dataPolicy;
    select.disabled = typeof countries === "undefined" || !countries;
  }
  const scenario = scenarioProvenance(),
    note = document.querySelector("#data-quality");
  if (!scenario) return;
  const { corridors, start, end, through } = scenario;
  const disclosureKey = [
    dataPolicy,
    start,
    end,
    typeof movement !== "undefined" && movement.series
      ? [
          movement.focus,
          movement.direction,
          (movement.peers || []).join(","),
        ].join(":")
      : [
          state.country,
          state.dir,
          (state.route || []).join(":"),
          dataStatus,
        ].join(":"),
    corridors.length,
  ].join("|");
  const quality =
    dataUI.disclosureKey === disclosureKey
      ? dataUI.quality
      : summarizeProvenance(corridors, start, end);
  dataUI.disclosureKey = disclosureKey;
  dataUI.quality = quality;
  note.textContent = "Selected range · " + sourceSummaryText(quality);
  for (const id of quality.sourceIds) {
    note.append(
      document.createTextNode(" "),
      sourceNode(currentOfficialResolver().sources[id]),
    );
  }
  const caution = document.querySelector("#data-caution");
  caution.hidden =
    !(
      state.country ||
      state.route ||
      (typeof movement !== "undefined" && movement.focus)
    ) || !hasBelarusPoland(corridors, start, end);
  caution.textContent =
    dataPolicy === "official"
      ? "Belarus → Poland: official annual arrivals are unavailable in the imported sources. The dated official residence figure is shown separately; it is not an arrival total."
      : belarusCaution;
  renderOfficialResidence(
    document.querySelector("#official-residence-card"),
    corridors,
    start,
    through,
  );
  if (typeof movement !== "undefined" && movement.series) {
    const q = summarizeProvenance(corridors, start, through);
    const total =
      selectedPeers().reduce(
        (sum, peer) => sum + Math.round(cumulative(peer) * 10),
        0,
      ) / 10;
    document.querySelector("#movement-count").textContent =
      `${formatSourceValue(total, q)} accumulated · ${formatSourceValue(movement.total, quality)} across ${start}–${end}`;
  } else if (typeof dataStatus !== "undefined" && dataStatus === "ready") {
    const total = document.querySelector(
      "#outgoing-total,#incoming-total,#country-total",
    );
    if (total && quality.total) {
      const selected = new Set(corridors.map(([a, b]) => a + ":" + b));
      total.textContent = formatSourceValue(
        rows.reduce(
          (sum, [a, b, value]) =>
            sum + (selected.has(a + ":" + b) ? Math.round(value * 10) : 0),
          0,
        ) / 10,
        quality,
      );
    }
  }
}
async function renderOfficialResidence(target, corridors, start, through) {
  if (!target) return;
  const eligible = hasBelarusPoland(corridors, start, through);
  const key = [eligible, start, through].join(":");
  if (target.dataset.key === key) return;
  target.dataset.key = key;
  target.hidden = true;
  target.replaceChildren();
  if (!eligible) return;
  try {
    const context = await contextData();
    if (target.dataset.key !== key || !target.isConnected) return;
    const records = context.records
      .filter(
        (r) =>
          Number(r.date.slice(0, 4)) >= start &&
          Number(r.date.slice(0, 4)) <= through,
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!records.length) return;
    const latest = records.at(-1);
    const tag = document.createElement("span");
    tag.className = "residence-tag";
    tag.textContent = "OFFICIAL RESIDENCE STATISTIC";
    const heading = document.createElement("h3");
    heading.textContent =
      latest.metricKey === "residence_permit_holders_stock"
        ? "Belarusian citizens holding Polish residence permits"
        : "Belarusian citizens holding valid Polish residence documents";
    const number = document.createElement("strong");
    number.className = "residence-value";
    number.textContent =
      (latest.approximate ? "≈ " : "") + latest.value.toLocaleString("en");
    const date = document.createElement("p");
    date.className = "residence-date";
    date.textContent =
      "As of " +
      new Date(
        latest.date.length === 7
          ? latest.date + "-01T12:00:00Z"
          : latest.date + "T12:00:00Z",
      ).toLocaleDateString(
        "en-GB",
        latest.datePrecision === "month"
          ? { year: "numeric", month: "long", timeZone: "UTC" }
          : { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
      ) +
      " · " +
      latest.date;
    const meaning = document.createElement("p");
    meaning.textContent =
      "Latest sourced official residence figure within the displayed years. This is a stock of residents at a date, not arrivals during the selected range. " +
      (latest.metricKey === "residence_permit_holders_stock"
        ? "Residence-permit holders, excluding visas. "
        : "");
    target.append(
      tag,
      heading,
      number,
      date,
      meaning,
      sourceNode({ name: latest.provider, url: latest.url }),
    );
    const history = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Earlier official residence figures";
    history.append(summary);
    for (const record of records.slice(0, -1)) {
      const p = document.createElement("p");
      p.textContent =
        record.date +
        ": ≈ " +
        record.value.toLocaleString("en") +
        " · " +
        record.label +
        ". ";
      p.append(sourceNode({ name: record.provider, url: record.url }));
      history.append(p);
    }
    if (records.length > 1) target.append(history);
    target.hidden = false;
  } catch {
    if (target.dataset.key !== key || !target.isConnected) return;
    const retry = document.createElement("button");
    retry.textContent = "Retry official residence figures";
    retry.onclick = () => {
      delete target.dataset.key;
      renderOfficialResidence(target, corridors, start, through);
    };
    target.append(retry);
    target.hidden = false;
  }
}
async function rawRouteSeries(code) {
  if (!dataUI.raw.has(code))
    dataUI.raw.set(
      code,
      fetch(`data/series/out/${code}.json`)
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .catch((error) => {
          dataUI.raw.delete(code);
          throw error;
        }),
    );
  return dataUI.raw.get(code);
}
async function contextData() {
  if (!dataUI.context)
    dataUI.context = fetch("data/official/context.json")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .catch((error) => {
        dataUI.context = null;
        throw error;
      });
  return dataUI.context;
}
async function renderRouteDataPanel(origin, destination) {
  const box = document.querySelector(".route-provenance");
  if (!box || !officialResolver) return;
  if (dataStatus !== "ready") {
    dataUI.routeToken++;
    dataUI.routeKey = "";
    delete box.dataset.key;
    box.textContent =
      dataStatus === "loading"
        ? "Loading source coverage…"
        : "Source coverage unavailable. Reapply the range to retry.";
    document
      .querySelectorAll(".route-stat-quality")
      .forEach((el) => el.remove());
    return;
  }
  const start = state.year,
    end = state.endYear,
    key = [origin, destination, start, end, dataPolicy].join(":");
  if (dataUI.routeKey === key && box.dataset.key === key) return;
  dataUI.routeKey = key;
  box.dataset.key = key;
  const token = ++dataUI.routeToken;
  box.replaceChildren();
  const h = document.createElement("strong");
  h.textContent =
    "Data basis · " +
    (dataPolicy === "official"
      ? "Official statistics · gaps remain unavailable"
      : dataPolicy === "best"
        ? "Best available comparison · official first, model fallback"
        : "FLOW model only");
  box.append(h);
  for (const [a, b] of [
    [origin, destination],
    [destination, origin],
  ]) {
    const info = getRouteProvenance(a, b, start, end),
      p = document.createElement("p");
    const stat = document.querySelector(
      a === origin ? "#route-forward-count" : "#route-reverse-count",
    )?.parentElement;
    if (stat) {
      stat.querySelector(".route-stat-quality")?.remove();
      const badge = document.createElement("small");
      badge.className = "route-stat-quality cell-quality";
      badge.textContent =
        info.label +
        (hasBelarusPoland([[a, b]], start, end)
          ? " · not a verified arrival count"
          : "");
      stat.append(badge);
      stat
        .querySelector("strong")
        ?.classList.toggle(
          "unavailable-value",
          dataPolicy === "official" && !info.official,
        );
    }
    p.className = "direction-quality";
    p.textContent = `${name(a)} → ${name(b)} · ${sourceSummaryText(info)}`;
    box.append(p);
    for (const source of info.sources) {
      box.append(sourceNode(source), document.createTextNode(" "));
      const dates = document.createElement("small");
      dates.className = "cell-quality";
      dates.textContent = source.updated
        ? "Source updated " +
          source.updated +
          " · retrieved " +
          source.retrievedAt
        : "";
      box.append(dates);
    }
  }
  const explain = document.querySelector(".route-explanation");
  if (explain)
    explain.textContent =
      dataPolicy === "official"
        ? "Only published official annual changes of usual residence are shown. Missing observations remain unavailable; partial values are reported subtotals, not complete range totals. Gross movements can include repeat migrants. Residence stocks and permits are separate measures."
        : "Annual changes of usual residence across the selected calendar years, both included. Official previous/next-residence statistics are preferred; missing route-years use statistical FLOW estimates. Gross movements may include repeat migrants. These are not citizenship-based resident populations, residence permits or visas.";
  const method = document.querySelector(".route-method p");
  if (method)
    method.textContent =
      "Official statistics is the default and never fills gaps with FLOW. Partial figures are reported subtotals. Optional Best available comparison prefers destination-reported immigration by previous residence, then origin-reported emigration by next residence. It uses FLOW only where no comparable official observation was imported. Official estimates, provisional figures and definition/series breaks retain their source flags. Receiver and sender reports can disagree; they are never added or averaged. A mixed sum is not a consistently measured official time series. FLOW model only provides a consistent model comparison. Neither source establishes why an individual migrated.";
  let residence = document.querySelector("#route-official-residence-card");
  if (!residence) {
    residence = document.createElement("section");
    residence.id = "route-official-residence-card";
    residence.className = "official-residence-card";
    residence.hidden = true;
    document.querySelector(".route-stats").before(residence);
  }
  renderOfficialResidence(
    residence,
    [
      [origin, destination],
      [destination, origin],
    ],
    start,
    end,
  );
  if (
    hasBelarusPoland(
      [
        [origin, destination],
        [destination, origin],
      ],
      start,
      end,
    )
  ) {
    const warning = document.createElement("section");
    warning.className = "data-warning";
    warning.id = "route-reliability-warning";
    const title = document.createElement("strong");
    title.textContent =
      dataPolicy === "official"
        ? "Official annual arrivals unavailable"
        : "Belarus → Poland: model limitation";
    const p = document.createElement("p");
    p.textContent =
      dataPolicy === "official"
        ? "No comparable official annual Belarus → Poland flow is available in the imported sources for these years. The official residence statistic above counts residents on a date. Model estimates are available only through the comparison controls."
        : belarusCaution;
    warning.append(title, p);
    box.prepend(warning);
  }
  const details = document.createElement("details");
  details.className = "annual-provenance";
  const summary = document.createElement("summary");
  summary.textContent =
    "Annual values, reporting countries and model comparison";
  details.append(summary);
  box.append(details);
  const content = document.createElement("div");
  content.className = "table-scroll";
  details.append(content);
  details.addEventListener("toggle", async () => {
    if (!details.open || content.dataset.loaded) return;
    content.textContent = "Loading annual source values…";
    try {
      const [forward, reverse] = await Promise.all([
        rawRouteSeries(origin),
        rawRouteSeries(destination),
      ]);
      if (token !== dataUI.routeToken || !box.isConnected) return;
      content.replaceChildren();
      const table = document.createElement("table");
      table.className = "route-history-table source-values";
      table.innerHTML =
        "<caption>Values retain published precision. Model comparison is not an additional flow.</caption><thead><tr><th>Year / direction</th><th>Selected value</th><th>Source and measure</th><th>FLOW model comparison</th></tr></thead><tbody></tbody>";
      for (const [a, b, raw] of [
        [origin, destination, forward],
        [destination, origin, reverse],
      ])
        for (const point of getRouteProvenance(a, b, start, end).years) {
          const model = raw.peers[b][point.year - 1960] / 10;
          const value =
              point.kind === "unavailable" ? null : (point.value ?? model),
            tr = document.createElement("tr");
          const label = document.createElement("th");
          label.scope = "row";
          label.textContent = `${point.year} · ${name(a)} → ${name(b)}`;
          const number = document.createElement("td");
          number.textContent =
            value === null
              ? "Official data unavailable"
              : (point.kind === "modelled" || point.kind === "official-estimate"
                  ? "≈ "
                  : "") +
                value.toLocaleString("en", { maximumFractionDigits: 1 });
          const source = document.createElement("td");
          if (point.source) source.append(sourceNode(point.source));
          const description = document.createElement("small");
          description.className = "cell-quality";
          description.textContent = `${point.kind === "unavailable" ? "Official data unavailable" : point.kind === "modelled" ? "Modelled estimate" : point.kind === "official-estimate" ? "Official estimate" : "Official statistic"} · ${point.measure || "residence flow"}${point.reportingCountry ? " · reporter " + point.reportingCountry : ""}${point.flags.length ? " · " + point.flags.map(flagDescription).join(", ") : ""}`;
          source.append(description);
          if (point.alternatives.length) {
            const alt = document.createElement("details");
            const s = document.createElement("summary");
            s.textContent = "Alternative official report (not added)";
            alt.append(s);
            for (const other of point.alternatives) {
              const p = document.createElement("p");
              p.textContent = `${other.value.toLocaleString("en")} · ${other.reportingCountry} · ${other.flags || "unflagged"} · `;
              p.append(
                sourceNode(currentOfficialResolver().sources[other.sourceId]),
              );
              alt.append(p);
            }
            source.append(alt);
          }
          const comparison = document.createElement("td");
          comparison.textContent =
            "≈ " + model.toLocaleString("en", { maximumFractionDigits: 1 });
          tr.append(label, number, source, comparison);
          table.querySelector("tbody").append(tr);
        }
      content.append(table);
      content.dataset.loaded = "true";
    } catch {
      content.textContent =
        "Could not load the annual comparison. Close and reopen this section to retry.";
    }
  });
}
async function showCountryCoverage() {
  if (typeof pauseMovement === "function") pauseMovement();
  let dialog = document.querySelector("#coverage-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "coverage-dialog";
    dialog.className = "source-dialog";
    dialog.setAttribute("aria-label", "Country coverage and sources");
    document.body.append(dialog);
  }
  dialog.innerHTML =
    '<button class="source-close" type="button">Close ×</button><h2>Country coverage & sources</h2><p>194 countries have FLOW model coverage. Official imports cover only some country pairs and years from 2008–2024. Appearing as a partner in another country’s report does not mean complete national coverage. Fourteen national agencies’ metadata has been reviewed; 180 have not been individually verified.</p><p>Official statistics uses destination immigration by previous residence, then origin emigration by next residence. Gaps stay unavailable; FLOW is opt-in through comparison modes. Permit holders, visas, nationality-based flows and resident stocks remain separate measures.</p><label>Find a country<input id="coverage-search" type="search"></label><div id="coverage-results" role="status">Loading coverage…</div>';
  dialog.querySelector("button").onclick = () => dialog.close();
  dialog.showModal();
  dialog.querySelector("button").focus();
  try {
    const response = await fetch("data/official/coverage.json");
    if (!response.ok) throw Error();
    const payload = await response.json();
    const render = () => {
      const results = dialog.querySelector("#coverage-results");
      results.replaceChildren();
      const q = dialog.querySelector("input").value.toLowerCase();
      for (const [code, country] of Object.entries(payload.countries)
        .filter(([code, c]) => (code + " " + c.name).toLowerCase().includes(q))
        .sort((a, b) => a[1].name.localeCompare(b[1].name))) {
        const item = document.createElement("section");
        const h = document.createElement("h3");
        h.textContent = country.name + " · " + code;
        const p = document.createElement("p");
        p.textContent = `Selected official incoming: ${country.incomingRecordYears.toLocaleString("en")} corridor-years; outgoing: ${country.outgoingRecordYears.toLocaleString("en")} corridor-years. ${country.years.length ? "Some coverage in " + Math.min(...country.years) + "–" + Math.max(...country.years) + "." : "No comparable official import."} Missing pairs/years stay unavailable in Official statistics. National review: ${String(country.nationalReviewStatus).replaceAll("_", " ")}.`;
        item.append(h, p);
        const reporting = document.createElement("p");
        reporting.textContent =
          "Coverage: " +
          country.reportingStatus.replaceAll("_", " ") +
          ". Counts include published zeros and refer to route-year records, not people.";
        item.append(reporting);
        for (const id of new Set([
          ...Object.keys(country.selectedSourceCounts.incoming),
          ...Object.keys(country.selectedSourceCounts.outgoing),
          ...(country.nationalSourceIds || []),
        ])) {
          const source = payload.sources[id];
          if (source?.url || source?.primaryUrl) {
            const line = document.createElement("p");
            line.textContent = source.imported
              ? "Imported official provider: "
              : "National metadata reviewed, not imported: ";
            line.append(sourceNode(source));
            item.append(line);
          }
        }
        for (const id of country.candidateSourceIds || []) {
          const source = payload.sources[id];
          if (source?.url || source?.primaryUrl) {
            const line = document.createElement("p");
            line.textContent = "Candidate (not imported): ";
            line.append(sourceNode(source));
            item.append(line);
          }
        }
        results.append(item);
      }
    };
    dialog.querySelector("input").oninput = render;
    render();
  } catch {
    dialog.querySelector("#coverage-results").textContent =
      "Coverage could not be loaded. Close and reopen to retry.";
  }
}
function mountDataUI() {
  if (dataUI.mounted) return;
  const controls = document.createElement("div");
  controls.className = "data-controls";
  controls.innerHTML =
    '<label>Data basis<select id="data-policy"><option value="official">Official statistics</option><option value="best">Best available comparison</option><option value="model">FLOW model only</option></select></label><button id="source-coverage" type="button">Country coverage & sources ↗</button>';
  const target =
    document.querySelector(".movement-switches") ||
    document.querySelector(".toolbar");
  if (!target) return;
  target.after(controls);
  const note = document.createElement("p");
  note.id = "data-quality";
  note.className = "data-quality";
  note.setAttribute("aria-live", "polite");
  const warning = document.createElement("p");
  warning.id = "data-caution";
  warning.className = "data-warning";
  warning.hidden = true;
  const dock =
    document.querySelector("#playback-dock") ||
    document.querySelector(".map-column");
  const residence = document.createElement("section");
  residence.id = "official-residence-card";
  residence.className = "official-residence-card";
  residence.hidden = true;
  dock.append(residence, note, warning);
  document.querySelector("#source-coverage").onclick = showCountryCoverage;
  document.querySelector("#data-policy").value = dataPolicy;
  document.querySelector("#data-policy").disabled =
    typeof countries === "undefined" || !countries;
  document.querySelector("#data-policy").onchange = async (event) => {
    const policy = event.target.value;
    const policyToken = (dataUI.policyToken || 0) + 1;
    dataUI.policyToken = policyToken;
    const routeOpen = document.querySelector("#route-dialog").open;
    const pair = routeOpen
      ? [
          document.querySelector("#pair-origin").value,
          document.querySelector("#pair-destination").value,
        ]
      : null;
    if (typeof pauseMovement === "function") pauseMovement();
    const active = typeof movement !== "undefined" && movement.focus;
    if (typeof movement !== "undefined") {
      movement.token++;
      movement.series = null;
      movement.cursor = 0;
      paintMovement();
    }
    setDataPolicy(policy);
    dataUI.routeKey = "";
    note.textContent = "Loading the selected data basis…";
    await setRange(state.year, state.endYear, state.customRange);
    if (policyToken !== dataUI.policyToken) return;
    if (active) await prepareMovement();
    if (policyToken !== dataUI.policyToken) return;
    if (pair) await openRouteDetails(...pair);
    updateDataDisclosure();
  };
  dataUI.mounted = true;
  updateDataDisclosure();
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", mountDataUI, { once: true });
else mountDataUI();

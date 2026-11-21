/* The country picker and timeline are shared with the map and its advanced controls. */
(() => {
  const picker = document.querySelector("#country");
  const options = document.querySelector("#section-selection");
  const viewbar = document.querySelector(".map-viewbar");
  if (!picker || !options || !viewbar) return;

  const overview = document.createElement("section");
  overview.id = "country-overview";
  overview.className = "layout-ancillary";
  overview.setAttribute("aria-label", "Country overview");
  overview.innerHTML = `
    <div class="overview-header">
      <div id="overview-country"></div>
      <div class="overview-date-block"><small>Latest flow year · 2024</small><button type="button" id="overview-dates" aria-controls="section-selection">Edit years</button></div>
    </div>
    <div class="overview-actions">
      <button type="button" id="overview-in" aria-pressed="false">Who arrived?<span>Migration into the country</span></button>
      <button type="button" id="overview-out" aria-pressed="false">Where did people go?<span>Migration out of the country</span></button>
      <button type="button" id="overview-residents" aria-haspopup="dialog">Who lives here?<span>Residents by origin</span></button>
    </div>
    <p id="overview-prompt" role="status" hidden></p>
    <div id="overview-summary" hidden>
      <section id="overview-national" aria-labelledby="uk-heading" hidden>
        <h2 id="uk-heading">UK national migration</h2>
        <p id="uk-status" role="status"></p>
        <button id="uk-retry" type="button" hidden>Retry national estimates</button>
        <div id="uk-figures" hidden>
          <dl class="uk-totals">
            <div><dt>Net migration</dt><dd id="uk-net"></dd></div>
            <div><dt>Immigration</dt><dd id="uk-immigration"></dd></div>
            <div><dt>Emigration</dt><dd id="uk-emigration"></dd></div>
          </dl>
          <p>ONS counts long-term moves of at least 12 months, across all countries and citizenships. Net migration is immigration minus emigration. ONS rounds the three estimates separately.</p>
          <details id="uk-annual"><summary>Annual national estimates</summary>
            <table id="uk-years"><caption>Calendar years ending in December</caption><thead><tr>
              <th scope="col">Year</th><th scope="col">Immigration</th><th scope="col">Emigration</th><th scope="col">Net</th>
            </tr></thead><tbody></tbody></table>
            <p id="uk-method-break">ONS advises caution when comparing figures across June 2021, when its methods changed.</p>
          </details>
          <p class="uk-source"></p>
        </div>
      </section>
      <h2 id="overview-period"></h2>
      <div class="overview-totals" aria-live="polite">
        <div><h3>Arrivals by origin</h3><strong id="overview-in-total"></strong><small id="overview-in-basis"></small></div>
        <div><h3>Departures by destination</h3><strong id="overview-out-total"></strong><small id="overview-out-basis"></small></div>
      </div>
      <p id="overview-route-note" hidden></p>
      <button type="button" id="overview-retry" hidden>Retry country figures</button>
      <details id="overview-compare"><summary>Leading origins and destinations over time</summary><div id="overview-rankings"></div></details>
    </div>`;
  viewbar.before(overview);
  document.querySelector("#overview-country").append(picker.closest("label"));
  options.querySelector(":scope > summary").textContent = "Dates, counterparts and map options";
  const preferenceKey = "migration-atlas.country-options.open";
  try { options.open = localStorage.getItem(preferenceKey) === "true"; }
  catch { options.open = false; }
  options.addEventListener("toggle", () => {
    try { localStorage.setItem(preferenceKey, String(options.open)); } catch {}
  });
  options.querySelector(".selection-content").prepend(document.querySelector("#range-form"));
  document.body.classList.add("overview-ready");

  const control = (id) => document.getElementById("overview-" + id);
  const comparison = control("compare");
  let pendingResidents = false;
  let pendingDirection = null;
  let currentKey = "";
  let request = 0;
  let loaded = {};
  let selection;
  let ukRequest;

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function loadUKNational() {
    if (!ukRequest) {
      ukRequest = fetch("data/official/uk-national.json").then(async response => {
        if (!response.ok) throw Error("ONS series unavailable");
        const data = await response.json();
        if (!data.source?.url || !data.source.releaseDate || !Array.isArray(data.years) || !data.years.length)
          throw Error("Incomplete ONS series");
        const seen = new Set();
        for (const row of data.years) {
          if (![row.year, row.immigration, row.emigration, row.net].every(Number.isSafeInteger) ||
              row.immigration < 0 || row.emigration < 0 || seen.has(row.year))
            throw Error("Invalid ONS observation");
          seen.add(row.year);
        }
        return data;
      }).catch(error => { ukRequest = null; throw error; });
    }
    return ukRequest;
  }
  async function renderUKNational(country, start, end, token) {
    const panel = control("national");
    panel.hidden = country !== "GBR";
    if (panel.hidden) return;
    const status = panel.querySelector("#uk-status");
    const figures = panel.querySelector("#uk-figures");
    const retry = panel.querySelector("#uk-retry");
    const range = start === end ? String(start) : `${start}–${end}`;
    panel.querySelector("h2").textContent = "UK national migration · " + range;
    figures.hidden = true;
    retry.hidden = true;
    status.textContent = "Loading ONS estimates…";
    try {
      const {years, source} = await loadUKNational();
      if (token !== request) return;
      const rows = years.filter(row => row.year >= start && row.year <= end).sort((a, b) => a.year - b.year);
      const complete = rows.length === end - start + 1;
      const first = Math.min(...years.map(row => row.year)), last = Math.max(...years.map(row => row.year));
      status.textContent = complete ? (start === end ? "Official estimate for the year ending in December." : "Sum of ONS estimates for the selected calendar years.")
        : `The ONS series in this release covers ${first}–${last}. A total for the full selection is unavailable.`;
      function display(field, value) {
        return (field === "net" && value > 0 ? "+" : "") + value.toLocaleString("en-GB");
      }
      const fields = ["immigration", "emigration", "net"];
      for (const field of fields) {
        const total = rows.reduce((sum, row) => sum + row[field], 0);
        panel.querySelector("#uk-" + field).textContent = complete ? display(field, total) : "Unavailable for full range";
      }
      const body = panel.querySelector("tbody");
      body.replaceChildren();
      for (const row of rows) {
        const tr = body.insertRow();
        const year = element("th", row.year);
        year.scope = "row";
        tr.append(year);
        for (const field of fields) tr.append(element("td", display(field, row[field])));
      }
      panel.querySelector("#uk-annual").hidden = !rows.length;
      panel.querySelector("#uk-method-break").hidden = !(start <= 2020 && end >= 2021);
      const sourceLink = element("a", "Office for National Statistics");
      sourceLink.href = source.url;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener";
      const release = new Intl.DateTimeFormat("en-GB", {dateStyle: "long", timeZone: "UTC"}).format(new Date(source.releaseDate));
      const revised = rows.filter(row => row.revised).map(row => row.year);
      const revision = revised.length ? " · Revised estimates for " + revised.join(", ") : "";
      panel.querySelector(".uk-source").replaceChildren(sourceLink, " · Released " + release + revision);
      figures.hidden = false;
    } catch {
      if (token !== request) return;
      status.textContent = "The UK national estimates could not be loaded.";
      retry.hidden = false;
      retry.onclick = () => renderUKNational(country, start, end, token);
    }
  }
  function hint(text) {
    control("prompt").textContent = text;
    control("prompt").hidden = !text;
  }
  function dates() {
    return movement.focus && movement.focus === picker.value
      ? [movement.start, movement.end]
      : [state.year, state.endYear];
  }
  function selectDirection(direction) {
    pendingResidents = false;
    hint("");
    const country = picker.value;
    if (!country || !countries?.[country]?.hasData) {
      pendingDirection = country ? null : direction;
      document.querySelector(`.segments [data-dir="${direction}"]`).click();
      if (!country) {
        hint("Choose a country above to see its " + (direction === "in" ? "arrivals." : "departures."));
        picker.focus();
      }
      sync();
      return;
    }
    const [start, end] = dates();
    applyCountryScenario({ focus: country, direction, peers: null, start, end });
    sync();
  }
  control("in").onclick = () => selectDirection("in");
  control("out").onclick = () => selectDirection("out");
  control("residents").onclick = () => {
    if (picker.value) {
      hint("");
      window.openResidents(picker.value);
    } else {
      pendingDirection = null;
      pendingResidents = true;
      hint("Choose a country above to see its residents by origin.");
      picker.focus();
    }
  };
  control("dates").onclick = () => {
    options.open = true;
    document.querySelector("#range-start").focus();
  };
  picker.addEventListener("change", () => {
    if (picker.value && pendingDirection && countries?.[picker.value]?.hasData) {
      state.dir = pendingDirection;
      document.querySelector("#movement-direction").value = pendingDirection;
    }
    pendingDirection = null;
  }, true);
  picker.addEventListener("change", () => {
    hint("");
    if (pendingResidents && picker.value) {
      pendingResidents = false;
      control("residents").focus();
      window.openResidents(picker.value);
    }
    queueMicrotask(sync);
  });

  function corridor(focus, direction, peer) {
    return direction === "in" ? [peer, focus] : [focus, peer];
  }
  function summarize(series, direction, start, end) {
    const corridors = [], ranks = [];
    let total = 0;
    for (const [peer, values] of Object.entries(series.peers)) {
      corridors.push(corridor(series.country, direction, peer));
      let tenths = 0;
      for (let year = start; year <= end; year++) tenths += values[year - 1960] ?? 0;
      total += tenths;
      if (tenths > 0) ranks.push({peer, count: tenths / 10});
    }
    const quality = summarizeProvenance(corridors, start, end);
    ranks.sort((a, b) => b.count - a.count || a.peer.localeCompare(b.peer));
    return { quality, value: formatSourceValue(total / 10, quality), ranks };
  }
  function coverage(q) {
    const n = (count) => count.toLocaleString("en");
    if (q.modelled && !q.official) return `FLOW model · ${n(q.modelled)} modelled route-years`;
    const extra = q.modelled ? ` · ${n(q.modelled)} modelled` : "";
    return `${q.label} · ${n(q.official)} of ${n(q.total)} route-years officially reported${extra}`;
  }
  function renderRankings() {
    const list = control("rankings");
    if (!comparison.open || !selection) return;
    list.replaceChildren();
    const {country, start, end} = selection;
    if (!Object.keys(loaded).length) {
      list.textContent = "Rankings appear when country figures are available.";
      return;
    }
    const periods = [[start, end]];
    const previousStart = start - (end - start + 1);
    if (previousStart >= 1960) periods.push([previousStart, start - 1]);
    list.append(element("p", "Largest positive flows in each period. Reporting coverage can change between periods."));
    for (const [first, last] of periods) {
      const period = element("section", "");
      period.append(element("h3", first === last ? String(first) : `${first}–${last}`));
      const grid = element("div", "");
      grid.className = "overview-rank-grid";
      for (const direction of ["in", "out"]) {
        const part = element("div", "");
        part.append(element("h4", direction === "in" ? "Origins of arrivals" : "Destinations of departures"));
        if (loaded[direction]) {
          const result = summarize(loaded[direction], direction, first, last);
          part.append(element("small", coverage(result.quality)));
          if (result.ranks.length) {
            const ol = element("ol", "");
            for (const {peer, count} of result.ranks.slice(0, 3)) {
              const pair = corridor(country, direction, peer);
              const q = summarizeProvenance([pair], first, last);
              const row = element("li", "");
              const button = element("button", `${name(peer)} · ${formatSourceValue(count, q)}`);
              button.type = "button";
              button.setAttribute("aria-label", `View ${name(pair[0])} to ${name(pair[1])}, ${first}–${last}`);
              button.onclick = () => openRouteDetails(...pair, {year: first, endYear: last, customRange: true});
              row.append(button);
              ol.append(row);
            }
            part.append(ol);
          } else part.append(element("p", "No positive flows available to rank."));
        } else part.append(element("p", "Figures unavailable."));
        grid.append(part);
      }
      period.append(grid);
      list.append(period);
    }
    if (previousStart < 1960)
      list.append(element("p", "An earlier period of the same length would begin before 1960, the first year with migration flows."));
  }
  comparison.addEventListener("toggle", renderRankings);
  function sync() {
    if (!document?.body || !overview.isConnected) return;
    const country = picker.value;
    const [start, end] = dates();
    const direction = movement.focus && movement.focus === country ? movement.direction : state.dir;
    for (const d of ["in", "out"])
      control(d).setAttribute("aria-pressed", String(direction === d && (!country || movement.peers === null)));
    control("dates").textContent = `${start}–${end} · Edit years`;
    const key = [country, start, end, dataPolicy, !!countries?.[country]?.hasData].join("|");
    if (key === currentKey) return;
    currentKey = key;
    const token = ++request;
    loaded = {};
    selection = {country, start, end};
    control("summary").hidden = !country;
    control("retry").hidden = true;
    renderUKNational(country, start, end, token);
    if (!country) return;
    const period = start === end ? start : `${start}–${end}`;
    control("period").textContent = `${name(country)} · Partner-country flows · ${period}`;
    const routeNote = control("route-note");
    routeNote.hidden = country !== "GBR";
    routeNote.textContent = dataPolicy === "official"
      ? "The map adds up the routes with official reports. Gaps in UK partner reporting make these subtotals unsuitable for calculating national net migration."
      : "The map uses the selected comparison series for individual routes. The national figures above come from ONS.";
    const available = countries?.[country]?.hasData && start >= 1960 && end <= 2024;
    comparison.hidden = !available;
    for (const d of ["in", "out"]) {
      control(d + "-total").textContent = available ? "Loading…" : "Unavailable";
      control(d + "-basis").textContent = available ? "" : "No compatible flow series for this selection.";
    }
    renderRankings();
    if (!available) return;
    for (const d of ["in", "out"]) {
      loadCountrySeries(country, d).then(series => {
        if (token !== request) return;
        const result = summarize(series, d, start, end);
        loaded[d] = series;
        control(d + "-total").textContent = result.value;
        control(d + "-basis").textContent = coverage(result.quality);
        renderRankings();
      }).catch(() => {
        if (token !== request) return;
        control(d + "-total").textContent = "Unavailable";
        control(d + "-basis").textContent = "Could not load the migration figures.";
        control("retry").hidden = false;
        renderRankings();
      });
    }
  }
  control("retry").onclick = () => { currentKey = ""; sync(); };
  // Programmatic changes from the map, route discovery and playback share these status nodes.
  const observer = new MutationObserver(sync);
  for (const id of ["period", "movement-status", "movement-focus", "map-status"])
    observer.observe(document.getElementById(id), {childList: true, subtree: true, characterData: true});
  document.addEventListener("change", () => queueMicrotask(sync));
  sync();
})();

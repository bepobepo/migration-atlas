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
      <section id="overview-national" aria-labelledby="national-heading" hidden>
        <h2 id="national-heading"></h2>
        <details id="national-dates">
          <summary>Change national years</summary>
          <form id="national-range-form">
            <label>From year<input id="national-start" type="number" step="1" min="1950" max="2024" required></label>
            <label>To year<input id="national-end" type="number" step="1" min="1950" max="2024" required></label>
            <button type="submit">Apply national years</button><button id="national-full" type="button">Full history (1950–2024)</button><button id="national-use-map" type="button">Use map years</button>
            <p id="national-date-error" role="alert" hidden></p>
          </form>
        </details>
        <p id="national-status" role="status"></p>
        <button id="national-retry" type="button" hidden>Retry national figures</button>
        <div id="national-figures" hidden>
          <dl class="national-totals">
            <div><dt>Net migration</dt><dd><strong id="national-net"></strong><small id="national-net-basis"></small></dd></div>
            <div><dt>Immigration</dt><dd><strong id="national-immigration"></strong><small id="national-immigration-basis"></small></dd></div>
            <div><dt>Emigration</dt><dd><strong id="national-emigration"></strong><small id="national-emigration-basis"></small></dd></div>
          </dl>
          <p id="national-note"></p>
          <p id="national-attribution"></p>
          <details id="national-annual"><summary>Annual figures and sources</summary>
            <div class="national-table-scroll">
              <table id="national-years"><caption></caption><thead><tr>
                <th scope="col">Year</th><th scope="col">Immigration</th><th scope="col">Emigration</th><th scope="col">Net</th>
              </tr></thead><tbody></tbody></table>
            </div>
            <div id="national-sources"></div>
          </details>
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

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  const nationalPanel = control("national");
  const national = id => document.getElementById("national-" + id);
  const fields = ["immigration", "emigration", "net"];
  const kindLabels = {
    published: "Published national figure",
    derived: "Calculated from national flows",
    estimate: "Demographic estimate",
    projection: "Projection",
  };
  const annualLabels = { published: "Published", derived: "Calculated", estimate: "Estimate", projection: "Projection" };
  const signed = new Intl.NumberFormat("en", {signDisplay: "exceptZero", maximumFractionDigits: 1});
  const unsigned = new Intl.NumberFormat("en", {maximumFractionDigits: 1});
  let nationalRequest = 0;
  let nationalMapKey = "";

  function nationalValue(field, value) {
    return (field === "net" ? signed : unsigned).format(value);
  }
  function sourceLink(source) {
    const link = element("a", source.name);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener";
    return link;
  }
  function sourceDate(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Intl.DateTimeFormat("en-GB", {dateStyle: "long", timeZone: "UTC"}).format(new Date(value));
    }
    return value;
  }
  function renderNationalFigures({years, sources}, start, end) {
    const sourceIds = [...new Set(years.flatMap(row => fields.flatMap(field => row[field]?.sourceIds || [])))];
    for (const field of fields) {
      const available = years.map(row => row[field]).filter(observation => observation != null);
      const complete = available.length === end - start + 1;
      const kinds = [...new Set(available.map(observation => observation.kind))];
      const series = new Set(available.map(obs => obs.kind + "/" + obs.sourceIds.join("/")));
      const total = available.reduce((sum, obs) => sum + obs.value, 0);
      national(field).textContent = complete ? nationalValue(field, total)
        : available.length ? "Unavailable for full range" : "Unavailable";
      const notes = kinds.map(kind => kind === "projection" && kinds.length > 1 ? "Includes a projection" : kindLabels[kind]);
      if (series.size > 1) notes.unshift("Mixed annual series");
      const flags = new Set(available.flatMap(obs => obs.flags));
      if (flags.size) notes.push(...flags);
      if (!complete) notes.unshift(`${available.length} of ${years.length} years available`);
      national(field + "-basis").textContent = notes.join(" · ");
    }

    const list = element("ol", "");
    const attribution = national("attribution");
    attribution.replaceChildren();
    attribution.hidden = !sourceIds.length;
    sourceIds.forEach((id, i) => {
      const source = sources[id];
      if (i) attribution.append(" · ");
      attribution.append(sourceLink(source));
      if (source.releaseDate) attribution.append(" (" + sourceDate(source.releaseDate) + ")");
      const item = element("li", "");
      item.append(sourceLink(source));
      if (source.definition) item.append(element("div", source.definition));
      list.append(item);
    });
    national("sources").replaceChildren(list);
    const body = national("years").tBodies[0];
    body.replaceChildren();
    for (const row of years) {
      const tr = body.insertRow();
      const year = element("th", row.year);
      year.scope = "row";
      tr.append(year);
      for (const field of fields) {
        const obs = row[field];
        const td = tr.insertCell();
        if (!obs) {
          td.textContent = "Unavailable";
          continue;
        }
        td.append(nationalValue(field, obs.value));
        const refs = obs.sourceIds.map(id => sourceIds.indexOf(id) + 1).join(", ");
        td.append(element("small", [annualLabels[obs.kind] + " [" + refs + "]", ...obs.flags].join(" · ")));
      }
    }
    national("annual").hidden = !sourceIds.length;
    national("years").caption.textContent = "Annual national figures · sources listed below";
    const netOnly = years.some(row => row.net) && !years.some(row => row.immigration || row.emigration);
    national("note").textContent = netOnly
      ? "This series estimates the net balance of people moving into and out of the country. Separate arrival and departure totals require data for each direction."
      : "Net migration is immigration minus emigration. Multi-year figures sum annual values with coverage in every selected year.";
    if (sourceIds.some(id => sources[id].name.includes("Office for National Statistics"))) {
      national("note").textContent += " ONS publishes separately rounded estimates for years ending in December.";
      if (start <= 2020 && end >= 2021)
        national("note").textContent += " Its methods changed in June 2021.";
    }
  }

  async function renderNational(country, start, end) {
    const token = ++nationalRequest;
    const range = start === end ? String(start) : `${start}–${end}`;
    const followsMap = selection.start === start && selection.end === end;
    nationalPanel.hidden = !country;
    national("figures").hidden = true;
    national("retry").hidden = true;
    national("date-error").hidden = true;
    if (!country) return;
    national("heading").textContent = name(country) + " · National migration · " + range;
    national("start").value = start;
    national("end").value = end;
    national("full").disabled = start === 1950 && end === 2024;
    national("use-map").disabled = followsMap;
    national("dates").hidden = false;
    national("status").textContent = "Loading national figures…";
    try {
      const data = await window.loadNational(country, start, end);
      if (token !== nationalRequest) return;
      if (!Object.keys(data.sources).length) {
        national("dates").hidden = true;
        national("status").textContent = "A separate national migration series is unavailable for this area in the selected sources.";
        return;
      }
      renderNationalFigures(data, start, end);
      const any = data.years.some(row => fields.some(field => row[field] != null));
      national("status").textContent = any ? (followsMap ? "Using the map’s years." : "Using a separate national date range.")
        : "National figures are unavailable for the selected years.";
      national("figures").hidden = false;
    } catch {
      if (token !== nationalRequest) return;
      national("status").textContent = "The national migration figures could not be loaded.";
      national("retry").hidden = false;
      national("retry").onclick = () => renderNational(country, start, end);
    }
  }
  national("range-form").onsubmit = event => {
    event.preventDefault();
    const start = national("start").valueAsNumber, end = national("end").valueAsNumber;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1950 || end > 2024 || start > end) {
      national("date-error").textContent = "Enter whole years from 1950 to 2024, with the start year first.";
      national("date-error").hidden = false;
      return;
    }
    renderNational(selection.country, start, end);
  };
  national("use-map").onclick = () => renderNational(selection.country, selection.start, selection.end);
  national("full").onclick = () => renderNational(selection.country, 1950, 2024);
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
    const mapKey = [country, start, end, !!countries?.[country]?.hasData].join("|");
    if (mapKey !== nationalMapKey) {
      nationalMapKey = mapKey;
      renderNational(country, start, end);
    }
    if (!country) return;
    const period = start === end ? start : `${start}–${end}`;
    control("period").textContent = `${name(country)} · Partner-country flows · ${period}`;
    const routeNote = control("route-note");
    routeNote.hidden = !countries?.[country]?.hasData;
    routeNote.textContent = dataPolicy === "official"
      ? "These subtotals add the available partner-country reports. Country coverage and reporting methods can differ from the national figures."
      : "Route subtotals use the map’s selected data series. The national figures above use countrywide sources.";
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

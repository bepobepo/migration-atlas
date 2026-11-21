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
      <h2 id="overview-period"></h2>
      <div class="overview-totals" aria-live="polite">
        <div><h3>Arrivals</h3><strong id="overview-in-total"></strong><small id="overview-in-basis"></small></div>
        <div><h3>Departures</h3><strong id="overview-out-total"></strong><small id="overview-out-basis"></small></div>
      </div>
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
    if (!country) return;
    const period = start === end ? start : `${start}–${end}`;
    control("period").textContent = `${name(country)} · All partners · ${period}`;
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

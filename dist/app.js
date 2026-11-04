const $ = (s) => document.querySelector(s),
  cache = {},
  state = {
    year: 2020,
    endYear: 2024,
    customRange: false,
    country: "",
    dir: "both",
    route: null,
    event: 16,
    limit: 30,
    query: "",
    everywhere: false,
  };
let countries,
  world,
  events,
  rows = [],
  timer,
  loadId = 0,
  detailId = 0,
  dataStatus = "loading";
const dataControls = [
  ...document.querySelectorAll(
    ".toolbar button, .toolbar select, .transport button, #pair-form button, #pair-form select, #range-form input, #range-form button, #year, #search, #more, #all-events",
  ),
];
dataControls.forEach((control) => (control.disabled = true));
const mapTooltip = document.createElement("section");
mapTooltip.id = "migration-tooltip";
mapTooltip.className = "migration-tooltip";
mapTooltip.hidden = true;
mapTooltip.setAttribute("role", "dialog");
mapTooltip.setAttribute("aria-label", "Migration connection details");
mapTooltip.innerHTML =
  '<button class="tooltip-close" type="button" aria-label="Close migration tooltip">×</button><div class="eyebrow">MODELLED MIGRATION</div><h3 class="tooltip-route"></h3><div class="tooltip-period"></div><div class="tooltip-value"></div><p class="tooltip-note">Estimated migrations over five years. May include repeat migrants; individual-route estimates can differ from official records.</p><a class="source" href="https://data.humdata.org/dataset/annual-migration-flow-estimates-by-sex-between-all-countries-since-1960" target="_blank" rel="noopener">FLOW v1.0 · data source ↗</a>';
$(".map-wrap").append(mapTooltip);
const tooltipDetails = document.createElement("button");
tooltipDetails.type = "button";
tooltipDetails.className = "tooltip-details";
tooltipDetails.textContent = "View migration details ↗";
tooltipDetails.onclick = () => {
  if (state.route) openRouteDetails(...state.route);
};
mapTooltip.append(tooltipDetails);
let tooltipRoute = null;
let tooltipOpenedWithKeyboard = false;
function hideMapTooltip(restoreFocus = false) {
  const wasOpen = !mapTooltip.hidden;
  mapTooltip.hidden = true;
  document
    .querySelectorAll(".arc-hit")
    .forEach((el) => el.setAttribute("aria-expanded", "false"));
  if (wasOpen && restoreFocus && tooltipRoute) {
    const trigger = [...document.querySelectorAll(".arc-hit")].find(
      (el) => el.dataset.route === tooltipRoute,
    );
    trigger?.focus({ preventScroll: true });
  } else if (wasOpen && mapTooltip.contains(document.activeElement)) {
    // A touch dismissal should not focus an SVG path: mobile browsers may
    // paint a large native focus rectangle around its transformed bounds.
    document.activeElement.blur();
  }
  tooltipRoute = null;
  tooltipOpenedWithKeyboard = false;
}
function showMapTooltip(event, route) {
  event.stopPropagation();
  const keyboard = event.type === "keydown" || event.detail === 0;
  const anchor = event.currentTarget?.getBoundingClientRect();
  selectRoute(route);
  tooltipRoute = route[0] + "-" + route[1];
  tooltipOpenedWithKeyboard = keyboard;
  mapTooltip.querySelector(".tooltip-route").textContent =
    `${name(route[0])} → ${name(route[1])}`;
  mapTooltip.querySelector(".tooltip-period").textContent = rangeLabel();
  mapTooltip.querySelector(".tooltip-note").textContent =
    `Estimated migrations across ${state.endYear - state.year + 1} calendar year(s), including both selected years. May include repeat migrants; individual-route estimates can differ from official records.`;
  mapTooltip.querySelector(".tooltip-value").textContent =
    "≈ " +
    new Intl.NumberFormat("en", { maximumSignificantDigits: 3 }).format(
      route[2],
    );
  mapTooltip.hidden = false;
  const box = $(".map-wrap").getBoundingClientRect();
  const size = mapTooltip.getBoundingClientRect();
  const x = keyboard
    ? anchor
      ? (anchor.left + anchor.right) / 2
      : box.left + box.width / 2
    : event.clientX;
  const y = keyboard
    ? anchor
      ? (anchor.top + anchor.bottom) / 2
      : box.top + box.height / 2
    : event.clientY;
  const left =
    x - box.left + 14 + size.width <= box.width - 12
      ? x - box.left + 14
      : x - box.left - size.width - 14;
  const top =
    y - box.top + 14 + size.height <= box.height - 12
      ? y - box.top + 14
      : y - box.top - size.height - 14;
  mapTooltip.style.left =
    Math.max(12, Math.min(left, box.width - size.width - 12)) + "px";
  mapTooltip.style.top =
    Math.max(12, Math.min(top, box.height - size.height - 12)) + "px";
  const trigger = [...document.querySelectorAll(".arc-hit")].find(
    (el) => el.dataset.route === tooltipRoute,
  );
  trigger?.setAttribute("aria-expanded", "true");
  if (keyboard)
    mapTooltip.querySelector(".tooltip-close").focus({ preventScroll: true });
}
mapTooltip.querySelector(".tooltip-close").onclick = (event) =>
  hideMapTooltip(tooltipOpenedWithKeyboard || event.detail === 0);
document.addEventListener("pointerdown", (event) => {
  if (!mapTooltip.hidden && !mapTooltip.contains(event.target))
    hideMapTooltip();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !mapTooltip.hidden) {
    event.preventDefault();
    hideMapTooltip(true);
  }
});
window.addEventListener("resize", () => hideMapTooltip());
const fmt = (v) =>
    v === undefined
      ? "No comparable data"
      : v === 0
        ? "Estimated zero"
        : "≈ " +
          new Intl.NumberFormat("en", {
            notation: "compact",
            maximumSignificantDigits: 3,
          }).format(v),
  name = (c) => countries[c]?.name || c,
  period = (y) => `${y}–${y + 4}`;
const rangeLabel = (start = state.year, end = state.endYear) =>
  start === end ? String(start) : `${start}–${end}`;
const svg = d3.select("#map"),
  g = svg.append("g"),
  projection = d3.geoNaturalEarth1().fitExtent(
    [
      [20, 35],
      [980, 515],
    ],
    { type: "Sphere" },
  ),
  path = d3.geoPath(projection),
  centers = {};
let zoom = d3
  .zoom()
  .extent([
    [0, 0],
    [1000, 540],
  ])
  .scaleExtent([1, 7])
  .on("zoom", (e) => {
    hideMapTooltip();
    g.attr("transform", e.transform);
    updateMapSizing();
  });
svg.call(zoom);
const defs = svg.append("defs");
["#287e78", "#cf7956", "#8d7ba4"].forEach((c, i) =>
  defs
    .append("marker")
    .attr("id", "arrow" + i)
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 7)
    .attr("markerUnits", "userSpaceOnUse")
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-3L7,0L0,3")
    .attr("fill", c),
);
const color = (r) =>
  countries[r[0]]?.europe ? (countries[r[1]]?.europe ? 2 : 1) : 0;
const palette = ["#287e78", "#cf7956", "#8d7ba4"];
function mapScale() {
  const box = $("#map").getBoundingClientRect();
  const viewportScale =
    box.width && box.height ? Math.min(box.width / 1000, box.height / 540) : 1;
  return d3.zoomTransform(svg.node()).k * viewportScale;
}
function updateMapSizing() {
  const scale = mapScale();
  defs
    .selectAll("marker")
    .attr("markerWidth", 7 / scale)
    .attr("markerHeight", 7 / scale);
  g.selectAll(".arc, .arc-hit").attr("d", (r) =>
    curve(centers[r[0]], centers[r[1]]),
  );
  g.selectAll(".country-point, .canary-point").attr("r", 2.5 / scale);
  g.selectAll(".endpoint-label").attr(
    "transform",
    (point) => `translate(${point}) scale(${1 / scale})`,
  );
}
window.addEventListener("resize", updateMapSizing);
if (typeof ResizeObserver !== "undefined")
  new ResizeObserver(updateMapSizing).observe(svg.node());
function matches(r) {
  const a = state.country ? r[0] === state.country : !!countries[r[0]]?.europe,
    b = state.country ? r[1] === state.country : !!countries[r[1]]?.europe;
  return (
    (state.dir === "in" ? b : state.dir === "out" ? a : a || b) &&
    (!state.query ||
      `${name(r[0])} ${name(r[1])}`.toLowerCase().includes(state.query))
  );
}
function curve(a, b) {
  if (!a || !b) return null;
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = Math.hypot(dx, dy) || 1;
  return `M${a}Q${(a[0] + b[0]) / 2 - dy * 0.2},${(a[1] + b[1]) / 2 + dx * 0.2} ${b[0] - ((dx / l) * 4) / mapScale()},${b[1] - ((dy / l) * 4) / mapScale()}`;
}
function draw() {
  hideMapTooltip();
  $("#everywhere-controls").hidden = !state.everywhere;
  const mapLimit =
    state.everywhere && $("#show-all-routes").checked ? Infinity : 30;
  const all = rows.filter(matches).sort((a, b) => b[2] - a[2]),
    shown = all.filter((r) => r[2] > 0).slice(0, mapLimit);
  if (state.route) {
    const r = rows.find(
      (r) => r[0] === state.route[0] && r[1] === state.route[1],
    );
    if (r && r[2] > 0 && matches(r) && !shown.includes(r)) shown.push(r);
  }
  g.selectAll(".flow-layer").remove();
  g.selectAll(".story-line").remove();
  g.selectAll(".endpoint-label").remove();
  g.selectAll(".country").classed(
    "selected",
    (d) => d.properties.code === state.country,
  );
  const flowLayer = g.append("g").attr("class", "flow-layer");
  flowLayer
    .selectAll("path")
    .data(shown)
    .join("path")
    .attr("class", "arc")
    .attr("d", (r) => curve(centers[r[0]], centers[r[1]]))
    .attr("stroke", (r) => palette[color(r)])
    .attr("stroke-width", (r) =>
      Math.min(2.4, Math.max(0.7, Math.sqrt(r[2] / 300000))),
    )
    .attr("vector-effect", "non-scaling-stroke")
    .attr("marker-end", (r) => `url(#arrow${color(r)})`)
    .attr("aria-hidden", "true")
    .on("click", (e, r) => showMapTooltip(e, r))
    .append("title")
    .text((r) => `${name(r[0])} → ${name(r[1])}: ${fmt(r[2])}`);
  flowLayer
    .selectAll(".arc-hit")
    .data(shown)
    .join("path")
    .attr("class", "arc-hit")
    .attr("d", (r) => curve(centers[r[0]], centers[r[1]]))
    .attr("data-route", (r) => r[0] + "-" + r[1])
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr(
      "aria-label",
      (r) =>
        `${name(r[0])} to ${name(r[1])}, ${rangeLabel()}, ${fmt(r[2])} estimated migrations. Open details.`,
    )
    .attr("aria-controls", "migration-tooltip")
    .attr("aria-haspopup", "dialog")
    .attr("aria-expanded", "false")
    .on("click", (event, route) => showMapTooltip(event, route))
    .on("keydown", (event, route) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showMapTooltip(event, route);
      }
    });
  const ev = events[state.event];
  if (ev) {
    const a = ev.id === 0 ? projection([-16, 28]) : centers[ev.origin],
      b = centers[ev.destination];
    g.append("path")
      .attr("class", "story-line")
      .attr("d", curve(a, b))
      .attr("fill", "none")
      .attr("stroke", "#c16a46")
      .attr("stroke-width", 1.2)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("stroke-dasharray", "6 5")
      .attr("pointer-events", "none");
  }
  if (state.route) {
    for (const code of state.route) {
      const point =
        ev?.id === 0 && code === "ESP" ? projection([-16, 28]) : centers[code];
      if (point)
        g.append("text")
          .datum(point)
          .attr("class", "endpoint-label")
          .attr("x", 6)
          .attr("y", -6)
          .text(
            ev?.id === 0 && code === "ESP"
              ? "Canary Islands (Spain)"
              : name(code),
          );
    }
  }
  $("#coverage").textContent =
    dataStatus === "loading"
      ? "Loading migration estimates…"
      : dataStatus === "error"
        ? "Migration estimates could not be loaded"
        : state.year < 1960
          ? "Historical stories · comparable figures unavailable"
          : mapLimit === Infinity
            ? `Showing all ${shown.length} positive estimates · ${all.length} covered destinations${countries[state.country]?.europe ? "" : " · Europe only"}`
            : `Showing ${Math.min(30, all.filter((r) => r[2] > 0).length)} largest of ${all.length.toLocaleString()} available corridors${shown.length > 30 ? " + selected route" : ""}`;
  $("#route-count").textContent = `${all.length.toLocaleString()} available`;
  $("#route-list").replaceChildren();
  all.slice(0, state.limit).forEach((r) => {
    const b = document.createElement("button");
    b.className = "route-card";
    const label = document.createElement("strong");
    label.textContent = `${name(r[0])} → ${name(r[1])}`;
    const value = document.createElement("span");
    value.textContent = fmt(r[2]);
    b.append(label, value);
    b.onclick = () => openRouteDetails(r[0], r[1]);
    $("#route-list").append(b);
  });
  if (!all.length)
    $("#route-list").textContent =
      dataStatus === "loading"
        ? "Loading this period…"
        : dataStatus === "error"
          ? "Data unavailable. Choose this period again to retry."
          : state.year < 1960
            ? "Explore historical stories above. Comparable bilateral estimates begin in 1960."
            : "No corridors match these filters.";
  $("#more").hidden = state.limit >= all.length;
  renderEvents();
  detail();
  updateMapSizing();
  refreshRouteView?.();
}
function selectRoute(r) {
  state.route = [r[0], r[1]];
  state.event = null;
  draw();
}
let routeViewId = 0;
let routeReturnFocus = null;
let refreshRouteView = null;
const fullEstimate = (value) =>
  value === undefined
    ? "No comparable data"
    : value === 0
      ? "Estimated zero"
      : "≈ " +
        new Intl.NumberFormat("en", { maximumSignificantDigits: 3 }).format(
          value,
        );
function pairError(origin, destination) {
  if (destination === "everywhere")
    return countries?.[origin] ? "" : "Choose an origin country.";
  if (!countries?.[origin] || !countries?.[destination])
    return "Choose both an origin and a destination.";
  if (origin === destination)
    return "Choose two different countries for international migration.";
  if (!countries[origin].europe && !countries[destination].europe)
    return "Stage 1 covers routes to, from, or within Europe. Choose at least one European country.";
  return "";
}
function syncPairPicker() {
  const everywhere = $("#pair-destination").value === "everywhere";
  const origin = $("#pair-origin").value;
  $("#pair-swap").disabled = everywhere;
  $("#pair-open").textContent = everywhere
    ? "Show all destinations ↗"
    : "View migration details ↗";
  $("#pair-coverage").hidden = !everywhere;
  $("#pair-coverage").textContent = countries?.[origin]?.europe
    ? "All destinations covered by the migration dataset."
    : "Stage 1 coverage: origins outside Europe show European destinations only.";
}
$("#pair-origin").onchange = $("#pair-destination").onchange = () => {
  $("#pair-error").hidden = true;
  syncPairPicker();
};
$("#show-all-routes").onchange = () => draw();
function showEverywhere(origin) {
  if (!countries?.[origin]) return;
  if (timer) $("#play").click();
  if ($("#route-dialog").open) closeRouteDetails();
  state.country = origin;
  state.dir = "out";
  state.everywhere = true;
  state.route = null;
  state.event = null;
  state.query = "";
  state.limit = 30;
  $("#country").value = origin;
  $("#search").value = "";
  $("#pair-origin").value = origin;
  $("#pair-destination").value = "everywhere";
  $("#pair-error").hidden = true;
  $("#show-all-routes").checked = true;
  syncPairPicker();
  syncDirection();
  draw();
}
function closeRouteDetails() {
  routeViewId++;
  refreshRouteView = null;
  $("#route-dialog").close();
}
$("#route-close").onclick = closeRouteDetails;
$("#route-dialog").addEventListener("cancel", () => routeViewId++);
$("#route-dialog").addEventListener("close", () => {
  // A queued close event must not invalidate a route opened again immediately.
  if ($("#route-dialog").open) return;
  routeViewId++;
  const parentDialog = routeReturnFocus?.closest("dialog");
  const target =
    routeReturnFocus?.isConnected &&
    !routeReturnFocus.closest("[hidden]") &&
    (!parentDialog || parentDialog.open)
      ? routeReturnFocus
      : $("#pair-open");
  target?.focus({ preventScroll: true });
});
$("#route-dialog").addEventListener("click", (event) => {
  if (event.target !== $("#route-dialog")) return;
  const box = event.target.getBoundingClientRect();
  if (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  )
    closeRouteDetails();
});
$("#pair-form").onsubmit = (event) => {
  event.preventDefault();
  const origin = $("#pair-origin").value,
    destination = $("#pair-destination").value;
  const error = pairError(origin, destination);
  $("#pair-error").hidden = !error;
  $("#pair-error").textContent = error;
  if (!error) openRouteDetails(origin, destination);
};
$("#pair-swap").onclick = () => {
  if ($("#pair-destination").value === "everywhere") return;
  const origin = $("#pair-origin").value;
  $("#pair-origin").value = $("#pair-destination").value;
  $("#pair-destination").value = origin;
  $("#pair-error").hidden = true;
  syncPairPicker();
};
async function openRouteDetails(origin, destination) {
  if (pairError(origin, destination)) return;
  if (destination === "everywhere") {
    showEverywhere(origin);
    return;
  }
  const id = ++routeViewId;
  if (!$("#route-dialog").open) routeReturnFocus = document.activeElement;
  if (timer) $("#play").click();
  state.country = origin;
  state.dir = "out";
  state.everywhere = false;
  state.query = "";
  state.limit = 30;
  $("#country").value = origin;
  $("#search").value = "";
  $("#pair-origin").value = origin;
  $("#pair-destination").value = destination;
  $("#pair-error").hidden = true;
  syncPairPicker();
  syncDirection();
  selectRoute([origin, destination]);
  $("#route-content").innerHTML =
    `<span class="eyebrow">COUNTRY-TO-COUNTRY MIGRATION</span><h2 id="route-view-title">${name(origin)} → ${name(destination)}</h2><div class="route-view-controls"><label for="route-period">Five-year shortcuts<select id="route-period"></select></label><button id="route-reverse" type="button">Explore ${name(destination)} → ${name(origin)} ⇄</button></div><div class="route-stats" aria-live="polite"><section><span>${name(origin)} → ${name(destination)}</span><strong id="route-forward-count">Loading…</strong><small class="route-stat-period"></small></section><section><span>${name(destination)} → ${name(origin)}</span><strong id="route-reverse-count">Loading…</strong><small class="route-stat-period"></small></section></div><p class="route-explanation">Estimated migration counts across the selected calendar years (both years included), including possible repeat migrants. These are modelled movements between countries, not the number of people of a particular nationality living abroad.</p><h3>Migration over time</h3><p class="small">Choose a period to update the figures and the map. Figures before 1960 are unavailable.</p><div id="route-history" role="status">Loading the historical estimates…</div><div id="route-context"></div><div class="route-method"><h3>How to read these figures</h3><p>FLOW v1.0 combines annual female and male estimates across every calendar year in your selected range. It is designed for broad patterns; individual-route estimates can differ from official records. Estimated zero does not establish that nobody moved. These data do not identify individual people or prove why they migrated.</p><a class="source" href="https://data.humdata.org/dataset/annual-migration-flow-estimates-by-sex-between-all-countries-since-1960" target="_blank" rel="noopener">FLOW dataset ↗</a> · <a class="source" href="https://www.nature.com/articles/s41597-026-07983-w" target="_blank" rel="noopener">Methodology ↗</a></div>`;
  const periods = Array.from({ length: 15 }, (_, i) => 1950 + i * 5);
  const allDestinations = document.createElement("button");
  allDestinations.id = "route-all-destinations";
  allDestinations.type = "button";
  allDestinations.className = "all-destinations-link";
  allDestinations.textContent = `← All destinations from ${name(origin)}`;
  allDestinations.onclick = () => showEverywhere(origin);
  $("#route-view-title").before(allDestinations);
  const provenance = document.createElement("p");
  provenance.className = "route-provenance";
  provenance.innerHTML = `<strong>Modelled estimates · FLOW v1.0</strong><br>Statistical estimates, not observed migration counts. Source countries: <span id="route-source-codes">${origin} → ${destination}</span>.<br><a href="https://data.humdata.org/dataset/annual-migration-flow-estimates-by-sex-between-all-countries-since-1960" target="_blank" rel="noopener">View dataset ↗</a> · <a href="https://www.nature.com/articles/s41597-026-07983-w" target="_blank" rel="noopener">Beyer et al. (2026) · methodology ↗</a>`;
  $(".route-stats").after(provenance);
  periods.forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = period(year);
    $("#route-period").append(option);
  });
  $("#route-period").value = state.year;
  $("#route-reverse").onclick = () => openRouteDetails(destination, origin);
  const rangeForm = $("#range-form").cloneNode(true);
  rangeForm.id = "route-range-form";
  for (const field of ["start", "end", "error"]) {
    const el = rangeForm.querySelector(`#range-${field}`);
    el.id = `route-range-${field}`;
    rangeForm
      .querySelector(`label[for="range-${field}"]`)
      ?.setAttribute("for", el.id);
  }
  rangeForm.querySelector(".range-start").value = Math.max(1960, state.year);
  rangeForm.querySelector(".range-end").value = Math.max(1960, state.endYear);
  rangeForm.querySelector(".range-error").hidden = true;
  $(".route-view-controls").before(rangeForm);
  bindRangeForm(rangeForm);
  function updateFigures() {
    if (id !== routeViewId || !$("#route-dialog").open) return;
    const display = (a, b) =>
      dataStatus === "loading"
        ? "Loading…"
        : dataStatus === "error"
          ? "Could not load"
          : fullEstimate(rows.find((r) => r[0] === a && r[1] === b)?.[2]);
    $("#route-forward-count").textContent = display(origin, destination);
    $("#route-reverse-count").textContent = display(destination, origin);
    document
      .querySelectorAll(".route-stat-period")
      .forEach((el) => (el.textContent = rangeLabel()));
    $("#route-period option[value='custom']")?.remove();
    if (state.customRange) {
      const option = document.createElement("option");
      option.value = "custom";
      option.textContent = `Custom: ${rangeLabel()}`;
      $("#route-period").append(option);
    }
    $("#route-period").value = state.customRange ? "custom" : state.year;
    document.querySelectorAll(".history-period").forEach((button) => {
      const current =
        +button.dataset.year === state.year && state.endYear === state.year + 4;
      button.setAttribute("aria-pressed", String(current));
      button.closest("tr").classList.toggle("current-period", current);
    });
    renderRouteContext($("#route-context"), origin, destination);
  }
  refreshRouteView = updateFigures;
  const choosePeriod = (year) => setYear(year);
  $("#route-period").onchange = (event) => {
    if (event.target.value !== "custom") choosePeriod(+event.target.value);
  };
  if (!$("#route-dialog").open) $("#route-dialog").showModal();
  $("#route-close").focus({ preventScroll: true });
  updateFigures();
  const history = await Promise.all(
    periods.map(async (year) => {
      try {
        const data = await load(year);
        return {
          year,
          forward: data.find(
            (row) => row[0] === origin && row[1] === destination,
          )?.[2],
          reverse: data.find(
            (row) => row[0] === destination && row[1] === origin,
          )?.[2],
        };
      } catch {
        return { year, error: true };
      }
    }),
  );
  if (id !== routeViewId || !$("#route-dialog").open) return;
  const max = Math.max(
    1,
    ...history.flatMap((item) => [item.forward || 0, item.reverse || 0]),
  );
  const table = document.createElement("table");
  table.className = "route-history-table";
  table.innerHTML = `<caption>Five-year modelled migration counts · both directions</caption><thead><tr><th scope="col">Period</th><th scope="col">${name(origin)} → ${name(destination)}</th><th scope="col">${name(destination)} → ${name(origin)}</th></tr></thead><tbody></tbody>`;
  history.forEach((item) => {
    const tr = document.createElement("tr");
    const heading = document.createElement("th");
    heading.scope = "row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-period";
    button.dataset.year = item.year;
    button.textContent = period(item.year);
    button.onclick = () => choosePeriod(item.year);
    heading.append(button);
    tr.append(heading);
    for (const field of ["forward", "reverse"]) {
      const td = document.createElement("td");
      td.textContent = item.error
        ? "Could not load"
        : fullEstimate(item[field]);
      if (item[field] !== undefined && item[field] > 0) {
        const bar = document.createElement("span");
        bar.className = "history-bar " + field;
        bar.style.width = Math.max(1, (item[field] / max) * 100) + "%";
        bar.setAttribute("aria-hidden", "true");
        td.append(bar);
      }
      tr.append(td);
    }
    table.querySelector("tbody").append(tr);
  });
  $("#route-history").removeAttribute("role");
  $("#route-history").replaceChildren(table);
  if (history.some((item) => item.error)) {
    const retry = document.createElement("button");
    retry.textContent = "Retry unavailable periods";
    retry.onclick = () => openRouteDetails(origin, destination);
    $("#route-history").append(retry);
  }
  updateFigures();
}
function renderRouteContext(container, origin, destination) {
  container.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = `Historical drivers · ${rangeLabel()}`;
  const note = document.createElement("p");
  note.className = "route-explanation";
  note.textContent =
    "Sourced events that overlap your selected years. These explain historical circumstances; the model does not attribute a number of migrations to each cause.";
  container.append(heading, note);
  const related = events.filter(
    (event) =>
      event.origin === origin &&
      event.destination === destination &&
      event.start <= state.endYear &&
      event.end >= state.year,
  );
  if (!related.length) {
    const empty = document.createElement("p");
    empty.className = "route-explanation";
    empty.textContent = `No route-specific historical account has been added for ${name(origin)} → ${name(destination)} in ${rangeLabel()}. The estimates alone cannot explain the reasons for this migration.`;
    container.append(empty);
  }
  for (const event of related) {
    const article = document.createElement("article");
    article.className = "route-context-card";
    article.innerHTML = `<span class="eyebrow">${rangeLabel(event.start, event.end)}</span><h4>${event.title}</h4><p>${event.text}</p><a class="source" href="${event.source}" target="_blank" rel="noopener">Historical source ↗</a>${event.additionalSource ? `<br><a class="source" href="${event.additionalSource}" target="_blank" rel="noopener">Further historical context ↗</a>` : ""}`;
    container.append(article);
  }
}
function selectEvent(e) {
  state.everywhere = false;
  state.event = e.id;
  state.route = [e.origin, e.destination];
  state.country = "";
  state.dir = "both";
  state.query = "";
  state.limit = 30;
  $("#search").value = "";
  $("#country").value = "";
  syncDirection();
  setYear(Math.max(1950, Math.floor(e.start / 5) * 5));
}
function renderEvents() {
  const selected = events.filter(
    (e) =>
      e.start <= state.endYear &&
      e.end >= state.year &&
      (!state.country ||
        (state.dir === "out"
          ? e.origin === state.country
          : state.dir === "in"
            ? e.destination === state.country
            : [e.origin, e.destination].includes(state.country))) &&
      (!state.route ||
        (e.origin === state.route[0] && e.destination === state.route[1])),
  );
  $("#event-count").textContent = selected.length;
  $("#events").replaceChildren();
  $("#event-ticks").replaceChildren();
  selected.forEach((e) => {
    const b = document.createElement("button");
    b.className = "event-btn";
    b.innerHTML = `<span>${e.start}${e.end !== e.start ? "–" + e.end : ""} · ${e.route}</span>${e.title} ↗`;
    b.onclick = () => {
      state.event = e.id;
      draw();
    };
    $("#events").append(b);
    const t = document.createElement("button");
    t.textContent = `${e.start} · ${e.title}`;
    t.onclick = b.onclick;
    $("#event-ticks").append(t);
  });
  if (!selected.length)
    $("#events").textContent = "No curated events for this selection.";
}
function detail() {
  const requestId = ++detailId;
  const e = events[state.event];
  if (e) {
    $("#detail").innerHTML =
      `<span class="story-tag">HISTORICAL CONTEXT · ${e.start}</span><h2 class="story-title">${e.title}</h2><div class="story-route">${e.route}</div><p class="story-text">${e.text}</p><a class="source" href="${e.source}" target="_blank" rel="noopener">Read the historical source ↗</a>${e.additionalSource ? `<br><a class="source" href="${e.additionalSource}" target="_blank" rel="noopener">Further historical context ↗</a>` : ""}<p class="small">Dashed line shows this story’s connection; its width does not encode a count.</p>`;
    if (state.country || state.route) {
      const back = document.createElement("button");
      back.className = "all-destinations-link";
      back.textContent = "← Back to migration figures";
      back.onclick = () => {
        state.event = null;
        draw();
      };
      $("#detail").append(back);
    }
    return;
  }
  if (state.route) {
    const [a, b] = state.route,
      r = rows.find((r) => r[0] === a && r[1] === b);
    $("#detail").innerHTML =
      `<span class="story-tag">MODELLED MIGRATION</span><h2 class="story-title">${name(a)}<br>→ ${name(b)}</h2><div class="big-value">${dataStatus === "loading" ? "Loading…" : dataStatus === "error" ? "Data unavailable" : fmt(r?.[2])}</div><div class="small">${rangeLabel()} · estimated migrations<br>Approximate counts, not unique people across years.</div><div class="spark" aria-label="Migration trend across five-year periods"></div><div class="small trend-key">1960–64 → 2020–24 · hatched bars = unavailable</div><a class="source" href="https://data.humdata.org/dataset/annual-migration-flow-estimates-by-sex-between-all-countries-since-1960" target="_blank" rel="noopener">FLOW v1.0 · source ↗</a><p class="small">This model is least suitable for precise individual-route analysis. Official records should be preferred when available. Estimated zero does not prove no migration occurred. Modern boundaries provide geographic reference; arrows do not trace actual journeys.</p>`;
    const more = document.createElement("button");
    more.className = "sidebar-route-details";
    more.textContent = "View migration details ↗";
    more.onclick = () => openRouteDetails(a, b);
    $("#detail").append(more);
    if (state.everywhere) {
      const back = document.createElement("button");
      back.className = "all-destinations-link";
      back.textContent = "← All destinations";
      back.onclick = () => {
        state.route = null;
        draw();
      };
      $("#detail").append(back);
    }
    const key = a + b;
    Promise.all(
      Array.from({ length: 13 }, (_, i) => 1960 + i * 5).map(async (y) => {
        try {
          const data = await load(y);
          return [y, data.find((x) => x[0] === a && x[1] === b)?.[2]];
        } catch {
          return [y, undefined];
        }
      }),
    ).then((values) => {
      if (
        requestId !== detailId ||
        state.route?.join("") !== key ||
        state.event !== null
      )
        return;
      const box = $(".spark");
      if (!box) return;
      const max = Math.max(1, ...values.map((x) => x[1] || 0));
      values.forEach(([y, v]) => {
        const b = document.createElement("button");
        b.style.height =
          (v === undefined ? 3 : Math.max(3, (65 * v) / max)) + "px";
        b.title = `${period(y)}: ${fmt(v)}`;
        b.setAttribute("aria-label", b.title);
        b.classList.toggle("unavailable", v === undefined);
        b.classList.toggle("current", y === state.year);
        b.onclick = () => setYear(y);
        box.append(b);
      });
    });
    return;
  }
  if (state.country) {
    const incoming = state.dir === "in";
    const both = state.dir === "both";
    const outgoing = rows
      .filter((r) =>
        both
          ? r[0] === state.country || r[1] === state.country
          : r[incoming ? 1 : 0] === state.country,
      )
      .sort((a, b) => b[2] - a[2]);
    const positive = outgoing.filter((r) => r[2] > 0);
    const total = outgoing.length
      ? outgoing.reduce((sum, r) => sum + Math.round(r[2] * 10), 0) / 10
      : undefined;
    const value =
      dataStatus === "loading"
        ? "Loading…"
        : dataStatus === "error"
          ? "Could not load"
          : fullEstimate(total);
    $("#detail").innerHTML =
      `<span class="story-tag">${incoming ? "IMMIGRATION" : both ? "INCOMING + OUTGOING" : "EMIGRATION"}</span><h2 class="story-title">${state.everywhere ? `${name(state.country)}<br>→ Everywhere` : incoming ? `Into ${name(state.country)}` : both ? name(state.country) : `From ${name(state.country)}`}</h2><div id="${incoming ? "incoming-total" : both ? "country-total" : "outgoing-total"}" class="big-value" aria-live="polite">${value}</div><div class="small">${rangeLabel()} · estimated migrations<br>Total across all covered ${incoming ? "origins" : both ? "connections · both directions" : "destinations"}.</div><p id="outgoing-scope" class="story-text">${countries[state.country].europe ? `Worldwide ${incoming ? "origins" : both ? "connections" : "destinations"} covered by the dataset.` : (incoming ? "European origins only. " : both ? "European connections only. " : "European destinations only. ") + "Stage 1 covers migration to, from and within Europe; this is not a worldwide total."}</p><p class="small">${outgoing.length ? `${outgoing.length} ${incoming ? "origins" : both ? "connections" : "destinations"} with estimates · ${positive.length} positive estimates.` : ""}${state.query ? ` Search filters the map and route list; the total includes all covered ${incoming ? "origins" : both ? "connections" : "destinations"}.` : ""}</p><h3 class="destinations-title">Largest ${incoming ? "origins" : both ? "connections" : "destinations"}</h3><div id="top-destinations"></div><a class="source" href="#route-list">Explore the full connection list ↓</a><p class="small">Modelled movements across the selected calendar years, including possible repeat migrants. Individual-route estimates can differ from official records.</p><a class="source" href="https://data.humdata.org/dataset/annual-migration-flow-estimates-by-sex-between-all-countries-since-1960" target="_blank" rel="noopener">FLOW v1.0 · source ↗</a>`;
    positive.slice(0, 5).forEach(([origin, destination, count]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "destination-card";
      button.dataset.destination = destination;
      const label = document.createElement("span");
      label.textContent =
        (incoming
          ? name(origin)
          : both
            ? `${name(origin)} → ${name(destination)}`
            : name(destination)) + " ↗";
      const number = document.createElement("strong");
      number.textContent = fullEstimate(count);
      button.append(label, number);
      button.onclick = () => openRouteDetails(origin, destination);
      $("#top-destinations").append(button);
    });
    if (!positive.length)
      $("#top-destinations").textContent =
        dataStatus === "loading"
          ? "Loading destinations…"
          : dataStatus === "error"
            ? "Destinations could not be loaded."
            : state.year < 1960
              ? "Comparable estimates begin in 1960."
              : countries[state.country].hasData === false
                ? "This country or territory has no estimates in FLOW v1.0."
                : "No positive estimates in this period.";
    return;
  }
  $("#detail").innerHTML =
    '<span class="story-tag">EXPLORE THE ATLAS</span><h2 class="story-title">Every connection<br>has a story.</h2><p class="story-text">Choose a country, follow an arrow, or travel through the timeline to explore migration and its historical context.</p><p class="small">The overview shows the largest available connections. Search the complete corridor list below to find a particular route.</p>';
}
async function load(y) {
  if (y < 1960) return [];
  return (cache[y] ??= fetch(`data/${y}.json`)
    .then((r) => {
      if (!r.ok) throw Error("Migration data unavailable");
      return r.json();
    })
    .catch((e) => {
      delete cache[y];
      throw e;
    }));
}
const annualCache = {};
async function loadAnnual(year) {
  return (annualCache[year] ??= fetch(`data/annual/${year}.json`)
    .then((response) => {
      if (!response.ok) throw Error("Annual migration data unavailable");
      return response.json();
    })
    .catch((error) => {
      delete annualCache[year];
      throw error;
    }));
}
async function loadRange(start, end) {
  if (end < 1960) return [];
  if (start < 1960) throw Error("A complete total is unavailable before 1960.");
  const chunks = [];
  for (let year = start; year <= end;) {
    if (year % 5 === 0 && year + 4 <= end) {
      chunks.push(load(year));
      year += 5;
    } else {
      chunks.push(loadAnnual(year));
      year++;
    }
  }
  const parts = await Promise.all(chunks);
  const sums = new Map();
  for (const data of parts) {
    const seen = new Set();
    for (const [a, b, value] of data) {
      const key = a + ":" + b;
      if (seen.has(key) || !Number.isFinite(value) || value < 0)
        throw Error("Invalid migration data");
      seen.add(key);
      const sum = sums.get(key) || { a, b, tenths: 0, count: 0 };
      sum.tenths += Math.round(value * 10);
      sum.count++;
      sums.set(key, sum);
    }
  }
  // Incomplete corridors must not become undercounts or estimated zeros.
  if ([...sums.values()].some((sum) => sum.count !== parts.length))
    throw Error("Incomplete migration coverage");
  return [...sums.values()].map(({ a, b, tenths }) => [a, b, tenths / 10]);
}
function validateRange(start, end) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1960 ||
    end > 2024 ||
    start > 2024 ||
    end < 1960
  )
    return "Choose whole calendar years from 1960 to 2024. Earlier years have historical context only.";
  return start > end
    ? "The start year must be no later than the end year."
    : "";
}
function bindRangeForm(form) {
  form.onsubmit = (event) => {
    event.preventDefault();
    const start = Number(form.querySelector(".range-start").value);
    const end = Number(form.querySelector(".range-end").value);
    const error = validateRange(start, end);
    const message = form.querySelector(".range-error");
    message.hidden = !error;
    message.textContent = error;
    if (!error) setRange(start, end);
  };
}
bindRangeForm($("#range-form"));
function setYear(year) {
  return setRange(year, year + 4, false);
}
async function setRange(start, end, custom = true) {
  if (custom && validateRange(start, end)) return;
  if (custom && timer) $("#play").click();
  state.year = start;
  state.endYear = end;
  state.customRange = custom;
  if (
    events?.[state.event] &&
    (events[state.event].start > end || events[state.event].end < start)
  )
    state.event = null;
  $("#year").value = Math.min(2020, Math.floor(start / 5) * 5);
  $("#year").setAttribute("aria-valuetext", rangeLabel());
  $("#period").textContent = $("#time-title").textContent = rangeLabel();
  document
    .querySelectorAll(".range-start")
    .forEach((el) => (el.value = Math.max(1960, start)));
  document
    .querySelectorAll(".range-end")
    .forEach((el) => (el.value = Math.max(1960, end)));
  document.querySelectorAll(".range-error").forEach((el) => (el.hidden = true));
  const id = ++loadId;
  rows = [];
  dataStatus = "loading";
  $("#map").setAttribute("aria-busy", "true");
  $("#map-status").textContent = "Loading…";
  draw();
  try {
    const r = custom ? await loadRange(start, end) : await load(start);
    if (id !== loadId) return;
    rows = r;
    dataStatus = "ready";
    $("#map").setAttribute("aria-busy", "false");
    $("#map-status").textContent =
      start < 1960
        ? "Historical context only · no comparable migration counts"
        : "";
    draw();
  } catch {
    if (id !== loadId) return;
    dataStatus = "error";
    $("#map").setAttribute("aria-busy", "false");
    $("#map-status").textContent =
      "Could not load the complete range. Apply it again to retry; no partial total is shown.";
    rows = [];
    draw();
  }
}

function syncDirection() {
  document.querySelectorAll("[data-dir]").forEach((b) => {
    b.classList.toggle("active", b.dataset.dir === state.dir);
    b.setAttribute("aria-pressed", b.dataset.dir === state.dir);
  });
}
function modal(html) {
  $("#modal-content").innerHTML = html;
  $("#modal").showModal();
}
const methodology = () =>
  modal(
    '<div class="eyebrow">METHODOLOGY & SOURCES</div><h2>Reading the atlas</h2><p>FLOW v1.0 supplies annual modelled bilateral migration estimates for 1960–2024. Female and male estimates are summed across every calendar year in the selected range, including both endpoints. Five-year quick steps remain available. These are estimates of migration, not border crossings or unique individuals across years. No quantitative estimates are supplied for 1950–1959.</p><p>Beyer, Schewe, Abel, Warner and Campo (2026) provide this model for broad patterns. Their usage notes describe individual migration corridors as one of its least suitable uses; official or statistically harmonised records should be preferred when available. Estimated zero does not establish that no migration occurred. Missing observations are never converted to zero.</p><p>Europe follows UN M49, including Russia and the UK. A route appears when at least one endpoint is European. Türkiye and Cyprus are outside this regional definition; their connections with European countries are included. Modern boundaries provide geographic reference throughout. Historical state changes are not reconstructed or allocated by this app.</p><p>Overview arrows show the 30 largest positive estimates for your filters. Choosing Everywhere shows all positive outgoing estimates by default; you can switch back to the largest 30. The total includes every covered destination, including estimated zeros, regardless of search text or the arrow limit. For origins outside Europe, only European destinations are covered, so this is not a worldwide total. The list includes all available estimates, including estimated zeros. Line width uses one square-root scale across periods, capped at 2.4 screen pixels. Arrowheads remain 7 screen pixels across zoom levels; line width and arrowhead size never grow with zoom. Incoming/outgoing filters refer to the selected country, or to European endpoints when no country is selected; intra-European connections can appear in both. Country label points mark schematic connections, not physical travel routes. Small countries omitted from the simplified boundaries are shown as points. Dashed story connections are unweighted and excluded from estimates. Canary Islands stories are regional context within Spain.</p><p>Historical events have individual source links. Event ranges identify featured periods, not necessarily the beginning or end of a migration wave. Residence permits, asylum applications, refugee registrations and population stocks must retain their own meanings; they are not added to map totals. Historical associations do not establish causation from model changes.</p><p><a href="https://data.humdata.org/dataset/annual-migration-flow-estimates-by-sex-between-all-countries-since-1960" target="_blank" rel="noopener">FLOW v1.0 · HDX · CC BY</a><br><a href="https://www.nature.com/articles/s41597-026-07983-w" target="_blank" rel="noopener">Research paper and usage limitations</a><br><a href="https://osf.io/download/p58ay/" target="_blank" rel="noopener">Archived source CSV</a><br><a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth · public-domain boundaries</a><br>D3 v7 · ISC license. Data snapshot: November 2026.</p>',
  );
$("#about").onclick = $("#method-open").onclick = methodology;
$("#close-modal").onclick = () => $("#modal").close();
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
});
$("#all-events").onclick = () => {
  modal(
    '<div class="eyebrow">1950 — 2024</div><h2>History behind the movement</h2><div id="catalog"></div>',
  );
  events.forEach((e) => {
    const b = document.createElement("button");
    b.className = "event-btn";
    b.textContent = `${e.start} · ${e.route} — ${e.title}`;
    b.onclick = () => {
      $("#modal").close();
      selectEvent(e);
      $(".workspace").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    };
    $("#catalog").append(b);
  });
};
$("#country").onchange = (e) => {
  state.everywhere = false;
  state.country = e.target.value;
  state.event = null;
  state.route = null;
  state.limit = 30;
  draw();
};
document.querySelectorAll("[data-dir]").forEach(
  (b) =>
    (b.onclick = () => {
      state.everywhere = false;
      state.dir = b.dataset.dir;
      state.route = null;
      state.event = null;
      state.limit = 30;
      syncDirection();
      draw();
    }),
);
$("#search").oninput = (e) => {
  state.query = e.target.value.trim().toLowerCase();
  state.route = null;
  state.event = null;
  state.limit = 30;
  draw();
};
$("#more").onclick = () => {
  state.limit += 60;
  draw();
};
$("#year").oninput = (e) => setYear(+e.target.value);
$("#prev").onclick = () =>
  setYear(Math.max(1950, Math.floor(state.year / 5) * 5 - 5));
$("#next").onclick = () =>
  setYear(Math.min(2020, Math.floor(state.year / 5) * 5 + 5));
$("#play").onclick = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    $("#play").textContent = "▶";
    $("#play").setAttribute("aria-label", "Play timeline");
  } else {
    if (state.customRange)
      setYear(Math.min(2020, Math.floor(state.year / 5) * 5));
    if (state.year >= 2020) setYear(1950);
    timer = setInterval(() => {
      if (state.year === 2020) {
        clearInterval(timer);
        timer = null;
        $("#play").textContent = "▶";
        $("#play").setAttribute("aria-label", "Play timeline");
        return;
      }
      setYear(state.year + 5);
    }, 2500);
    $("#play").textContent = "Ⅱ";
    $("#play").setAttribute("aria-label", "Pause timeline");
  }
};
$("#zin").onclick = () => svg.call(zoom.scaleBy, 1.5);
$("#zout").onclick = () => svg.call(zoom.scaleBy, 1 / 1.5);
$("#reset").onclick = () => svg.call(zoom.transform, d3.zoomIdentity);
Promise.all(
  ["countries", "world", "events"].map((f) =>
    fetch(`data/${f}.json`).then((r) => {
      if (!r.ok) throw Error(f);
      return r.json();
    }),
  ),
)
  .then(([c, w, e]) => {
    countries = c;
    world = w;
    events = e;
    Object.values(countries)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((c) => {
        const o = document.createElement("option");
        o.value = c.code;
        o.textContent = c.name + (c.hasData === false ? " (no estimates)" : "");
        $("#country").append(o);
        $("#pair-origin").append(o.cloneNode(true));
        $("#pair-destination").append(o.cloneNode(true));
      });
    $("#pair-origin").value = "ITA";
    $("#pair-destination").value = "POL";
    Object.values(countries).forEach(
      (c) => (centers[c.code] = projection(c.coordinates)),
    );
    g.append("path")
      .datum(d3.geoGraticule10())
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#dce4d7")
      .attr("stroke-width", 0.5);
    g.selectAll(".country")
      .data(world.features)
      .join("path")
      .attr("class", (d) => "country" + (d.properties.europe ? " europe" : ""))
      .attr("d", path)
      .on("click", (ev, d) => {
        $("#country").value = d.properties.code;
        $("#country").dispatchEvent(new Event("change"));
      })
      .append("title")
      .text((d) => d.properties.name);
    g.append("circle")
      .attr("class", "canary-point")
      .attr("cx", projection([-16, 28])[0])
      .attr("cy", projection([-16, 28])[1])
      .attr("r", 3)
      .attr("fill", "#c16a46")
      .append("title")
      .text("Canary Islands · Spain");
    const polygonCodes = new Set(world.features.map((f) => f.properties.code));
    g.append("g")
      .selectAll("circle")
      .data(Object.values(countries).filter((c) => !polygonCodes.has(c.code)))
      .join("circle")
      .attr("class", "country-point")
      .attr("cx", (c) => centers[c.code][0])
      .attr("cy", (c) => centers[c.code][1])
      .attr("r", 2)
      .attr("fill", "#6c8873")
      .on("click", (event, c) => {
        $("#country").value = c.code;
        $("#country").dispatchEvent(new Event("change"));
      })
      .append("title")
      .text((c) => c.name);
    dataControls.forEach((control) => (control.disabled = false));
    syncPairPicker();
    syncDirection();
    setYear(2020);
  })
  .catch(() => {
    $("#map-status").textContent =
      "Map assets could not be loaded. Please reload the page.";
  });

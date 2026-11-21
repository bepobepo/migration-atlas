/* Selected gross migration playback. Annual numeric states; fill-only transitions. */
const movement = {
  view: "color",
  metric: "volume",
  focus: "",
  direction: "out",
  peers: null,
  cursor: 0,
  start: 2020,
  end: 2024,
  series: null,
  population: null,
  clock: null,
  token: 0,
  speed: 1,
  maximum: 0,
};
const panel = document.createElement("section");
panel.className = "movement-panel";
panel.innerHTML = `<div class="movement-switches"><label>Map view<select id="movement-view"><option value="color">Color movement</option><option value="arrows">Arrows</option></select></label><label>Color scale<select id="movement-metric"><option value="volume">Migration volume</option><option value="population">Share of population</option></select></label></div><div class="movement-pickers"><label>Focus country<select id="movement-focus"><option value="">Choose a country</option></select></label><label>Direction<select id="movement-direction"><option value="out">Outgoing — to destinations</option><option value="in">Incoming — from origins</option><option value="both">All movement — combined</option></select></label></div><details><summary>Choose origins / destinations</summary><label><input id="movement-all" type="checkbox" checked> Everywhere</label><input id="movement-search" type="search" placeholder="Find a country…" aria-label="Search counterpart countries"><div id="movement-peers"></div></details><div id="movement-status" role="status">Choose a focal country to explore color movement.</div><div class="movement-transport"><button id="movement-play">Play ▶</button><button id="movement-restart">Restart ↺</button><label>Speed<select id="movement-speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div><input id="movement-cursor" type="range" min="0" max="5" value="0" aria-label="Playback year"><strong id="movement-year">Start</strong><p id="movement-count" aria-live="polite"></p><p id="movement-legend"></p><div id="movement-contributions"></div><p class="small">Gross migration flows, including repeat migration; official coverage is labelled below. Missing observations remain unavailable in Official statistics; model values require a comparison mode. Arrivals and departures do not establish overall population change. Population colors saturate at 10%; displayed percentages are uncapped. <a href="https://data.worldbank.org/indicator/SP.POP.TOTL" target="_blank" rel="noopener">Population source ↗</a></p>`;
$(".map-wrap").before(panel);
const colorTip = document.createElement("section");
colorTip.className = "movement-tip";
colorTip.hidden = true;
colorTip.setAttribute("role", "dialog");
colorTip.setAttribute("aria-label", "Country migration details");
$(".map-wrap").append(colorTip);
let movementInspection = null;
function closeMovementInspection() {
  movementInspection = null;
  colorTip.hidden = true;
  colorTip.replaceChildren();
}
colorTip.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeMovementInspection();
  }
});
function pauseMovement() {
  pauseWorldTimeline();
  const wasPlaying = movement.clock !== null;
  clearInterval(movement.clock);
  movement.clock = null;
  $("#movement-play").textContent = "Play ▶";
  g.selectAll(".migration-fill path").interrupt();
  if (wasPlaying) paintMovement();
}
function colorRatio(code, count) {
  const p = movement.population?.countries[code]?.[movement.start - 1960];
  return p > 0 ? (100 * count) / p : null;
}
function cumulative(peer) {
  return (
    movement.series?.peers[peer]
      ?.slice(movement.start - 1960, movement.start - 1960 + movement.cursor)
      .reduce((a, b) => a + (b ?? 0), 0) / 10 || 0
  );
}
function selectedPeers() {
  return movement.series
    ? Object.keys(movement.series.peers).filter(
        (c) => movement.peers === null || movement.peers.includes(c),
      )
    : [];
}
function finalCount(peer) {
  return (
    movement.series.peers[peer]
      .slice(movement.start - 1960, movement.end - 1959)
      .reduce((a, b) => a + (b ?? 0), 0) / 10
  );
}
function peerCorridors(peer) {
  return movement.direction === "both"
    ? [
        [movement.focus, peer],
        [peer, movement.focus],
      ]
    : [
        movement.direction === "in"
          ? [peer, movement.focus]
          : [movement.focus, peer],
      ];
}
function peerProvenance(peer, through = movement.start + movement.cursor - 1) {
  return summarizeProvenance(peerCorridors(peer), movement.start, through);
}
function migrationCoverageMissing(code, count) {
  if (
    dataPolicy !== "official" ||
    !(movement.cursor > 0) ||
    count > 0 ||
    code === movement.focus ||
    !movement.series?.peers[code] ||
    (movement.peers !== null && !movement.peers.includes(code))
  )
    return false;
  return peerProvenance(code).missing > 0;
}
function migrationOpacity(code, count) {
  if (!(count > 0) || code === movement.focus) return 0;
  const ratio =
    movement.metric === "population"
      ? colorRatio(code, count)
      : movement.maximum > 0
        ? count / movement.maximum
        : 0;
  if (ratio === null) return null;
  return Math.sqrt(
    Math.max(
      0,
      Math.min(1, movement.metric === "population" ? ratio / 10 : ratio),
    ),
  );
}
function migrationFill(code, count) {
  if (migrationCoverageMissing(code, count)) return "url(#migration-missing)";
  const intensity = migrationOpacity(code, count);
  if (intensity === null) return "url(#population-missing)";
  return count > 0 && code !== movement.focus
    ? d3.interpolateRgbBasis(["#93c5fd", "#2563eb", "#172554"])(intensity)
    : "#ffffff";
}
function movementCorridors() {
  return selectedPeers().flatMap((peer) =>
    movement.direction === "both"
      ? [
          [movement.focus, peer],
          [peer, movement.focus],
        ]
      : [
          movement.direction === "in"
            ? [peer, movement.focus]
            : [movement.focus, peer],
        ],
  );
}
function renderMovementArrows(counts) {
  const visible = movement.view === "arrows";
  const layer = g
    .selectAll("g.movement-arrows")
    .data(visible ? [0] : [])
    .join("g")
    .attr("class", "movement-arrows");
  if (!visible) return;
  const directionRows = [];
  for (const [peer, count] of counts) {
    if (
      !(count > 0) ||
      (state.query &&
        !`${name(movement.focus)} ${name(peer)}`
          .toLowerCase()
          .includes(state.query))
    )
      continue;
    if (movement.direction === "both") {
      for (const direction of ["out", "in"]) {
        const values = movement.directionSeries[direction].peers[peer];
        const value =
          values
            .slice(
              movement.start - 1960,
              movement.start - 1960 + movement.cursor,
            )
            .reduce((sum, v) => sum + (v ?? 0), 0) / 10;
        if (value > 0)
          directionRows.push(
            direction === "out"
              ? [movement.focus, peer, value]
              : [peer, movement.focus, value],
          );
      }
    } else
      directionRows.push(
        movement.direction === "in"
          ? [peer, movement.focus, count]
          : [movement.focus, peer, count],
      );
  }
  directionRows.sort((a, b) => b[2] - a[2]);
  const shown = directionRows.slice(
    0,
    $("#show-all-routes").checked ? Infinity : 30,
  );
  const marker = defs
    .selectAll("marker#movement-arrow")
    .data([0])
    .join("marker")
    .attr("id", "movement-arrow")
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 7)
    .attr("markerUnits", "userSpaceOnUse")
    .attr("markerWidth", 7 / mapScale())
    .attr("markerHeight", 7 / mapScale())
    .attr("orient", "auto");
  marker
    .selectAll("path")
    .data([0])
    .join("path")
    .attr("d", "M0,-3L7,0L0,3")
    .attr("fill", "#64748b");
  layer
    .selectAll("path.arc")
    .data(shown, (r) => r[0] + r[1])
    .join("path")
    .attr("class", "arc")
    .attr("d", (r) => curve(centers[r[0]], centers[r[1]]))
    .attr("stroke", "#64748b")
    .attr("stroke-width", (r) =>
      Math.min(2.4, Math.max(0.7, Math.sqrt(r[2] / 300000))),
    )
    .attr("vector-effect", "non-scaling-stroke")
    .attr("marker-end", "url(#movement-arrow)")
    .attr("aria-hidden", "true")
    .style("pointer-events", "none");
  layer
    .selectAll("path.arc-hit")
    .data(shown, (r) => r[0] + r[1])
    .join("path")
    .attr("class", "arc-hit")
    .attr("d", (r) => curve(centers[r[0]], centers[r[1]]))
    .attr("data-route", (r) => r[0] + "-" + r[1])
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr(
      "aria-label",
      (r) =>
        `${name(r[0])} to ${name(r[1])}: ${formatSourceValue(r[2], summarizeProvenance([r], movement.start, movement.start + movement.cursor - 1))} · ${summarizeProvenance([r], movement.start, movement.start + movement.cursor - 1).label}, through ${movement.start + movement.cursor - 1}`,
    )
    .on("click", (e, r) =>
      inspectMovement(r[0] === movement.focus ? r[1] : r[0], r),
    )
    .on("keydown", async (e, r) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        await inspectMovement(r[0] === movement.focus ? r[1] : r[0], r);
        colorTip.querySelector("button")?.focus();
      }
    });
  $("#coverage").textContent =
    `${shown.length} arrows · ${dataPolicy === "official" ? "reported official flows only; missing observations excluded" : "shading includes every selected positive flow"} · ${movement.start}–${movement.end}`;
}
function paintMovement(animate = false) {
  const active = !!movement.series;
  document.body.classList.toggle(
    "color-active",
    active && movement.view === "color",
  );
  document.body.classList.toggle("movement-active", active);
  g.selectAll(".flow-layer,.story-line").style(
    "display",
    active || movement.focus ? "none" : null,
  );
  g.selectAll(".country").style("fill", "#ffffff");
  g.selectAll(".country-point").style("fill", "#ffffff");
  $("#movement-cursor").disabled = !active;
  $("#movement-restart").disabled = !active;
  $("#movement-play").disabled =
    active && !movement.total && dataPolicy !== "official";
  if (!active) {
    closeMovementInspection();
    const residenceCard = document.querySelector("#official-residence-card");
    if (residenceCard) {
      residenceCard.hidden = true;
      delete residenceCard.dataset.key;
    }
    g.selectAll(".migration-fill,.movement-arrows").remove();
    $("#movement-year").textContent = "No active playback";
    $("#movement-count").textContent =
      "No complete total loaded for the current selection.";
    $("#movement-legend").textContent =
      "Apply a valid country and year range to compare migration.";
    $("#movement-cursor").value = 0;
    $("#movement-contributions").replaceChildren();
    if (movement.focus) {
      $("#route-list").replaceChildren();
      $("#route-count").textContent = "Waiting for the selected countries and years.";
      $("#more").hidden = true;
      $("#detail").textContent =
        "Migration figures will appear once the complete selected range is loaded.";
      $("#events").textContent =
        "Historical context will follow the applied selection.";
      $("#event-ticks").replaceChildren();
      $("#event-count").textContent = "";
    }
    return;
  }
  g.selectAll(".endpoint-label").remove();
  if (centers[movement.focus])
    g.append("text")
      .datum(centers[movement.focus])
      .attr("class", "endpoint-label movement-label")
      .attr("x", 6)
      .attr("y", -6)
      .attr(
        "transform",
        `translate(${centers[movement.focus]}) scale(${1 / mapScale()})`,
      )
      .text(name(movement.focus));
  const peers = selectedPeers();
  const total =
    peers.reduce((sum, p) => sum + Math.round(cumulative(p) * 10), 0) / 10;
  const counts = new Map(peers.map((p) => [p, cumulative(p)]));
  const layer = g
    .selectAll("g.migration-fill")
    .data([0])
    .join("g")
    .attr("class", "migration-fill")
    .attr("pointer-events", "none");
  const polygons = layer
    .selectAll("path")
    .data(
      world.features.filter(
        (f) =>
          counts.get(f.properties.code) > 0 ||
          migrationCoverageMissing(
            f.properties.code,
            counts.get(f.properties.code) || 0,
          ) ||
          f.properties.code === movement.focus,
      ),
      (f) => f.properties.code,
    )
    .join((enter) => enter.append("path").attr("fill", "#ffffff"))
    .attr("data-country", (f) => f.properties.code)
    .attr("data-coverage", (f) =>
      migrationCoverageMissing(
        f.properties.code,
        counts.get(f.properties.code) || 0,
      )
        ? "missing"
        : "reported",
    )
    .attr("d", path)
    .attr("stroke", (f) =>
      f.properties.code === movement.focus ? "#0f172a" : "#64748b",
    )
    .attr("stroke-width", (f) =>
      f.properties.code === movement.focus ? 1.8 : 0.6,
    )
    .attr("vector-effect", "non-scaling-stroke")
    .attr("fill-opacity", 1);
  polygons.interrupt();
  const fill = (f) =>
    migrationFill(f.properties.code, counts.get(f.properties.code) || 0);
  if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches)
    polygons
      .transition()
      .duration(350 / movement.speed)
      .attr("fill", fill);
  else polygons.attr("fill", fill);
  const polygonCodes = new Set(world.features.map((f) => f.properties.code));
  const pointCounts = [...counts].filter(
    ([code, count]) =>
      (count > 0 || migrationCoverageMissing(code, count)) &&
      !polygonCodes.has(code) &&
      centers[code],
  );
  if (!polygonCodes.has(movement.focus) && centers[movement.focus])
    pointCounts.push([movement.focus, 0]);
  layer
    .selectAll("circle")
    .data(pointCounts, (d) => d[0])
    .join("circle")
    .attr("data-country", (d) => d[0])
    .attr("data-coverage", (d) =>
      migrationCoverageMissing(d[0], d[1]) ? "missing" : "reported",
    )
    .attr("cx", (d) => centers[d[0]][0])
    .attr("cy", (d) => centers[d[0]][1])
    .attr("r", 3 / mapScale())
    .attr("fill", (d) => migrationFill(d[0], d[1]))
    .attr("fill-opacity", 1)
    .attr("stroke", (d) => (d[0] === movement.focus ? "#0f172a" : "#64748b"))
    .attr("stroke-width", (d) => (d[0] === movement.focus ? 1.8 : 0.6))
    .attr("vector-effect", "non-scaling-stroke");
  renderMovementArrows(counts);
  // Color overlays must stay below arrow hit targets when switching views.
  if (movement.view === "arrows") g.select(".movement-arrows").raise();
  g.select(".movement-label").raise();
  const quality = summarizeProvenance(
    movementCorridors(),
    movement.start,
    movement.cursor ? movement.start + movement.cursor - 1 : movement.start - 1,
  );
  const directionLabel =
    movement.direction === "in"
      ? "Incoming from selected origins"
      : movement.direction === "both"
        ? "Combined incoming and outgoing movements"
        : "Outgoing to selected destinations";
  $("#detail").innerHTML =
    '<span class="story-tag">CUMULATIVE MIGRATION · ' +
    quality.label +
    "</span><h2>" +
    name(movement.focus) +
    "</h2><p>" +
    directionLabel +
    "</p><strong>" +
    formatSourceValue(total, quality) +
    '</strong><p class="small">Annual migration flows. Full selected range: ' +
    formatSourceValue(
      movement.total,
      summarizeProvenance(movementCorridors(), movement.start, movement.end),
    ) +
    ". Gross movements include repeat migration.</p>";
  $("#movement-year").textContent = movement.cursor
    ? `Through ${movement.start + movement.cursor - 1}`
    : "Start — before selected movements";
  $("#movement-cursor").value = movement.cursor;
  $("#movement-count").textContent =
    `${formatSourceValue(total, quality)} accumulated on selected routes · ${formatSourceValue(movement.total, summarizeProvenance(movementCorridors(), movement.start, movement.end))} across ${movement.start}–${movement.end}`;
  const partnerLabel =
    movement.direction === "in"
      ? "Contributing origins"
      : movement.direction === "both"
        ? "Combined movements by counterpart"
        : "Receiving destinations";
  const maximumLabel =
    dataPolicy === "official"
      ? movement.maximum > 0
        ? movement.maximum.toLocaleString("en", { maximumFractionDigits: 1 }) +
          " reported"
        : "no positive official flow"
      : fullEstimate(movement.maximum);
  $("#movement-legend").textContent =
    movement.metric === "volume"
      ? `${partnerLabel}: darker blue = more migration. White = no positive flow displayed. Square-root scale, fixed to largest partner's ${dataPolicy === "official" ? "reported subtotal" : "full-range total"} (${maximumLabel}). Focal country outlined.`
      : `${partnerLabel}: cumulative migrations relative to ${movement.start} population. Blue scale 0–10% (10%+ saturated); hatched = population unavailable. Focal country outlined.`;
  if (dataPolicy === "official") {
    $("#movement-legend").textContent +=
      " Official reports only; missing years are excluded, never filled with model values. Gray crosshatching marks incomplete official coverage with no reported positive flow; white is outside the selection or reported zero. Blue partial totals include reported observations only.";
  }
  $("#everywhere-controls").hidden = movement.view !== "arrows";
  const list = $("#movement-contributions");
  list.replaceChildren();
  const peerQuality = new Map(peers.map((peer) => [peer, peerProvenance(peer)]));
  const unavailable = (peer) => dataPolicy === "official" && !peerQuality.get(peer).official;
  const ordered = peers.slice().sort((a, b) =>
    Number(unavailable(a)) - Number(unavailable(b)) ||
    counts.get(b) - counts.get(a) || name(a).localeCompare(name(b))
  );
  for (const peer of ordered) {
    const button = document.createElement("button");
    button.className = "destination-card";
    const q = peerQuality.get(peer);
    const missingFlow =
      dataPolicy === "official" &&
      (!q.official || (!cumulative(peer) && q.missing));
    const pct = missingFlow ? null : colorRatio(peer, cumulative(peer));
    button.textContent = `${name(peer)} · ${formatSourceValue(cumulative(peer), q)} · ${missingFlow ? "Percentage unavailable: missing official flow data" : pct === null ? "Population unavailable" : pct.toLocaleString("en", { maximumSignificantDigits: 4 }) + "%"}`;
    const badge = document.createElement("small");
    badge.className = "cell-quality";
    badge.textContent = q.label;
    button.append(badge);
    button.onclick = () => inspectMovement(peer);
    list.append(button);
  }
  const visiblePeers = ordered.filter(
    (p) =>
      !state.query ||
      `${name(movement.focus)} ${name(p)}`.toLowerCase().includes(state.query),
  );
  $("#route-count").textContent =
    `${visiblePeers.length} selected connections · playback values`;
  $("#route-list").replaceChildren();
  for (const peer of visiblePeers.slice(0, state.limit)) {
    const button = document.createElement("button");
    button.className = "route-card";
    const q = peerQuality.get(peer);
    button.textContent = `${movement.direction === "in" ? name(peer) + " → " + name(movement.focus) : movement.direction === "both" ? name(movement.focus) + " ↔ " + name(peer) : name(movement.focus) + " → " + name(peer)} · ${formatSourceValue(cumulative(peer), q)} · ${q.label}`;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", "route-dialog");
    const routePair =
      movement.direction === "in"
        ? [peer, movement.focus]
        : [movement.focus, peer];
    button.disabled = movement.cursor === 0;
    button.onclick = () => openMovementDetails(...routePair);
    $("#route-list").append(button);
  }
  $("#more").hidden = state.limit >= visiblePeers.length;
  const through = movement.cursor
    ? movement.start + movement.cursor - 1
    : movement.start - 1;
  const corridors = movementCorridors();
  const relevant = historyMatches(events, {
    corridors,
    start: movement.start,
    end: through,
    includeCountryContext(record) {
      if (record.country === movement.focus || movement.peers?.length === 1) return true;
      // A counterpart's general circumstances belong in a country overview only
      // when that directed connection has movement during the event itself.
      const direction = eventScope(record) === "origin-country" ? "in" : "out";
      const annual = movement.directionSeries[direction]?.peers[record.country];
      if (!annual) return false;
      const first = Math.max(movement.start, record.start) - 1960;
      const last = Math.min(through, record.end) - 1960;
      return annual.slice(first, last + 1).some((value) => value > 0);
    },
  });
  $("#event-count").textContent = relevant.length;
  updateDataDisclosure();
  const start = movement.start;
  const ticks = $("#event-ticks");
  const focusedId = ticks.contains(document.activeElement) ? document.activeElement.dataset.eventId : null;
  ticks.replaceChildren();
  for (const event of relevant) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.eventId = event.id;
    const first = Math.max(start, event.start);
    const last = Math.min(through, event.end);
    button.textContent = `${first === last ? first : first + "–" + last} · ${event.title}`;
    button.onclick = () => selectEvent(event, { start, end: through });
    ticks.append(button);
    if (focusedId === button.dataset.eventId) button.focus({ preventScroll: true });
  }
  renderHistoryCards($("#events"), relevant, {
    start,
    end: through,
    nameForCode: name,
    showRouteGap: corridors.length === 1,
    groupByScope: corridors.length > 1,
    emptyMessage:
      "No sourced historical context for the selected corridors through this playback year.",
  });
  if (movementInspection) {
    if (
      state.year < 1960 ||
      Number($("#range-start").value) !== movement.start ||
      Number($("#range-end").value) !== movement.end
    )
      closeMovementInspection();
    else renderMovementInspection();
  }
}
async function prepareMovement() {
  pauseMovement();
  closeMovementInspection();
  movement.series = null;
  movement.cursor = 0;
  const id = ++movement.token;
  movement.focus = $("#movement-focus").value;
  movement.direction = $("#movement-direction").value;
  paintMovement();
  const direction = movement.direction;
  const start = Number($("#range-start").value),
    end = Number($("#range-end").value);
  const error = validateRange(start, end);
  if (error || !movement.focus || movement.peers?.length === 0) {
    $("#movement-status").textContent =
      error || "Choose a country and at least one counterpart.";
    return false;
  }
  movement.start = start;
  movement.end = end;
  state.country = movement.focus;
  state.dir = movement.direction;
  state.counterparts = movement.peers;
  state.event = null;
  state.route = null;
  $("#country").value = movement.focus;
  const peer = movement.peers?.length === 1 ? movement.peers[0] : "";
  $("#pair-origin").value = direction === "out" ? movement.focus : direction === "in" ? peer : "";
  $("#pair-destination").value = direction === "in" ? movement.focus :
    direction === "out" ? (movement.peers === null ? "everywhere" : peer) : "";
  syncPairPicker();
  syncDirection();
  $("#period").textContent = `${start}–${end}`;
  $("#movement-status").textContent = "Loading complete annual series…";
  try {
    const directions = direction === "both" ? ["out", "in"] : [direction];
    const [parts, pop] = await Promise.all([
      Promise.all(directions.map((d) => loadCountrySeries(movement.focus, d))),
      movement.population ||
        fetch("data/population.json").then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        }),
    ]);
    if (id !== movement.token) return false;
    movement.directionSeries = Object.fromEntries(
      directions.map((d, i) => [d, parts[i]]),
    );
    const series =
      direction === "both"
        ? {
            country: movement.focus,
            peers: Object.fromEntries(
              Object.keys(parts[0].peers).map((peer) => [
                peer,
                parts[0].peers[peer].map((v, i) => {
                  const other = parts[1].peers[peer][i];
                  return v === null && other === null
                    ? null
                    : (v ?? 0) + (other ?? 0);
                }),
              ]),
            ),
          }
        : parts[0];
    if (
      series.country !== movement.focus ||
      Object.keys(series.peers).length !== 193
    )
      throw Error("Incomplete country coverage");
    if (
      Object.values(series.peers).some(
        (a) =>
          a.length !== 65 ||
          a.some(
            (v) =>
              !(dataPolicy === "official" && v === null) &&
              (!Number.isSafeInteger(v) || v < 0),
          ),
      )
    )
      throw Error();
    movement.population = pop;
    movement.series = series;
    movement.total =
      selectedPeers().reduce(
        (sum, p) => sum + Math.round(finalCount(p) * 10),
        0,
      ) / 10;
    movement.maximum = Math.max(0, ...selectedPeers().map(finalCount));
    movement.cursor = end - start + 1;
    state.everywhere = movement.peers === null;
    state.year = start;
    state.endYear = end;
    state.customRange = true;
    $("#time-title").textContent = rangeLabel(start, end);
    $("#year").value = Math.min(2020, Math.floor(start / 5) * 5);
    $("#year").setAttribute("aria-valuetext", rangeLabel(start, end));
    $("#show-all-routes").checked = false;
    $("#movement-cursor").max = end - start + 1;
    const rangeQuality = summarizeProvenance(
      movementCorridors(),
      movement.start,
      movement.end,
    );
    $("#movement-status").textContent =
      dataPolicy === "official" && !rangeQuality.official
        ? "Official flow data unavailable for this selection. Missing reports are not zero arrivals."
        : movement.total
          ? "Ready · " +
            rangeQuality.label +
            (dataPolicy === "official" && rangeQuality.missing
              ? " · playback accumulates reported observations only; gaps remain unavailable."
              : "")
          : dataPolicy === "official"
            ? "Official reports contain no positive movements; coverage gaps remain unavailable."
            : "No positive migration estimates for this selection.";
    paintMovement();
    return true;
  } catch {
    if (id === movement.token) {
      movement.series = null;
      $("#movement-status").textContent =
        "Complete data unavailable. Press Play to retry; no partial total is shown.";
    }
    return false;
  }
}
// Apply a country, its counterparts and a calendar range as one selection.
async function applyCountryScenario({
  focus,
  direction = "out",
  peers = null,
  start = Number($("#range-start").value),
  end = Number($("#range-end").value),
}) {
  const error = validateRange(start, end);
  const validPeers = peers === null || (Array.isArray(peers) &&
    peers.every((code) => code !== focus && countries?.[code]?.hasData));
  if (error || (focus && !countries?.[focus]?.hasData) ||
      !["in", "out", "both"].includes(direction) || !validPeers) {
    $("#movement-status").textContent =
      error || "Choose a covered country and different counterparts.";
    return false;
  }
  const samePeers = peers === movement.peers ||
    (peers && movement.peers && peers.length === movement.peers.length &&
      peers.every((peer) => movement.peers.includes(peer)));
  const sameSelection = focus === movement.focus && direction === movement.direction && samePeers;
  movement.peers = peers === null ? null : [...new Set(peers)];
  $("#movement-focus").value = focus;
  $("#movement-direction").value = direction;
  $("#movement-all").checked = peers === null;
  $("#range-start").value = start;
  $("#range-end").value = end;
  $("#country").value = focus;
  if (!sameSelection) {
    $("#movement-search").value = "";
    $("#search").value = "";
    state.query = "";
    state.limit = 30;
  }
  populatePeers();
  if (focus) return prepareMovement();
  $("#pair-origin").value = "";
  $("#pair-destination").value = "";
  syncPairPicker();
  pauseMovement();
  closeMovementInspection();
  movement.token++;
  movement.focus = "";
  movement.direction = "both";
  $("#movement-direction").value = "both";
  movement.series = null;
  movement.cursor = 0;
  Object.assign(state, {
    country: "", dir: "both", route: null, event: null,
    everywhere: false, counterparts: null,
  });
  syncDirection();
  await setRange(start, end);
  $("#movement-status").textContent = "Choose a country to explore migration.";
  return true;
}
async function openMovementDetails(origin, destination) {
  if (!movement.series || movement.cursor === 0) return;
  closeMovementInspection();
  pauseMovement();
  return originalMovementRouteDetails(origin, destination, {
    year: movement.start,
    endYear: movement.start + movement.cursor - 1,
    customRange: true,
  });
}
const countrySeriesCache = new Map();
async function loadCountrySeries(focus, direction) {
  const [raw] = await Promise.all([
    loadRawCountrySeries(focus, direction),
    officialDataReady(),
  ]);
  return resolveSeries(raw, direction);
}
function loadRawCountrySeries(focus, direction) {
  const key = focus + ":" + direction;
  if (!countrySeriesCache.has(key)) {
    countrySeriesCache.set(
      key,
      fetch(`data/series/${direction}/${focus}.json`)
        .then((r) => {
          if (!r.ok) throw Error("Model series unavailable");
          return r.json();
        })
        .then((series) => {
          const expected = Object.keys(countries).filter(
            (code) => code !== focus && countries[code].hasData,
          );
          if (series.country !== focus || !series.peers ||
              Object.keys(series.peers).length !== expected.length ||
              expected.some((peer) => {
                const values = series.peers[peer];
                return !Array.isArray(values) || values.length !== 65 ||
                  values.some((v) => !Number.isSafeInteger(v) || v < 0);
              }))
            throw Error("Incomplete annual series");
          return series;
        })
        .catch((error) => {
          countrySeriesCache.delete(key);
          throw error;
        }),
    );
  }
  return countrySeriesCache.get(key);
}
async function renderInspectionEstimate(target, corridors, scope, key) {
  target.textContent = "Loading migration estimate…";
  try {
    const directions = [
      ...new Set(corridors.map(([a]) => (a === scope.focus ? "out" : "in"))),
    ];
    const parts = await Promise.all(
      directions.map((d) => loadRawCountrySeries(scope.focus, d)),
    );
    if (!target.isConnected || movementInspection?.key !== key) return;
    const series = Object.fromEntries(directions.map((d, i) => [d, parts[i]]));
    let cumulative = 0,
      total = 0;
    for (const [a, b] of corridors) {
      const d = a === scope.focus ? "out" : "in",
        peer = d === "out" ? b : a;
      const values = series[d].peers[peer];
      if (
        !values ||
        values.length !== 65 ||
        values.some((v) => !Number.isSafeInteger(v) || v < 0)
      )
        throw Error("Incomplete model series");
      cumulative += values
        .slice(scope.start - 1960, scope.through - 1959)
        .reduce((a, b) => a + b, 0);
      total += values
        .slice(scope.start - 1960, scope.end - 1959)
        .reduce((a, b) => a + b, 0);
    }
    target.replaceChildren();
    const label = document.createElement("span");
    label.textContent = "Migration estimate · FLOW model";
    const number = document.createElement("strong");
    number.textContent = formatSourceValue(
      cumulative / 10,
      { basis: "modelled" },
      "model",
    );
    const note = document.createElement("p");
    note.textContent = `Estimated movements through ${scope.through}. Selected range ${scope.start}–${scope.end}: ${formatSourceValue(total / 10, { basis: "modelled" }, "model")}. These are statistical estimates, not verified official arrival counts.`;
    target.append(
      label,
      number,
      note,
      sourceNode(currentOfficialResolver().sources[MODEL_SOURCE_ID]),
    );
  } catch {
    if (!target.isConnected || movementInspection?.key !== key) return;
    target.textContent = "Migration estimate could not be loaded. ";
    const retry = document.createElement("button");
    retry.textContent = "Retry estimate";
    retry.onclick = () =>
      renderInspectionEstimate(target, corridors, scope, key);
    target.append(retry);
  }
}
async function inspectMovement(code, route = null) {
  if (state.year < 1960) {
    closeMovementInspection();
    return;
  }
  if (
    Number($("#range-start").value) !== movement.start ||
    Number($("#range-end").value) !== movement.end
  ) {
    const pending = prepareMovement();
    const requestToken = movement.token;
    if (!(await pending) || requestToken !== movement.token) return;
  }
  movementInspection = {
    code,
    route: route ? route.slice(0, 2) : null,
    key: null,
  };
  renderMovementInspection();
}
function renderMovementInspection() {
  if (!movementInspection || !movement.series) return;
  const { code, route } = movementInspection;
  const through = movement.start + movement.cursor - 1;
  const key = [
    code,
    (route || []).join(":"),
    movement.focus,
    movement.direction,
    (movement.peers || []).join(","),
    movement.start,
    movement.end,
    through,
    movement.metric,
    dataPolicy,
  ].join("|");
  if (movementInspection.key === key) return;
  const comparisonOpen =
    movementInspection.key !== null &&
    colorTip.querySelector(".tooltip-model-comparison")?.open;
  movementInspection.key = key;
  const participating =
    code === movement.focus || selectedPeers().includes(code);
  const corridors = route
    ? [route]
    : code === movement.focus
      ? movementCorridors()
      : movementCorridors().filter(([a, b]) => a === code || b === code);
  const official = summarizeProvenance(
    corridors,
    movement.start,
    through,
    "official",
  );
  let reportedTenths = 0;
  for (const [a, b] of corridors)
    for (const point of getRouteProvenance(
      a,
      b,
      movement.start,
      through,
      "official",
    ).years) {
      if (point.value !== null) reportedTenths += Math.round(point.value * 10);
    }
  const reported = reportedTenths / 10;
  const selectedCount = route
    ? (() => {
        const peer = route[0] === movement.focus ? route[1] : route[0];
        const direction = route[0] === movement.focus ? "out" : "in";
        const series =
          movement.direction === "both"
            ? movement.directionSeries[direction]
            : movement.series;
        return (
          (series?.peers[peer]
            ?.slice(
              movement.start - 1960,
              movement.start - 1960 + movement.cursor,
            )
            .reduce((sum, v) => sum + (v ?? 0), 0) || 0) / 10
        );
      })()
    : code === movement.focus
      ? selectedPeers().reduce((sum, peer) => sum + cumulative(peer), 0)
      : cumulative(code);
  colorTip.replaceChildren();
  colorTip.hidden = false;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close ×";
  close.onclick = closeMovementInspection;
  const title = document.createElement("h3");
  title.textContent = route
    ? `${name(route[0])} → ${name(route[1])}`
    : name(code);
  const period = document.createElement("p");
  period.className = "tooltip-period";
  period.textContent = movement.cursor
    ? `Official figures through ${through} · selected range ${movement.start}–${movement.end}`
    : "Before the selected annual observations";
  colorTip.append(close, title, period);
  if (participating) {
    const residence = document.createElement("section");
    residence.className = "official-residence-card tooltip-official-residence";
    residence.hidden = true;
    colorTip.append(residence);
    renderOfficialResidence(residence, corridors, movement.start, through);
  }
  const info = document.createElement("p");
  info.className = "tooltip-official-info";
  if (!participating)
    info.textContent =
      "This country is outside the selected migration scenario.";
  else if (!movement.cursor)
    info.textContent =
      "No completed annual observations yet. Advance the timeline to inspect official figures.";
  else {
    info.textContent =
      formatSourceValue(reported, official, "official") +
      " · " +
      (movement.direction === "both" && !route
        ? "combined official incoming and outgoing movements"
        : "official migration flows") +
      ".";
    const hasPercentage =
      official.official > 0 && (reported > 0 || !official.missing);
    const pct = hasPercentage ? colorRatio(code, reported) : null;
    if (!hasPercentage)
      info.textContent +=
        " Population-relative migration percentage unavailable.";
    else if (pct === null)
      info.textContent += " Population baseline unavailable.";
    else
      info.textContent +=
        " " +
        pct.toLocaleString("en", { maximumSignificantDigits: 4 }) +
        "% reported movements relative to " +
        name(code) +
        "’s " +
        movement.start +
        " population (World Bank estimate).";
  }
  if (participating && movement.cursor && !official.official) {
    const estimate = document.createElement("section");
    estimate.className = "tooltip-estimate tooltip-general-count";
    colorTip.append(estimate);
    renderInspectionEstimate(
      estimate,
      corridors,
      {
        focus: movement.focus,
        start: movement.start,
        end: movement.end,
        through,
      },
      key,
    );
  }
  colorTip.append(info);
  if (participating) {
    const badge = document.createElement("p");
    badge.className = "data-source-note";
    badge.textContent = sourceSummaryText(official);
    colorTip.append(badge);
    for (const id of official.sourceIds)
      colorTip.append(
        sourceNode(currentOfficialResolver().sources[id]),
        document.createElement("br"),
      );
    if (dataPolicy !== "official") {
      const comparison = document.createElement("details");
      comparison.className = "tooltip-model-comparison";
      comparison.open = !!comparisonOpen;
      const label = document.createElement("summary");
      label.textContent =
        "Selected map comparison · " +
        (dataPolicy === "model" ? "FLOW model only" : "Best available");
      comparison.append(label);
      const quality = summarizeProvenance(corridors, movement.start, through);
      const value = document.createElement("p");
      value.textContent =
        formatSourceValue(selectedCount, quality) +
        " cumulative comparison movements. " +
        sourceSummaryText(quality);
      comparison.append(value);
      for (const id of quality.sourceIds)
        comparison.append(
          sourceNode(currentOfficialResolver().sources[id]),
          document.createElement("br"),
        );
      if (hasBelarusPoland(corridors, movement.start, through)) {
        const p = document.createElement("p");
        p.textContent = belarusCaution;
        comparison.append(p);
      }
      colorTip.append(comparison);
    }
  }
  if (participating && code !== movement.focus && movement.cursor > 0) {
    const details = document.createElement("button");
    details.type = "button";
    details.textContent = "View route details ↗";
    details.onclick = () =>
      openMovementDetails(
        ...(route
          ? route
          : movement.direction !== "in"
            ? [movement.focus, code]
            : [code, movement.focus]),
      );
    colorTip.append(details);
  }
}
function runMovement() {
  if (!movement.total && dataPolicy !== "official") return;
  clearInterval(movement.clock);
  $("#movement-play").textContent = "Pause Ⅱ";
  movement.clock = setInterval(() => {
    movement.cursor++;
    paintMovement(true);
    if (movement.cursor >= movement.end - movement.start + 1) pauseMovement();
  }, 1000 / movement.speed);
}
$("#movement-play").onclick = async () => {
  if (movement.clock) {
    pauseMovement();
    return;
  }
  if (
    !movement.series ||
    movement.start !== Number($("#range-start").value) ||
    movement.end !== Number($("#range-end").value)
  ) {
    if (!(await prepareMovement())) return;
  }
  if (movement.cursor >= movement.end - movement.start + 1) movement.cursor = 0;
  paintMovement();
  runMovement();
};
$("#movement-restart").onclick = () => {
  pauseMovement();
  movement.cursor = 0;
  paintMovement();
};
$("#movement-cursor").oninput = (e) => {
  const cursor = +e.target.value;
  pauseMovement();
  movement.cursor = cursor;
  paintMovement();
};
$("#movement-speed").onchange = (e) => {
  const running = !!movement.clock;
  pauseMovement();
  movement.speed = +e.target.value;
  if (running) runMovement();
};
$("#movement-metric").onchange = (e) => {
  movement.metric = e.target.value;
  paintMovement();
};
$("#movement-view").onchange = (e) => {
  pauseMovement();
  movement.view = e.target.value;
  paintMovement();
};
function populatePeers() {
  const query = $("#movement-search").value.toLowerCase();
  const list = $("#movement-peers");
  list.replaceChildren();
  Object.values(countries)
    .filter(
      (c) =>
        c.hasData &&
        c.code !== $("#movement-focus").value &&
        c.name.toLowerCase().includes(query),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((c) => {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.checked = movement.peers?.includes(c.code) || false;
      input.onchange = () => {
        movement.peers = movement.peers || [];
        movement.peers = input.checked
          ? [...movement.peers, c.code]
          : movement.peers.filter((p) => p !== c.code);
        $("#movement-all").checked = false;
        prepareMovement();
      };
      label.append(input, document.createTextNode(c.name));
      list.append(label);
    });
}
$("#movement-search").oninput = populatePeers;
$("#movement-all").onchange = (e) => {
  movement.peers = e.target.checked ? null : [];
  populatePeers();
  prepareMovement();
};
$("#movement-focus").onchange = () => {
  return applyCountryScenario({focus: $("#movement-focus").value, direction: $("#movement-direction").value});
};
$("#movement-direction").onchange = () => {
  if ($("#movement-focus").value) return prepareMovement();
  state.dir = $("#movement-direction").value;
  movement.direction = state.dir;
  syncDirection();
  draw();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseMovement();
});
for (const id of ["range-start", "range-end"])
  $("#" + id).addEventListener("input", () => {
    pauseMovement();
    movement.token++;
    movement.series = null;
    movement.cursor = 0;
    paintMovement();
  });
const originalRangeSubmit = $("#range-form").onsubmit;
$("#range-form").onsubmit = (e) => {
  if (movement.focus) {
    e.preventDefault();
    return prepareMovement();
  }
  return originalRangeSubmit(e);
};
const originalMovementModal = modal;
modal = function (html) {
  closeMovementInspection();
  pauseMovement();
  return originalMovementModal(html);
};
const originalMovementRouteDetails = openRouteDetails;
openRouteDetails = function (...args) {
  closeMovementInspection();
  pauseMovement();
  if (args.length === 2 && args[1] !== "everywhere" && movement.series) {
    return openMovementDetails(...args);
  }
  return originalMovementRouteDetails(...args);
};
const originalMovementSelectEvent = selectEvent;
selectEvent = function (event, range) {
  if (!movement.series) return originalMovementSelectEvent(event);
  modal(
    '<div class="eyebrow">HISTORICAL CONTEXT</div><div id="inspected-history"></div>',
  );
  renderHistoryCards($("#inspected-history"), [event], {
    start: range?.start ?? event.start,
    end: range?.end ?? event.end,
    nameForCode: name,
  });
};
const bootMovement = setInterval(() => {
  if (!countries || !world || !events) return;
  clearInterval(bootMovement);
  for (const c of Object.values(countries)
    .filter((c) => c.hasData)
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const option = document.createElement("option");
    option.value = c.code;
    option.textContent = c.name;
    $("#movement-focus").append(option);
  }
  populatePeers();
  defs
    .append("pattern")
    .attr("id", "population-missing")
    .attr("width", 6)
    .attr("height", 6)
    .attr("patternUnits", "userSpaceOnUse")
    .append("path")
    .attr("d", "M0,0L6,6")
    .attr("stroke", "#777");
  const migrationPattern = defs
    .append("pattern")
    .attr("id", "migration-missing")
    .attr("width", 7)
    .attr("height", 7)
    .attr("patternUnits", "userSpaceOnUse");
  migrationPattern
    .append("rect")
    .attr("width", 7)
    .attr("height", 7)
    .attr("fill", "#f8fafc");
  migrationPattern
    .append("path")
    .attr("d", "M0,0L7,7M7,0L0,7")
    .attr("stroke", "#94a3b8")
    .attr("stroke-width", 0.65);
  const originalClick = g.select(".country").on("click");
  g.selectAll(".country").on("click", function (event, d) {
    if (movement.series) {
      inspectMovement(d.properties.code);
    } else if (!movement.focus) originalClick.call(this, event, d);
  });
  const oldCountry = $("#country").onchange;
  $("#country").onchange = (e) => {
    if (e.target.value && !countries[e.target.value]?.hasData) {
      pauseMovement();
      closeMovementInspection();
      movement.token++;
      movement.focus = "";
      movement.series = null;
      movement.cursor = 0;
      $("#movement-focus").value = "";
      oldCountry(e);
      return;
    }
    return applyCountryScenario({focus: e.target.value, direction: state.dir});
  };
  $("#pair-form").onsubmit = (e) => {
    e.preventDefault();
    const focus = $("#pair-origin").value;
    const dest = $("#pair-destination").value;
    const error = pairError(focus, dest);
    $("#pair-error").hidden = !error;
    $("#pair-error").textContent = error;
    if (error) return;
    return applyCountryScenario({focus, direction: "out", peers: dest === "everywhere" ? null : [dest]});
  };
  $("#pair-open").textContent = "Show movement ↗";
  const oldPlay = $("#play").onclick;
  $("#play").onclick = () =>
    movement.focus ? $("#movement-play").click() : oldPlay();
  document.querySelectorAll("[data-dir]").forEach((button) => {
    const original = button.onclick;
    button.onclick = () => {
      $("#movement-direction").value = button.dataset.dir;
      if (!movement.focus) {
        original();
        return;
      }
      return prepareMovement();
    };
  });
  window.addEventListener("resize", () => paintMovement());
  g.selectAll(".country,.country-point")
    .attr("tabindex", 0)
    .attr("role", "button")
    .on("keydown.color", async function (e, d) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const code = d.properties?.code || d.code;
      if (movement.series) {
        await inspectMovement(code);
        colorTip.querySelector("button")?.focus();
      } else if (!movement.focus) {
        $("#country").value = code;
        $("#country").dispatchEvent(new Event("change"));
      }
    });
  const pointClick = g.select(".country-point").on("click");
  g.selectAll(".country-point").on("click", function (e, d) {
    if (movement.series) inspectMovement(d.code);
    else if (!movement.focus) pointClick.call(this, e, d);
  });
  const oldDraw = draw;
  draw = function () {
    oldDraw();
    paintMovement();
  };
  const oldZoom = zoom.on("zoom");
  zoom.on("zoom", function (e) {
    oldZoom.call(this, e);
    paintMovement();
  });
}, 50);

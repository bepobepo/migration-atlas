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
};
const panel = document.createElement("section");
panel.className = "movement-panel";
panel.innerHTML = `<div class="movement-switches"><label>Map view<select id="movement-view"><option value="color">Color movement</option><option value="arrows">Arrows</option></select></label><label>Color scale<select id="movement-metric"><option value="volume">Migration volume</option><option value="population">Share of population</option></select></label></div><div class="movement-pickers"><label>Focus country<select id="movement-focus"><option value="">Choose a country</option></select></label><label>Direction<select id="movement-direction"><option value="out">Outgoing — to destinations</option><option value="in">Incoming — from origins</option></select></label></div><details><summary>Choose origins / destinations</summary><label><input id="movement-all" type="checkbox" checked> Everywhere</label><input id="movement-search" type="search" placeholder="Find a country…" aria-label="Search counterpart countries"><div id="movement-peers"></div></details><div id="movement-status" role="status">Choose a focal country to explore color movement.</div><div class="movement-transport"><button id="movement-play">Play ▶</button><button id="movement-restart">Restart ↺</button><label>Speed<select id="movement-speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div><input id="movement-cursor" type="range" min="0" max="5" value="0" aria-label="Playback year"><strong id="movement-year">Start</strong><p id="movement-count" aria-live="polite"></p><p id="movement-legend"></p><div id="movement-contributions"></div><p class="small">Gross estimated movements, including repeat migration. Arrivals and departures do not establish overall population change. Population colors saturate at 10%; displayed percentages are uncapped. <a href="https://data.worldbank.org/indicator/SP.POP.TOTL" target="_blank" rel="noopener">Population source ↗</a></p>`;
$(".map-wrap").before(panel);
const colorTip = document.createElement("section");
colorTip.className = "movement-tip";
colorTip.hidden = true;
colorTip.setAttribute("role", "dialog");
colorTip.setAttribute("aria-label", "Country migration details");
$(".map-wrap").append(colorTip);
function pauseMovement() {
  clearInterval(movement.clock);
  movement.clock = null;
  $("#movement-play").textContent = "Play ▶";
  g.selectAll(".migration-fill").interrupt();
  paintMovement();
}
function colorRatio(code, count) {
  const p = movement.population?.countries[code]?.[movement.start - 1960];
  return p > 0 ? (100 * count) / p : null;
}
function cumulative(peer) {
  return (
    movement.series?.peers[peer]
      ?.slice(movement.start - 1960, movement.start - 1960 + movement.cursor)
      .reduce((a, b) => a + b, 0) / 10 || 0
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
      .reduce((a, b) => a + b, 0) / 10
  );
}
function migrationOpacity(code, count, origin) {
  const ratio =
    movement.metric === "population"
      ? colorRatio(code, count)
      : movement.total > 0
        ? count / movement.total
        : 0;
  if (ratio === null) return null;
  const intensity = Math.sqrt(
    Math.max(
      0,
      Math.min(1, movement.metric === "population" ? ratio / 10 : ratio),
    ),
  );
  return 0.12 + 0.76 * (origin ? 1 - intensity : intensity);
}
function paintMovement(animate = false) {
  const active = movement.view === "color" && movement.series;
  document.body.classList.toggle("color-active", !!active);
  g.selectAll(".flow-layer,.story-line").style(
    "display",
    active ? "none" : null,
  );
  g.selectAll(".country").style("fill", active ? "#e5e9df" : null);
  if (!active) {
    g.selectAll(".migration-fill").remove();
    return;
  }
  const peers = selectedPeers(),
    total = peers.reduce((sum, p) => sum + cumulative(p), 0),
    counts = new Map(peers.map((p) => [p, cumulative(p)]));
  counts.set(movement.focus, total);
  const isOrigin = (c) =>
    movement.direction === "out" ? c === movement.focus : c !== movement.focus;
  const layer = g
    .selectAll("g.migration-fill")
    .data([0])
    .join("g")
    .attr("class", "migration-fill")
    .attr("pointer-events", "none");
  const polygons = layer
    .selectAll("path")
    .data(
      world.features.filter((f) => counts.has(f.properties.code)),
      (f) => f.properties.code,
    )
    .join("path")
    .attr("d", path)
    .attr("fill", (f) =>
      migrationOpacity(
        f.properties.code,
        counts.get(f.properties.code),
        isOrigin(f.properties.code),
      ) === null
        ? "url(#population-missing)"
        : "#287e78",
    )
    .attr("stroke", (f) =>
      f.properties.code === movement.focus ? "#cf7956" : "#526a60",
    )
    .attr("stroke-width", (f) =>
      f.properties.code === movement.focus ? 1.6 : 0.5,
    )
    .attr("vector-effect", "non-scaling-stroke");
  const opacity = (f) =>
    migrationOpacity(
      f.properties.code,
      counts.get(f.properties.code),
      isOrigin(f.properties.code),
    ) ?? 0.65;
  polygons.interrupt();
  if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches)
    polygons
      .transition()
      .duration(350 / movement.speed)
      .attr("fill-opacity", opacity);
  else polygons.attr("fill-opacity", opacity);
  const polygonCodes = new Set(world.features.map((f) => f.properties.code));
  layer
    .selectAll("circle")
    .data(
      [...counts].filter(([code]) => !polygonCodes.has(code) && centers[code]),
      (d) => d[0],
    )
    .join("circle")
    .attr("cx", (d) => centers[d[0]][0])
    .attr("cy", (d) => centers[d[0]][1])
    .attr("r", 3 / mapScale())
    .attr("fill", (d) =>
      migrationOpacity(d[0], d[1], isOrigin(d[0])) === null
        ? "url(#population-missing)"
        : "#287e78",
    )
    .attr(
      "fill-opacity",
      (d) => migrationOpacity(d[0], d[1], isOrigin(d[0])) ?? 0.65,
    )
    .attr("stroke", "#cf7956")
    .attr("vector-effect", "non-scaling-stroke");
  $("#detail").innerHTML =
    '<span class="story-tag">CUMULATIVE MIGRATION</span><h2>' +
    name(movement.focus) +
    "</h2><p>" +
    (movement.direction === "in"
      ? "Incoming from selected origins"
      : "Outgoing to selected destinations") +
    "</p><strong>" +
    fullEstimate(total) +
    '</strong><p class="small">Annual FLOW estimates. Selected-range total: ' +
    fullEstimate(movement.total) +
    ". Gross movements include repeat migration.</p>";
  $("#movement-year").textContent = movement.cursor
    ? `Through ${movement.start + movement.cursor - 1}`
    : "Start — before selected movements";
  $("#movement-cursor").value = movement.cursor;
  $("#movement-count").textContent =
    `${fullEstimate(total)} accumulated · ${fullEstimate(movement.total)} across ${movement.start}–${movement.end}`;
  $("#movement-legend").textContent =
    movement.metric === "volume"
      ? "Lighter origins = departures; darker destinations = arrivals. Square-root intensity relative to the selected range total."
      : `Cumulative migrations relative to ${movement.start} population. Square-root scale: 0–10% (10%+ saturated). Missing baseline = hatched/unavailable.`;
  const list = $("#movement-contributions");
  list.replaceChildren();
  for (const peer of peers.sort((a, b) => finalCount(b) - finalCount(a))) {
    const b = document.createElement("button");
    b.className = "destination-card";
    const pct = colorRatio(peer, cumulative(peer));
    b.textContent = `${name(peer)} · ${fullEstimate(cumulative(peer))} · ${pct === null ? "Population unavailable" : pct.toLocaleString("en", { maximumSignificantDigits: 4 }) + "%"}`;
    b.onclick = () => inspectMovement(peer);
    list.append(b);
  }
  const through = movement.cursor
    ? movement.start + movement.cursor - 1
    : movement.start - 1;
  $("#events").replaceChildren();
  const relevant = events.filter(
    (e) =>
      e.start <= through &&
      e.end >= movement.start &&
      (movement.direction === "out"
        ? e.origin === movement.focus && peers.includes(e.destination)
        : e.destination === movement.focus && peers.includes(e.origin)),
  );
  $("#event-count").textContent = relevant.length;
  for (const e of relevant) {
    const article = document.createElement("article");
    article.className = "route-context-card";
    article.innerHTML = `<strong>${e.title}</strong><p>${e.text}</p><a class="source" href="${e.source}" target="_blank" rel="noopener">Historical source ↗</a>`;
    $("#events").append(article);
  }
  if (!relevant.length)
    $("#events").textContent =
      "No sourced historical account for the selected corridors through this playback year.";
}
async function prepareMovement() {
  pauseMovement();
  colorTip.hidden = true;
  movement.series = null;
  movement.cursor = 0;
  paintMovement();
  const id = ++movement.token;
  movement.focus = $("#movement-focus").value;
  movement.direction = $("#movement-direction").value;
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
  syncDirection();
  $("#period").textContent = `${start}–${end}`;
  $("#movement-status").textContent = "Loading complete annual series…";
  try {
    const [series, pop] = await Promise.all([
      fetch(`data/series/${movement.direction}/${movement.focus}.json`).then(
        (r) => {
          if (!r.ok) throw Error();
          return r.json();
        },
      ),
      movement.population ||
        fetch("data/population.json").then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        }),
    ]);
    if (id !== movement.token) return false;
    if (
      series.country !== movement.focus ||
      Object.keys(series.peers).length !== 193
    )
      throw Error("Incomplete country coverage");
    if (
      Object.values(series.peers).some(
        (a) =>
          a.length !== 65 || a.some((v) => !Number.isSafeInteger(v) || v < 0),
      )
    )
      throw Error();
    movement.population = pop;
    movement.series = series;
    movement.total = selectedPeers().reduce((sum, p) => sum + finalCount(p), 0);
    $("#movement-cursor").max = end - start + 1;
    $("#movement-status").textContent = movement.total
      ? "Ready · worldwide FLOW estimates"
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
function inspectMovement(code) {
  const count =
    code === movement.focus
      ? selectedPeers().reduce((s, p) => s + cumulative(p), 0)
      : cumulative(code);
  const pct = colorRatio(code, count);
  colorTip.replaceChildren();
  colorTip.hidden = false;
  const close = document.createElement("button");
  close.textContent = "Close ×";
  close.onclick = () => (colorTip.hidden = true);
  const title = document.createElement("h3");
  title.textContent = name(code);
  const info = document.createElement("p");
  info.textContent = `${fullEstimate(count)} cumulative estimated movements. ${pct === null ? "Population baseline unavailable." : pct.toLocaleString("en", { maximumSignificantDigits: 4 }) + "% relative to " + movement.start + " population."}`;
  colorTip.append(close, title, info);
  if (code !== movement.focus) {
    const details = document.createElement("button");
    details.textContent = "View route details ↗";
    details.onclick = async () => {
      pauseMovement();
      await setRange(movement.start, movement.end);
      const saved = { ...state };
      openRouteDetails(
        ...(movement.direction === "out"
          ? [movement.focus, code]
          : [code, movement.focus]),
      ).then(() => Object.assign(state, saved));
    };
    colorTip.append(details);
  }
}
function runMovement() {
  if (!movement.total) return;
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
  if (movement.view === "arrows") setRange(movement.start, movement.end);
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
  movement.peers = null;
  $("#movement-all").checked = true;
  populatePeers();
  prepareMovement();
};
$("#movement-direction").onchange = prepareMovement;
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
  if (movement.view === "color") {
    e.preventDefault();
    prepareMovement();
  } else originalRangeSubmit(e);
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
  const originalClick = g.select(".country").on("click");
  g.selectAll(".country").on("click", function (event, d) {
    if (movement.view === "color" && movement.series) {
      inspectMovement(d.properties.code);
    } else originalClick.call(this, event, d);
  });
  const oldCountry = $("#country").onchange;
  $("#country").onchange = (e) => {
    oldCountry(e);
    $("#movement-focus").value = e.target.value;
    movement.peers = null;
    prepareMovement();
  };
  const oldPair = $("#pair-form").onsubmit;
  $("#pair-form").onsubmit = (e) => {
    if (movement.view === "arrows") {
      oldPair(e);
      return;
    }
    e.preventDefault();
    $("#movement-focus").value = $("#pair-origin").value;
    $("#movement-direction").value = "out";
    const dest = $("#pair-destination").value;
    movement.peers = dest === "everywhere" ? null : [dest];
    $("#movement-all").checked = dest === "everywhere";
    populatePeers();
    prepareMovement();
  };
  $("#pair-open").textContent = "Show movement ↗";
  const oldPlay = $("#play").onclick;
  $("#play").onclick = () =>
    movement.view === "color" && movement.focus
      ? $("#movement-play").click()
      : oldPlay();
  g.selectAll(".country,.country-point")
    .attr("tabindex", 0)
    .attr("role", "button")
    .on("keydown.color", function (e, d) {
      if (
        movement.view === "color" &&
        movement.series &&
        (e.key === "Enter" || e.key === " ")
      ) {
        e.preventDefault();
        inspectMovement(d.properties?.code || d.code);
      }
    });
  const pointClick = g.select(".country-point").on("click");
  g.selectAll(".country-point").on("click", function (e, d) {
    if (movement.view === "color" && movement.series) inspectMovement(d.code);
    else pointClick.call(this, e, d);
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

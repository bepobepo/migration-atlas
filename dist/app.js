const $ = (s) => document.querySelector(s),
  cache = {},
  state = {
    year: 2020,
    country: "",
    dir: "both",
    route: null,
    event: 16,
    limit: 30,
    query: "",
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
    ".toolbar button, .toolbar select, .transport button, #year, #search, #more, #all-events",
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
let tooltipRoute = null;
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
  }
  tooltipRoute = null;
}
function showMapTooltip(event, route) {
  event.stopPropagation();
  const keyboard = event.type === "keydown" || event.detail === 0;
  const anchor = event.currentTarget?.getBoundingClientRect();
  selectRoute(route);
  tooltipRoute = route[0] + "-" + route[1];
  mapTooltip.querySelector(".tooltip-route").textContent =
    `${name(route[0])} → ${name(route[1])}`;
  mapTooltip.querySelector(".tooltip-period").textContent = period(state.year);
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
mapTooltip.querySelector(".tooltip-close").onclick = () => hideMapTooltip(true);
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
  });
svg.call(zoom);
const defs = svg.append("defs");
["#287e78", "#cf7956", "#8d7ba4"].forEach((c, i) =>
  defs
    .append("marker")
    .attr("id", "arrow" + i)
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 7)
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
  return `M${a}Q${(a[0] + b[0]) / 2 - dy * 0.2},${(a[1] + b[1]) / 2 + dx * 0.2} ${b[0] - (dx / l) * 4},${b[1] - (dy / l) * 4}`;
}
function draw() {
  hideMapTooltip();
  const all = rows.filter(matches).sort((a, b) => b[2] - a[2]),
    shown = all.filter((r) => r[2] > 0).slice(0, 30);
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
      Math.min(10, Math.max(0.7, Math.sqrt(r[2] / 100000))),
    )
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
        `${name(r[0])} to ${name(r[1])}, ${period(state.year)}, ${fmt(r[2])} estimated migrations. Open details.`,
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
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "6 5")
      .attr("pointer-events", "none");
  }
  if (state.route) {
    for (const code of state.route) {
      const point =
        ev?.id === 0 && code === "ESP" ? projection([-16, 28]) : centers[code];
      if (point)
        g.append("text")
          .attr("class", "endpoint-label")
          .attr("x", point[0] + 5)
          .attr("y", point[1] - 6)
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
    b.onclick = () => selectRoute(r);
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
}
function selectRoute(r) {
  state.route = [r[0], r[1]];
  state.event = null;
  draw();
}
function selectEvent(e) {
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
      e.start <= state.year + 4 &&
      e.end >= state.year &&
      (!state.country || [e.origin, e.destination].includes(state.country)),
  );
  $("#event-count").textContent = selected.length;
  $("#events").replaceChildren();
  $("#event-ticks").replaceChildren();
  selected.forEach((e) => {
    const b = document.createElement("button");
    b.className = "event-btn";
    b.innerHTML = `<span>${e.start}${e.end !== e.start ? "–" + e.end : ""} · ${e.route}</span>${e.title} ↗`;
    b.onclick = () => selectEvent(e);
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
    return;
  }
  if (state.route) {
    const [a, b] = state.route,
      r = rows.find((r) => r[0] === a && r[1] === b);
    $("#detail").innerHTML =
      `<span class="story-tag">MODELLED MIGRATION</span><h2 class="story-title">${name(a)}<br>→ ${name(b)}</h2><div class="big-value">${dataStatus === "loading" ? "Loading…" : dataStatus === "error" ? "Data unavailable" : fmt(r?.[2])}</div><div class="small">${period(state.year)} · estimated migrations<br>Approximate counts, not unique people across years.</div><div class="spark" aria-label="Migration trend across five-year periods"></div><div class="small trend-key">1960–64 → 2020–24 · hatched bars = unavailable</div><a class="source" href="https://data.humdata.org/dataset/annual-migration-flow-estimates-by-sex-between-all-countries-since-1960" target="_blank" rel="noopener">FLOW v1.0 · source ↗</a><p class="small">This model is least suitable for precise individual-route analysis. Official records should be preferred when available. Estimated zero does not prove no migration occurred. Modern boundaries provide geographic reference; arrows do not trace actual journeys.</p>`;
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
async function setYear(y) {
  state.year = y;
  if (
    events?.[state.event] &&
    (events[state.event].start > y + 4 || events[state.event].end < y)
  )
    state.event = null;
  $("#year").value = y;
  $("#year").setAttribute("aria-valuetext", period(y));
  $("#period").textContent = $("#time-title").textContent = period(y);
  const id = ++loadId;
  rows = [];
  dataStatus = "loading";
  $("#map").setAttribute("aria-busy", "true");
  $("#map-status").textContent = "Loading…";
  draw();
  try {
    const r = await load(y);
    if (id !== loadId) return;
    rows = r;
    dataStatus = "ready";
    $("#map").setAttribute("aria-busy", "false");
    $("#map-status").textContent =
      y < 1960
        ? "Historical context only · no comparable migration counts"
        : "";
    draw();
  } catch {
    if (id !== loadId) return;
    dataStatus = "error";
    $("#map").setAttribute("aria-busy", "false");
    $("#map-status").textContent =
      "Could not load migration data. Please try another period or reload.";
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
    '<div class="eyebrow">METHODOLOGY & SOURCES</div><h2>Reading the atlas</h2><p>FLOW v1.0 supplies annual modelled bilateral migration estimates for 1960–2024. Female and male estimates are summed across five complete calendar years. These are estimates of migration, not border crossings or unique individuals across years. No quantitative estimates are supplied for 1950–1959.</p><p>Beyer, Schewe, Abel, Warner and Campo (2026) provide this model for broad patterns. Their usage notes describe individual migration corridors as one of its least suitable uses; official or statistically harmonised records should be preferred when available. Estimated zero does not establish that no migration occurred. Missing observations are never converted to zero.</p><p>Europe follows UN M49, including Russia and the UK. A route appears when at least one endpoint is European. Türkiye and Cyprus are outside this regional definition; their connections with European countries are included. Modern boundaries provide geographic reference throughout. Historical state changes are not reconstructed or allocated by this app.</p><p>Overview arrows show the 30 largest positive estimates for your filters. The list includes all available estimates, including estimated zeros. Width uses one square-root scale across periods, with a minimum visible width and a maximum of 10 pixels. Incoming/outgoing filters refer to the selected country, or to European endpoints when no country is selected; intra-European connections can appear in both. Country label points mark schematic connections, not physical travel routes. Small countries omitted from the simplified boundaries are shown as points. Dashed story connections are unweighted and excluded from estimates. Canary Islands stories are regional context within Spain.</p><p>Historical events have individual source links. Event ranges identify featured periods, not necessarily the beginning or end of a migration wave. Residence permits, asylum applications, refugee registrations and population stocks must retain their own meanings; they are not added to map totals. Historical associations do not establish causation from model changes.</p><p><a href="https://data.humdata.org/dataset/annual-migration-flow-estimates-by-sex-between-all-countries-since-1960" target="_blank" rel="noopener">FLOW v1.0 · HDX · CC BY</a><br><a href="https://www.nature.com/articles/s41597-026-07983-w" target="_blank" rel="noopener">Research paper and usage limitations</a><br><a href="https://osf.io/download/p58ay/" target="_blank" rel="noopener">Archived source CSV</a><br><a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth · public-domain boundaries</a><br>D3 v7 · ISC license. Data snapshot: November 2026.</p>',
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
  state.country = e.target.value;
  state.event = null;
  state.route = null;
  state.limit = 30;
  draw();
};
document.querySelectorAll("[data-dir]").forEach(
  (b) =>
    (b.onclick = () => {
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
$("#prev").onclick = () => setYear(Math.max(1950, state.year - 5));
$("#next").onclick = () => setYear(Math.min(2020, state.year + 5));
$("#play").onclick = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    $("#play").textContent = "▶";
    $("#play").setAttribute("aria-label", "Play timeline");
  } else {
    if (state.year === 2020) setYear(1950);
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
        o.textContent = c.name;
        $("#country").append(o);
      });
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
    syncDirection();
    setYear(2020);
  })
  .catch(() => {
    $("#map-status").textContent =
      "Map assets could not be loaded. Please reload the page.";
  });

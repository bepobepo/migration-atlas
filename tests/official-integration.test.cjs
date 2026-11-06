const { JSDOM } = require("jsdom");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../dist");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const official = json("data/official/flows.json");
const observations = new Map(
  official.records.map((record) => [
    `${record.origin}:${record.destination}:${record.year}`,
    record,
  ]),
);
const annual = new Map();
const tenths = (value) => Math.round(value * 10);
function expected(origin, destination, start, end, policy = "best") {
  let total = 0;
  for (let year = start; year <= end; year++) {
    if (!annual.has(year))
      annual.set(
        year,
        new Map(
          json(`data/annual/${year}.json`).map(([a, b, count]) => [
            `${a}:${b}`,
            tenths(count),
          ]),
        ),
      );
    const observation = observations.get(`${origin}:${destination}:${year}`);
    total +=
      policy === "best" && observation
        ? tenths(observation.value)
        : annual.get(year).get(`${origin}:${destination}`);
  }
  return total / 10;
}
async function waitFor(predicate, description) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw Error(`Timed out: ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function boot() {
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    url: "https://official-integration.test/",
  });
  const w = dom.window;
  const requests = new Map();
  w.matchMedia = () => ({ matches: true });
  w.requestAnimationFrame = (callback) => w.setTimeout(callback, 0);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.fetch = async (url) => {
    requests.set(url, (requests.get(url) || 0) + 1);
    return {
      ok: fs.existsSync(path.join(root, url)),
      json: async () => json(url),
    };
  };
  w.eval(read("vendor/d3.js"));
  w.eval(
    [
      "provenance.js",
      "data-ui.js",
      "history.js",
      "app.js",
      "color.js",
      "layout.js",
    ]
      .map(
        (file) =>
          read(file) +
          (file === "provenance.js" ? '\nsetDataPolicy("best");\n' : ""),
      )
      .join("\n") +
      `\nwindow.officialTest = {
        state, movement, loadRange, setRange, prepareMovement, paintMovement,
        cumulative, finalCount, colorRatio, movementCorridors, pauseMovement,
        openRouteDetails, showMapTooltip, hideMapTooltip, selectRoute, draw,
        summarizeProvenance, getRouteProvenance, formatSourceValue,
        get policy(){return dataPolicy}, get rows(){return rows},
        get status(){return dataStatus}
      };`,
  );
  const api = w.officialTest;
  const $ = (selector) => w.document.querySelector(selector);
  await waitFor(
    () =>
      api.status === "ready" &&
      $("#movement-focus option[value=AFG]") &&
      $("#data-policy"),
    "official data, map, movement controls and source controls",
  );
  async function setup(origin, direction, peers, start, end) {
    $("#route-close").click();
    $("#movement-focus").value = origin;
    $("#movement-direction").value = direction;
    $("#range-start").value = start;
    $("#range-end").value = end;
    api.movement.peers = peers;
    await api.setRange(start, end);
    assert.equal(await api.prepareMovement(), true, "complete scenario loads");
    assert.equal(api.movement.cursor, end - start + 1);
  }
  async function policy(value) {
    const selector = $("#data-policy");
    selector.value = value;
    await selector.onchange({ target: selector });
    assert.equal(api.policy, value);
    assert.equal(api.status, "ready");
  }
  return { dom, w, $, api, requests, setup, policy };
}

(async () => {
  const app = await boot();
  const { $, api, setup, policy } = app;
  try {
    assert.equal(
      api.policy,
      "best",
      "best available comparison is explicitly selected in this suite",
    );
    assert.equal($("#data-policy").value, "best");
    assert.equal(app.requests.get("data/official/flows.json"), 1);
    assert.ok(
      $("#playback-dock").contains($("#data-quality")),
      "source disclosure stays in visible playback dock",
    );
    $("#focus-map").click();
    assert.ok(app.w.document.body.classList.contains("layout-focus"));
    assert.ok(!$("#data-quality").hidden);
    $("#focus-map").click();
    $("#source-coverage").click();
    await waitFor(
      () => $("#coverage-results section")?.textContent.includes("official"),
      "country source inventory",
    );
    assert.equal(
      app.w.document.querySelectorAll("#coverage-results section").length,
      194,
    );
    assert.match($("#coverage-audit-summary").textContent, /completed for 194 of 194/);
    assert.equal(app.w.document.querySelectorAll(".country-audit-finding").length, 194);
    assert.ok(app.w.document.querySelectorAll("#coverage-results details").length > 0,
      "reviewed national sources expose metric definitions rather than only links");
    $("#coverage-search").value = "Belarus";
    $("#coverage-search").dispatchEvent(new app.w.Event("input"));
    assert.equal(
      app.w.document.querySelectorAll("#coverage-results section").length,
      1,
    );
    assert.match(
      $("#coverage-results").textContent,
      /mirror observations only/,
    );
    assert.ok(
      [...app.w.document.querySelectorAll("#coverage-results a")].every((a) =>
        a.href.startsWith("https://"),
      ),
    );
    $("#coverage-dialog .source-close").click();
    const worldwide = api.summarizeProvenance(api.rows, 1960, 2024);
    assert.equal(worldwide.total, 2433730);
    assert.equal(worldwide.official, official.records.length);
    assert.equal(
      worldwide.modelled,
      worldwide.total - official.records.length,
      "worldwide coverage retains every official and fallback corridor-year",
    );

    api.selectRoute(["AFG", "AUT"]);
    await waitFor(
      () => app.w.document.querySelectorAll(".spark button").length === 13,
      "sidebar source-aware trend bars",
    );
    const bar = Array.from(
      app.w.document.querySelectorAll(".spark button"),
    ).find((b) => b.title.startsWith("2010–2014"));
    assert.ok(bar);
    assert.ok(
      bar.title.includes(
        api.getRouteProvenance("AFG", "AUT", 2010, 2014).label,
      ),
    );
    api.state.route = null;
    api.draw();

    // Published receipt counts win; official zeros and estimates remain distinct.
    const fixtures = [
      ["AFG", "AUT", 2008, 808, "Official statistics"],
      ["AFG", "LIE", 2020, 0, "Official statistics"],
      ["AFG", "DEU", 2020, 7511, "Official estimates"],
      ["AUT", "AFG", 2020, 949, "Official statistics"],
      ["AUT", "BGR", 2020, 615, "Official statistics"],
    ];
    for (const [a, b, year, value, label] of fixtures) {
      const rows = await api.loadRange(year, year);
      assert.equal(rows.find((row) => row[0] === a && row[1] === b)[2], value);
      assert.equal(api.getRouteProvenance(a, b, year, year).label, label);
    }
    assert.equal(
      api.getRouteProvenance("AUT", "BGR", 2020, 2020).years[0].alternatives[0]
        .value,
      1728,
      "the conflicting departure report is retained, never added or averaged",
    );

    // The annual, five-year and compact-series paths agree in both orientations.
    for (const [start, end] of [
      [2008, 2008],
      [2007, 2009],
      [2020, 2024],
    ]) {
      const count = expected("AFG", "AUT", start, end);
      await setup("AFG", "out", ["AUT"], start, end);
      assert.equal(api.movement.total, count);
      assert.equal(api.cumulative("AUT"), count);
      assert.equal(
        api.rows.find((row) => row[0] === "AFG" && row[1] === "AUT")[2],
        count,
      );
      await setup("AUT", "in", ["AFG"], start, end);
      assert.equal(api.movement.total, count);
      assert.equal(api.cumulative("AFG"), count);
    }
    assert.equal(expected("AFG", "AUT", 2020, 2024), 9747);
    assert.equal(
      api.getRouteProvenance("AFG", "AUT", 2007, 2009).label,
      "Mixed official and modelled",
      "a gap year remains modelled rather than becoming official",
    );

    // Multiple origins and worldwide totals include every selected route-year.
    await setup("AUT", "in", ["AFG", "VEN"], 2007, 2009);
    assert.equal(
      tenths(api.movement.total),
      tenths(expected("AFG", "AUT", 2007, 2009)) +
        tenths(expected("VEN", "AUT", 2007, 2009)),
    );
    await setup("AFG", "out", null, 2020, 2024);
    const countryRows = api.rows.filter((row) => row[0] === "AFG");
    assert.equal(countryRows.length, 193);
    assert.equal(
      tenths(api.movement.total),
      countryRows.reduce((sum, row) => sum + tenths(row[2]), 0),
    );
    const summary = api.summarizeProvenance(
      api.movementCorridors(),
      2020,
      2024,
    );
    assert.equal(summary.total, 193 * 5);
    assert.ok(summary.official > 0 && summary.modelled > 0);
    assert.match($("#data-quality").textContent, /Mixed official and modelled/);

    // Numbers and provenance travel together through cards, arrows and details.
    await setup("AFG", "out", ["AUT"], 2008, 2008);
    assert.match($("#movement-count").textContent, /^808 accumulated/);
    assert.match(
      $("#route-list .route-card").textContent,
      /Official statistics/,
    );
    assert.match(
      $("#movement-contributions .destination-card").textContent,
      /Official statistics/,
    );
    api.movement.view = "arrows";
    api.paintMovement();
    const arrow = $(".movement-arrows [data-route=AFG-AUT]");
    assert.ok(arrow, "the official flow is drawn as an arrow");
    assert.equal(arrow.__data__[2], 808);
    assert.match(arrow.getAttribute("aria-label"), /Official statistics/);
    arrow.dispatchEvent(new app.w.MouseEvent("click", { bubbles: true }));
    assert.match($(".movement-tip").textContent, /808/);
    assert.match($(".movement-tip").textContent, /Official statistics/);
    assert.equal(api.movement.focus, "AFG", "inspection keeps the scenario");
    assert.deepEqual(Array.from(api.movement.peers), ["AUT"]);
    await api.openRouteDetails("AFG", "AUT");
    assert.equal($("#route-forward-count").textContent, "808");
    assert.match($(".route-provenance").textContent, /Official statistics/);
    assert.match($(".route-provenance").textContent, /Eurostat|Immigration/);
    const details = $(".annual-provenance");
    details.open = true;
    details.dispatchEvent(new app.w.Event("toggle"));
    await waitFor(
      () => $(".source-values tbody tr"),
      "annual source comparison",
    );
    const cells = $(".source-values tbody tr").querySelectorAll("td");
    assert.equal(cells[0].textContent, "808");
    assert.match(cells[1].textContent, /Official statistic/);
    assert.equal(cells[2].textContent, "≈ 80.4");
    assert.match(
      $("#route-history .cell-quality").textContent,
      /No comparable data/,
    );

    // Policy changes re-resolve both caches and playback; the same values return.
    $("#route-close").click();
    await policy("model");
    assert.equal(api.movement.total, 80.4);
    assert.equal(api.cumulative("AUT"), 80.4);
    assert.equal(
      api.rows.find((row) => row[0] === "AFG" && row[1] === "AUT")[2],
      80.4,
    );
    assert.match($("#data-quality").textContent, /Modelled estimate/);
    await policy("best");
    assert.equal(api.movement.total, 808);
    assert.equal(api.cumulative("AUT"), 808);
    assert.equal(
      api.rows.find((row) => row[0] === "AFG" && row[1] === "AUT")[2],
      808,
      "cached rows are re-resolved without double replacement",
    );

    // Belarus–Poland is a known model gap, not a validated post-2020 headcount.
    await setup("BLR", "out", ["POL"], 2020, 2024);
    assert.equal(api.movement.total, 19476.5);
    assert.equal(api.getRouteProvenance("BLR", "POL", 2020, 2024).official, 0);
    assert.equal($("#data-caution").hidden, false);
    assert.match($("#data-caution").textContent, /not validated/);
    assert.match($("#data-quality").textContent, /Modelled estimate/);
    await api.openRouteDetails("BLR", "POL");
    await waitFor(
      () =>
        $("#route-official-residence-card")?.textContent.includes("133,000"),
      "separate official residence-stock context",
    );
    assert.match(
      $("#route-official-residence-card").textContent,
      /not arrivals/,
    );
    assert.match($("#route-reliability-warning").textContent, /not validated/);
    assert.match(
      $("#route-official-residence-card").textContent,
      /residence permits/,
    );
    assert.equal($("#route-forward-count").textContent, "≈ 19,500");
    assert.equal(
      api.movement.total,
      19476.5,
      "residence stocks never patch flows",
    );
    assert.equal(app.requests.get("data/official/flows.json"), 1);

    console.log(
      "PASS official integration: real official/estimated/zero/secondary receipts, annual and compact-series parity, global mixed totals, count/source UI, model switching, and Belarus–Poland model warning with separate official stocks.",
    );
  } finally {
    api.pauseMovement();
    app.dom.window.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

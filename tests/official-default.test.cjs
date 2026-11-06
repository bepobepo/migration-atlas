/* Official-only default must never silently fill a missing observation with FLOW. */
const { JSDOM } = require("jsdom");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../dist");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const records = json("data/official/flows.json").records;
const observations = new Map(
  records.map((r) => [`${r.origin}:${r.destination}:${r.year}`, r]),
);
const countryMetadata = json("data/countries.json");
const countries = Object.keys(countryMetadata).filter(
  (code) => countryMetadata[code].hasData,
);
function expected(pairs, start, end) {
  let value = 0,
    known = 0;
  for (const [a, b] of pairs)
    for (let year = start; year <= end; year++) {
      const point = observations.get(`${a}:${b}:${year}`);
      if (point) {
        value += Math.round(point.value * 10);
        known++;
      }
    }
  const total = pairs.length * (end - start + 1);
  return { value: value / 10, known, missing: total - known, total };
}
async function waitFor(predicate, description) {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw Error(`Timed out: ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function boot() {
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    url: "https://official-default.test/",
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: true });
  w.requestAnimationFrame = (callback) => w.setTimeout(callback, 0);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.fetch = async (url) => ({
    ok: fs.existsSync(path.join(root, url)),
    json: async () => json(url),
  });
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
      .map(read)
      .join("\n") +
      `
    window.defaultTest = {
      state, movement, loadRange, setRange, prepareMovement, paintMovement,
      cumulative, finalCount, movementCorridors, pauseMovement, inspectMovement,
      openRouteDetails, getRouteProvenance, summarizeProvenance,
      get policy(){return dataPolicy}, get rows(){return rows}, get status(){return dataStatus}
    };`,
  );
  const api = w.defaultTest,
    $ = (selector) => w.document.querySelector(selector);
  await waitFor(
    () =>
      api.status === "ready" &&
      $("#movement-focus option[value=AFG]") &&
      $("#data-policy"),
    "official default initialization",
  );
  async function setup(origin, direction, peers, start, end) {
    $("#route-close").click();
    $("#movement-focus").value = origin;
    $("#movement-direction").value = direction;
    $("#range-start").value = start;
    $("#range-end").value = end;
    api.movement.peers = peers;
    await api.setRange(start, end);
    assert.equal(api.status, "ready");
    await api.prepareMovement();
  }
  async function policy(value) {
    const select = $("#data-policy");
    select.value = value;
    await select.onchange({ target: select });
    assert.equal(api.policy, value);
  }
  return { dom, w, api, $, setup, policy };
}
(async () => {
  const app = await boot(),
    { api, $, setup, policy } = app;
  try {
    assert.equal(
      api.policy,
      "official",
      "official-only is the main display on first load",
    );
    assert.equal($("#data-policy").value, "official");
    assert.deepEqual(
      Array.from($("#data-policy").options, (o) => o.value).sort(),
      ["best", "model", "official"],
    );

    // A complete official observation remains exact; a published zero is not missing.
    await setup("AFG", "out", ["AUT"], 2008, 2008);
    assert.equal(api.movement.total, 808);
    assert.equal(api.cumulative("AUT"), 808);
    assert.match($("#movement-count").textContent, /^808\b/);
    assert.match($("#data-quality").textContent, /Official statistics/);
    await api.openRouteDetails("AFG", "AUT");
    assert.equal($("#route-forward-count").textContent, "808");
    await setup("AFG", "out", ["LIE"], 2020, 2020);
    assert.equal(api.movement.total, 0);
    assert.equal(api.getRouteProvenance("AFG", "LIE", 2020, 2020).official, 1);
    await api.openRouteDetails("AFG", "LIE");
    assert.equal($("#route-forward-count").textContent, "0");

    // A range with one reported year cannot masquerade as a complete range total.
    const partial = expected([["AFG", "AUT"]], 2007, 2009);
    assert.deepEqual(partial, { value: 808, known: 1, missing: 2, total: 3 });
    await setup("AFG", "out", ["AUT"], 2007, 2009);
    assert.equal(api.movement.total, partial.value);
    const partialQuality = api.summarizeProvenance(
      api.movementCorridors(),
      2007,
      2009,
    );
    assert.equal(partialQuality.official, partial.known);
    assert.equal(partialQuality.missing, partial.missing);
    assert.equal(partialQuality.modelled, 0);
    assert.match(
      $("#data-quality").textContent,
      /Partial official|incomplete official/i,
    );
    assert.match(
      $("#movement-count").textContent,
      /reported|partial|available/i,
    );
    await api.openRouteDetails("AFG", "AUT");
    assert.match(
      $("#route-forward-count").textContent,
      /reported|partial|incomplete/i,
    );
    const annual = $(".annual-provenance");
    annual.open = true;
    annual.dispatchEvent(new app.w.Event("toggle"));
    await waitFor(
      () => $(".source-values tbody tr"),
      "annual official coverage values",
    );
    const year2007 = Array.from(
      app.w.document.querySelectorAll(".source-values tbody tr"),
    ).find(
      (tr) =>
        tr.querySelector("th").textContent.includes("2007") &&
        tr.querySelector("th").textContent.includes("Afghanistan"),
    );
    assert.ok(year2007);
    assert.match(
      year2007.querySelector("td").textContent,
      /unavailable|not reported|missing/i,
    );
    assert.doesNotMatch(year2007.querySelector("td").textContent, /\d/);
    assert.equal(
      year2007.querySelectorAll("td")[1].querySelectorAll("a").length,
      0,
      "unavailable official values do not link to FLOW as their selected source",
    );

    // An asymmetric both-direction merge keeps its one reported observation and one gap.
    await setup("AFG", "both", ["EST"], 2020, 2020);
    const combined = expected(
      [
        ["AFG", "EST"],
        ["EST", "AFG"],
      ],
      2020,
      2020,
    );
    assert.deepEqual(combined, { value: 10, known: 1, missing: 1, total: 2 });
    assert.equal(api.movement.total, 10);
    const combinedQuality = api.summarizeProvenance(
      api.movementCorridors(),
      2020,
      2020,
    );
    assert.equal(combinedQuality.official, 1);
    assert.equal(combinedQuality.missing, 1);
    assert.equal(combinedQuality.modelled, 0);
    assert.match($("#route-list .route-card").textContent, /↔/);
    assert.match(
      $("#data-quality").textContent,
      /Partial official|incomplete official/i,
    );

    // Global and incoming totals are sums of imported points, with all partners in the denominator.
    await setup("POL", "in", null, 2020, 2024);
    const incoming = expected(
      countries.filter((code) => code !== "POL").map((code) => [code, "POL"]),
      2020,
      2024,
    );
    assert.equal(api.movement.total, incoming.value);
    const incomingQuality = api.summarizeProvenance(
      api.movementCorridors(),
      2020,
      2024,
    );
    assert.equal(incomingQuality.total, 193 * 5);
    assert.equal(incomingQuality.official, incoming.known);
    assert.equal(incomingQuality.missing, incoming.missing);
    assert.equal(incomingQuality.modelled, 0);
    await setup("AFG", "out", null, 2020, 2024);
    const outgoing = expected(
      countries.filter((code) => code !== "AFG").map((code) => ["AFG", code]),
      2020,
      2024,
    );
    assert.equal(api.movement.total, outgoing.value);
    assert.equal(
      api.summarizeProvenance(api.movementCorridors(), 2020, 2024).total,
      193 * 5,
    );

    // The known Belarus–Poland gap has no model headline, arrow or population zero.
    await setup("BLR", "out", ["POL"], 2020, 2024);
    assert.equal(api.movement.total || 0, 0);
    const unavailable = api.getRouteProvenance("BLR", "POL", 2020, 2024);
    assert.equal(unavailable.official, 0);
    assert.equal(unavailable.missing, 5);
    assert.equal(unavailable.modelled, 0);
    assert.match(
      $("#movement-count").textContent,
      /unavailable|not reported|no official/i,
    );
    assert.doesNotMatch($("#movement-count").textContent, /19,500|30,700/);
    api.inspectMovement("POL");
    assert.match(
      $(".movement-tip").textContent,
      /unavailable|not reported|no official/i,
    );
    assert.doesNotMatch($(".movement-tip").textContent, /\b0%/);
    assert.ok(
      Array.from($(".movement-tip").querySelectorAll("a")).every(
        (a) => !a.href.includes("humdata.org"),
      ),
    );
    await waitFor(
      () => $("#official-residence-card")?.textContent.includes("133,000"),
      "prominent official residence statistic on main page",
    );
    const residence = $("#official-residence-card");
    assert.match(
      residence.textContent,
      /2024-06-30|30 June 2024|June 30, 2024/,
    );
    assert.match(residence.textContent, /permit|residence/i);
    assert.match(residence.textContent, /stock|holders|residents/i);
    assert.match(residence.textContent, /excluding visas/i);
    assert.equal(
      api.movement.total || 0,
      0,
      "a residence stock never becomes a migration-flow total",
    );
    api.movement.cursor = 2;
    api.paintMovement();
    await waitFor(
      () =>
        !$("#official-residence-card") ||
        $("#official-residence-card").hidden ||
        !$("#official-residence-card").textContent.includes("133,000"),
      "residence context follows playback year",
    );
    const before2024 = $("#official-residence-card");
    if (before2024 && !before2024.hidden)
      assert.doesNotMatch(
        before2024.textContent,
        /133,000|124,500|2024-06-30|2024-02-29/,
      );
    api.movement.cursor = 5;
    api.paintMovement();
    await api.openRouteDetails("BLR", "POL");
    assert.match(
      $("#route-forward-count").textContent,
      /unavailable|not reported|no official/i,
    );
    assert.doesNotMatch($("#route-forward-count").textContent, /19,500/);
    assert.match(
      $("#route-reverse-count").textContent,
      /unavailable|not reported|no official/i,
    );

    // Model numbers are available only after the explicit comparison choice.
    $("#route-close").click();
    await policy("model");
    assert.equal(api.movement.total, 19476.5);
    assert.match($("#data-quality").textContent, /Modelled estimate/);
    await policy("best");
    assert.equal(api.movement.total, 19476.5);
    await policy("official");
    assert.equal(api.movement.total || 0, 0);
    assert.equal(api.getRouteProvenance("BLR", "POL", 2020, 2024).modelled, 0);
    assert.doesNotMatch($("#movement-count").textContent, /19,500/);
    assert.equal(
      $("#movement-play").disabled,
      false,
      "calendar playback remains available across official reporting gaps",
    );
    await $("#movement-play").onclick();
    assert.ok(
      api.movement.clock,
      "missing official flows do not prevent dated context playback",
    );
    api.pauseMovement();
    assert.doesNotMatch($("#movement-count").textContent, /19,500/);
    console.log(
      "PASS official default: exact official values and zeroes, explicit incomplete/missing coverage, incoming/global known-only totals, both-direction gaps, main residence stocks and playback dates, and opt-in model comparison.",
    );
  } finally {
    api.pauseMovement();
    app.dom.window.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

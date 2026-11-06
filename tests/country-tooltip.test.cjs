/* Country inspection must lead with current official evidence in every map mode. */
const { JSDOM } = require("jsdom");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../dist");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
async function waitFor(predicate, description) {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw Error("Timed out: " + description);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function boot() {
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    url: "https://country-tooltip.test/",
  });
  const w = dom.window,
    overrides = new Map();
  w.matchMedia = () => ({ matches: true });
  w.requestAnimationFrame = (callback) => w.setTimeout(callback, 0);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.fetch = async (input) => {
    const file = String(input).split("?")[0];
    if (overrides.has(file)) return overrides.get(file)();
    return {
      ok: fs.existsSync(path.join(root, file)),
      json: async () => json(file),
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
      .map(read)
      .join("\n") +
      `
    window.tooltipTest={
      state,movement,prepareMovement,paintMovement,setRange,inspectMovement,pauseMovement,
      get policy(){return dataPolicy},get status(){return dataStatus},
      clearContextCache(){dataUI.context=null;}
    };
  `,
  );
  const api = w.tooltipTest,
    $ = (selector) => w.document.querySelector(selector);
  await waitFor(
    () =>
      api.status === "ready" &&
      $('#movement-focus option[value="AFG"]') &&
      $("#data-policy"),
    "tooltip application initialization",
  );
  async function setup(origin, destination, start, end) {
    $("#route-close").click();
    $("#movement-focus").value = origin;
    $("#movement-direction").value = "out";
    $("#range-start").value = start;
    $("#range-end").value = end;
    api.movement.peers = [destination];
    await api.setRange(start, end);
    assert.equal(await api.prepareMovement(), true);
  }
  async function policy(value) {
    const select = $("#data-policy");
    select.value = value;
    await select.onchange({ target: select });
    assert.equal(api.policy, value);
  }
  function clickCountry(code) {
    const country = Array.from(
      w.document.querySelectorAll("#map .country"),
    ).find((el) => el.__data__.properties.code === code);
    assert.ok(country, "rendered country " + code);
    country.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    assert.equal(
      $(".movement-tip").hidden,
      false,
      "country click opens its inspection",
    );
  }
  function primary() {
    const clone = $(".movement-tip").cloneNode(true);
    clone
      .querySelectorAll("details.tooltip-model-comparison, .tooltip-estimate")
      .forEach((el) => el.remove());
    return clone.textContent;
  }
  return { dom, w, api, $, setup, policy, clickCountry, primary, overrides };
}
(async () => {
  const app = await boot(),
    { api, $, setup, policy, clickCountry, primary } = app;
  try {
    // The actual country-click handler must show the same official dated stock as the main view.
    await setup("BLR", "POL", 2020, 2024);
    clickCountry("POL");
    await waitFor(
      () => $(".tooltip-official-residence")?.textContent.includes("133,000"),
      "official residence statistic inside country tooltip",
    );
    assert.match(primary(), /2024-06-30|30 June 2024/);
    assert.match(primary(), /residence permits|permit holders/i);
    assert.match(primary(), /excluding visas/i);
    assert.match(primary(), /not arrivals|not an arrival/i);
    assert.match(
      $(".tooltip-official-info").textContent,
      /unavailable|not reported|no official/i,
    );
    assert.doesNotMatch(primary(), /19,500|13,700|30,700|\b0%/);
    assert.ok(
      Array.from($(".movement-tip").querySelectorAll("a"))
        .filter(
          (a) => !a.closest(".tooltip-estimate,.tooltip-model-comparison"),
        )
        .every((a) => !a.href.includes("humdata.org")),
      "official inspection does not cite FLOW as its selected source",
    );
    assert.equal(api.movement.focus, "BLR");
    assert.deepEqual(Array.from(api.movement.peers), ["POL"]);

    await waitFor(
      () => $(".tooltip-general-count strong"),
      "visible fallback estimate",
    );
    assert.match($(".tooltip-general-count").textContent, /FLOW model/);
    assert.match($(".tooltip-general-count strong").textContent, /19,500/);
    assert.match(
      $(".tooltip-general-count").textContent,
      /not verified official/,
    );
    // An open tooltip follows the playback year and never borrows a later residence observation.
    api.movement.cursor = 3;
    api.paintMovement();
    await waitFor(
      () =>
        !$(".tooltip-official-residence")?.textContent.includes("133,000") &&
        $(".tooltip-official-residence")?.textContent.includes("28,000"),
      "open tooltip refresh through 2022",
    );
    assert.match(primary(), /2020-08|August 2020/);
    assert.doesNotMatch(primary(), /133,000|124,500|2024-06-30|13,700/);

    // Even when the map shows model comparisons, official evidence remains the tooltip headline.
    await policy("model");
    assert.equal(
      $(".movement-tip").hidden,
      true,
      "switching policy closes the previous country inspection",
    );
    api.movement.cursor = 3;
    api.paintMovement();
    clickCountry("POL");
    await waitFor(
      () => $(".tooltip-official-residence")?.textContent.includes("28,000"),
      "official residence statistic in model map mode",
    );
    assert.doesNotMatch(primary(), /13,700|0\.03653%|FLOW model fallback/);
    const comparison = $(".tooltip-model-comparison");
    assert.ok(
      comparison,
      "chosen model mode has a separate comparison disclosure",
    );
    assert.equal(comparison.open, false, "model comparison is collapsed");
    assert.match(comparison.textContent, /13,700|13,704\.8/);
    assert.equal(
      api.policy,
      "model",
      "inspection does not change the selected map policy",
    );

    // A current official flow also wins over a very different model figure.
    await setup("AFG", "AUT", 2008, 2008);
    assert.equal(
      api.movement.total,
      80.4,
      "model map values are unchanged by official inspection",
    );
    clickCountry("AUT");
    await waitFor(
      () => $(".tooltip-official-info")?.textContent.includes("808"),
      "published official arrival count",
    );
    assert.match($(".tooltip-official-info").textContent, /\b808\b/);
    assert.doesNotMatch(primary(), /80\.4|≈ 80\.4/);
    assert.match($(".tooltip-model-comparison").textContent, /80\.4/);
    assert.equal($(".tooltip-model-comparison").open, false);
    assert.equal(api.movement.total, 80.4);
    for (const mode of ["best", "official"]) {
      await policy(mode);
      clickCountry("AUT");
      await waitFor(
        () => $(".tooltip-official-info")?.textContent.includes("808"),
        "official tooltip value in " + mode + " map mode",
      );
      assert.match($(".tooltip-official-info").textContent, /\b808\b/);
      assert.doesNotMatch(primary(), /80\.4/);
    }
    assert.equal(
      $(".tooltip-model-comparison"),
      null,
      "default official mode does not display a model comparison",
    );

    // Inspecting an unselected country cannot silently change selection or invent a zero flow.
    clickCountry("USA");
    assert.match(
      primary(),
      /not selected|outside|no migration is displayed|not part|no displayed/i,
    );
    assert.doesNotMatch(primary(), /\b0%|0 cumulative/);
    assert.equal(api.movement.focus, "AFG");
    assert.deepEqual(Array.from(api.movement.peers), ["AUT"]);

    // A delayed response for an older inspection cannot overwrite a new country tooltip.
    await setup("BLR", "POL", 2020, 2024);
    api.clearContextCache();
    let release;
    app.overrides.set(
      "data/official/context.json",
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              json: async () => json("data/official/context.json"),
            });
        }),
    );
    clickCountry("POL");
    await waitFor(() => release, "deferred residence source request");
    await setup("AFG", "AUT", 2008, 2008);
    clickCountry("AUT");
    await waitFor(
      () => $(".tooltip-official-info")?.textContent.includes("808"),
      "new inspection while earlier response is pending",
    );
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.match($(".movement-tip h3").textContent, /Austria/);
    assert.match($(".tooltip-official-info").textContent, /\b808\b/);
    assert.doesNotMatch(primary(), /133,000|Belarusian citizens/);
    $(".movement-tip > button").click();
    assert.equal($(".movement-tip").hidden, true);
    // Range shortcuts cannot leave an inspection reading the previous applied years.
    app.overrides.delete("data/official/context.json");
    await setup("BLR", "POL", 2020, 2024);
    clickCountry("POL");
    await api.setRange(2024, 2024);
    assert.equal(
      $(".movement-tip").hidden,
      true,
      "changing visible dates clears the old inspection",
    );
    await api.inspectMovement("POL");
    await waitFor(
      () => $(".tooltip-official-residence")?.textContent.includes("133,000"),
      "inspection applies the visible single year",
    );
    assert.equal(api.movement.start, 2024);
    assert.equal(api.movement.end, 2024);
    assert.match($(".movement-tip .tooltip-period").textContent, /2024/);
    assert.doesNotMatch(primary(), /28,000/);
    // Routes in focus open the detailed two-way window directly for both directions.
    await setup("MAR", "FRA", 2000, 2024);
    await $("#route-list .route-card").onclick();
    assert.equal($("#route-dialog").open, true);
    assert.match($("#route-view-title").textContent, /Morocco → France/);
    assert.equal($("#route-range-start").value, "2000");
    assert.equal($("#route-range-end").value, "2024");
    assert.ok($("#route-forward-count"));
    assert.ok($("#route-reverse-count"));
    assert.equal($(".movement-tip").hidden, true);
    await setup("FRA", "MAR", 2000, 2024);
    $("#movement-direction").value = "in";
    await api.prepareMovement();
    await $("#route-list .route-card").onclick();
    assert.equal($("#route-dialog").open, true);
    assert.match($("#route-view-title").textContent, /Morocco → France/);
    assert.equal(api.movement.focus, "FRA");
    assert.equal(api.movement.direction, "in");
    $("#route-close").click();
    await setup("DZA", "FRA", 2000, 2024);
    api.movement.cursor = 13;
    api.paintMovement();
    clickCountry("FRA");
    await waitFor(
      () => $(".tooltip-general-count strong"),
      "Algeria-France estimate through2012",
    );
    const values = json("data/series/out/DZA.json").peers.FRA;
    const estimate = values.slice(40, 53).reduce((a, b) => a + b, 0) / 10;
    assert.equal(
      $(".tooltip-general-count strong").textContent,
      "≈ " + estimate.toLocaleString("en", { maximumSignificantDigits: 3 }),
    );
    assert.match($(".tooltip-general-count").textContent, /through 2012/);
    console.log(
      "PASS country tooltip: official flow and residence headlines in all map modes, collapsed model comparison, playback dates, non-mutating inspection, and stale-response protection.",
    );
  } finally {
    api.pauseMovement();
    app.dom.window.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

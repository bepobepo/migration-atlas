const { JSDOM } = require("jsdom");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../dist");
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function boot(preferences) {
  const dom = new JSDOM(
      fs.readFileSync(path.join(root, "index.html"), "utf8"),
      { runScripts: "outside-only", url: "https://migration.test/" },
    ),
    w = dom.window;
  w.matchMedia = () => ({ matches: true });
  w.requestAnimationFrame = (fn) => w.setTimeout(fn, 0);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.fetch = async (url) => ({
    ok: fs.existsSync(path.join(root, url)),
    json: async () => JSON.parse(fs.readFileSync(path.join(root, url), "utf8")),
  });
  if (preferences)
    w.localStorage.setItem(
      "migration-atlas.sections.v1",
      JSON.stringify(preferences),
    );
  w.eval(fs.readFileSync(path.join(root, "vendor/d3.js"), "utf8"));
  w.eval(
    ["history.js", "app.js", "color.js", "layout.js"]
      .map((f) => fs.readFileSync(path.join(root, f), "utf8"))
      .join("\n") +
      "\nwindow.layoutTest={movement,prepareMovement,paintMovement,pauseMovement,runMovement};",
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  return {
    dom,
    w,
    $: (selector) => w.document.querySelector(selector),
    api: w.layoutTest,
  };
}
(async () => {
  const a = await boot();
  try {
    const { $, api } = a;
    assert.equal($(".map-wrap").nextElementSibling.id, "playback-dock");
    for (const selector of [
      "#movement-play",
      "#movement-restart",
      "#movement-speed",
      "#movement-cursor",
      "#movement-count",
      "#movement-legend",
      "#movement-status",
      "#movement-year",
    ])
      assert.ok($("#playback-dock").contains($(selector)), selector);
    assert.ok($("#section-selection").contains($("#range-form")));
    assert.ok($("#section-selection").contains($("#movement-focus")));
    assert.equal($("#section-selection").open, true);
    assert.equal($("#section-history").open, true);
    for (const selector of [
      "#section-contributions",
      "#section-migration-details",
      "#section-routes",
      "#section-methodology",
    ])
      assert.equal($(selector).open, false, selector);
    assert.ok($("#section-history > summary").contains($("#event-count")));
    assert.equal(a.w.document.querySelectorAll("#movement-play").length, 1);
    $("#movement-focus").value = "VEN";
    $("#movement-direction").value = "out";
    $("#range-start").value = "1985";
    $("#range-end").value = "2024";
    api.movement.peers = ["USA"];
    await api.prepareMovement();
    await flush();
    assert.match($("#scenario-summary").textContent, /Venezuela/);
    assert.match($("#scenario-summary").textContent, /1985–2024/);
    assert.match($("#scenario-summary").textContent, /United States/);
    const clock = 777;
    api.movement.clock = clock;
    api.movement.cursor = 12;
    const before = {
      cursor: api.movement.cursor,
      focus: api.movement.focus,
      view: api.movement.view,
    };
    const originalPlay = $("#movement-play");
    $("#section-contributions").open = true;
    $("#section-selection").open = false;
    $("#focus-map").click();
    await flush();
    assert.equal(a.w.document.body.classList.contains("layout-focus"), true);
    assert.equal($("#focus-map").getAttribute("aria-pressed"), "true");
    assert.equal(api.movement.cursor, before.cursor);
    assert.equal(api.movement.clock, clock);
    assert.equal(api.movement.focus, before.focus);
    assert.equal($("#movement-play"), originalPlay);
    assert.equal($("#section-contributions").open, true);
    $("#focus-map").click();
    await flush();
    assert.equal(a.w.document.body.classList.contains("layout-focus"), false);
    assert.equal($("#section-contributions").open, true);
    assert.equal($("#section-selection").open, false);
    assert.equal(api.movement.clock, clock);
    api.movement.clock = null;
    $("#movement-cursor").value = 4;
    $("#movement-cursor").dispatchEvent(new a.w.Event("input"));
    assert.equal(api.movement.cursor, 4, "moved controls retain handlers");
    $("#section-methodology").open = true;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(
      JSON.parse(a.w.localStorage.getItem("migration-atlas.sections.v1"))[
        "section-methodology"
      ],
      true,
    );
  } finally {
    a.api.pauseMovement();
    a.dom.window.close();
  }
  const b = await boot({
    "section-selection": false,
    "section-history": false,
    "section-routes": true,
  });
  try {
    assert.equal(b.$("#section-selection").open, false);
    assert.equal(b.$("#section-history").open, false);
    assert.equal(b.$("#section-routes").open, true);
    assert.equal(b.w.document.body.classList.contains("layout-focus"), false);
  } finally {
    b.api.pauseMovement();
    b.dom.window.close();
  }
  console.log(
    "PASS layout: persistent playback dock, section defaults/preferences, focus/restore and playback/selection preservation, live summary, original control handlers.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

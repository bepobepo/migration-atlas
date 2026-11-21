// Exercise country navigation through the same controls and files used by the atlas.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const dist = path.resolve(__dirname, "../dist");
const read = (file) => fs.readFileSync(path.join(dist, file), "utf8");

async function waitFor(ready) {
  const end = Date.now() + 10000;
  while (!ready()) {
    if (Date.now() > end) throw Error("Timed out waiting for the country controls");
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

(async () => {
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    url: "https://country-paths.test/",
  });
  try {
    const w = dom.window;
    const $ = (selector) => w.document.querySelector(selector);
    const all = (selector) => [...w.document.querySelectorAll(selector)];
    w.matchMedia = () => ({ matches: true });
    w.fetch = async (file) => ({
      ok: fs.existsSync(path.join(dist, file)),
      json: async () => JSON.parse(read(file)),
    });
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true };
    w.HTMLDialogElement.prototype.close = function () {
      this.open = false;
      this.dispatchEvent(new w.Event("close"));
    };
    w.eval(read("vendor/d3.js"));
    w.eval(["history.js", "provenance.js", "data-ui.js", "app.js", "color.js"]
      .map(read).join("\n") + "\nwindow.testState = {state, movement};");
    await waitFor(() => $("#movement-focus option[value=BEL]") && $("#data-policy"));
    const { movement, state } = w.testState;
    $("button[data-dir=in]").click();
    $("#country").value = "BEL";
    await $("#country").onchange({ target: $("#country") });
    assert.equal(state.dir, "in");
    assert.equal(movement.direction, "in");
    assert.equal($("#movement-focus").value, "BEL");

    $("#movement-cursor").value = 1;
    $("#movement-cursor").dispatchEvent(new w.Event("input"));
    assert.match($("#movement-year").textContent, /2020/);
    const contributions = all("#movement-contributions button").map((b) => b.textContent);
    const rank = (name) => contributions.findIndex((text) => text.startsWith(name + " · "));
    assert.match(contributions[rank("Netherlands")], /8,241/);
    assert.match(contributions[rank("Ukraine")], / · 8 · /);
    assert.match(contributions[rank("Romania")], /unavailable/i);
    assert.ok(rank("Netherlands") < rank("Ukraine"));
    assert.ok(rank("Ukraine") < rank("Romania"));
    $("#search").value = "Ukraine";
    $("#search").dispatchEvent(new w.Event("input"));
    const route = $("#route-list .route-card");
    assert.match(route.textContent, /Ukraine → Belgium · 8 ·/);
    route.focus();
    await route.onclick();
    assert.equal($("#route-forward-count").textContent, "8");
    assert.equal($("#route-range-end").value, "2020");
    assert.equal($("#range-end").value, "2024");
    assert.equal(movement.cursor, 1);
    await $("#route-reverse").onclick();
    assert.match($("#route-view-title").textContent, /Belgium → Ukraine/);
    assert.equal($("#route-reverse-count").textContent, "8");
    $("#route-close").click();
    assert.equal(w.document.activeElement, route);
    assert.equal(state.query, "ukraine");
    assert.equal(movement.end, 2024);
    assert.equal(movement.focus, "BEL");

    await route.onclick();
    $("#route-range-start").value = "2015";
    $("#route-range-end").value = "2019";
    await $("#route-range-form").onsubmit({ preventDefault() {} });
    assert.equal($("#period").textContent, "2015–2019");
    assert.equal($("#range-end").value, "2019");
    assert.equal($("#route-range-end").value, "2019");
    assert.equal(movement.end, 2019);
    assert.equal(movement.focus, "BEL");
    assert.equal(movement.direction, "in");
    await $("#route-all-destinations").onclick();
    assert.equal($("#route-dialog").open, false);
    assert.equal($("#country").value, "UKR");
    assert.equal($("#movement-direction").value, "out");
    assert.equal($("#pair-destination").value, "everywhere");
    assert.equal(movement.peers, null);

    $("#country").value = "";
    await $("#country").onchange({ target: $("#country") });
    assert.equal(movement.series, null);
    assert.equal(state.country, "");
    assert.equal(state.dir, "both");
    assert.equal(w.document.body.classList.contains("movement-active"), false);
    const spain = all("#map .country").find((path) => path.__data__.properties.code === "ESP");
    spain.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => movement.focus === "ESP" && movement.series);
    assert.equal($("#country").value, "ESP");
    console.log("PASS country navigation, current-year rankings, route inspection, dates and world reset.");
  } finally {
    dom.window.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

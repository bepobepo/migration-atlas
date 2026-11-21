const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "../dist");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
async function until(test) {
  const end = Date.now() + 15000;
  while (!test()) {
    if (Date.now() > end) throw Error("Timed out waiting for country overview");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function test() {
  const dom = new JSDOM(read("index.html"), {runScripts: "outside-only", url: "https://atlas.test/"});
  const w = dom.window;
  const get = id => w.document.getElementById(id);
  const event = type => new w.Event(type, {bubbles: true, cancelable: true});
  const failures = new Set();
  w.fetch = async file => ({
    ok: !failures.has(file) && fs.existsSync(path.join(root, file)),
    json: async () => JSON.parse(read(file)),
  });
  w.requestAnimationFrame = fn => w.setTimeout(fn, 0);
  w.matchMedia = () => ({matches: true});
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(event("close")); };
  w.eval(read("vendor/d3.js"));
  const scripts = ["provenance.js", "data-ui.js", "history.js", "app.js", "color.js", "layout.js", "overview.js", "residents.js"];
  w.eval(scripts.map(read).join("\n") + "\nwindow.overviewTest = {movement,state,applyCountryScenario};");
  const api = w.overviewTest;
  function selectCountry(code) {
    get("country").value = code;
    get("country").dispatchEvent(event("change"));
  }
  try {
    await until(() => !get("country").disabled && get("movement-focus").options.length > 190);
    assert(get("overview-country").contains(get("country")));
    assert.equal(get("section-selection").open, false);
    assert.equal(get("overview-summary").hidden, true);
    assert.match(get("country-overview").textContent, /Latest flow year · 2024/);
    get("overview-in").click();
    assert.equal(w.document.activeElement, get("country"));
    selectCountry("DEU");
    await until(() => api.movement.series && get("overview-out-basis").textContent.includes("route-years"));
    assert.equal(api.movement.direction, "in");
    assert.match(get("overview-period").textContent, /Germany.*2020–2024/);
    assert.match(get("overview-in-total").textContent, /5,564,742/);
    assert.equal(get("overview-in").getAttribute("aria-pressed"), "true");
    get("overview-dates").click();
    assert(get("section-selection").open);
    assert.equal(w.document.activeElement, get("range-start"));
    get("range-start").value = 2015;
    get("range-start").dispatchEvent(event("input"));
    assert.match(get("overview-dates").textContent, /2020–2024/);
    get("range-form").dispatchEvent(event("submit"));
    await until(() => api.movement.series && get("overview-period").textContent.includes("2015–2024"));

    await api.applyCountryScenario({focus:"ESP",direction:"out",peers:["ROU"],start:2020,end:2024});
    await until(() => get("overview-out-total").textContent.includes("reported"));
    assert.match(get("overview-period").textContent, /Spain · All partners · 2020–2024/);
    assert.equal(get("overview-out").getAttribute("aria-pressed"), "false");
    get("overview-out").click();
    await until(() => api.movement.series && api.movement.peers === null && api.movement.direction === "out");
    get("overview-compare").open = true;
    await until(() => get("overview-rankings").querySelectorAll("section").length === 2);
    const current = get("overview-rankings").querySelector("section");
    assert(current.textContent.includes("2020–2024"));
    assert(get("overview-rankings").textContent.includes("2015–2019"));
    const route = [...current.querySelectorAll("button")].find(button => button.textContent.includes("231,388"));
    assert.ok(route, "Spain → Romania ranking agrees with route detail");
    route.click();
    await until(() => get("route-dialog").open && get("route-forward-count").textContent.includes("231,388"));
    get("route-close").click();
    get("overview-residents").click();
    assert(get("residents-dialog").open);
    assert.match(get("residents-dialog").querySelector("h2").textContent, /Spain/);
    get("residents-dialog").close();

    const range = {direction:"in",start:1960,end:2024};
    await api.applyCountryScenario({focus:"FRA",...range});
    await until(() => get("overview-rankings").textContent.includes("would begin before 1960"));
    assert.equal(get("overview-rankings").querySelectorAll("section").length, 1);

    failures.add("data/series/out/NPL.json");
    selectCountry("NPL");
    await until(() => !get("overview-retry").hidden);
    assert.equal(get("overview-out-total").textContent, "Unavailable");
    failures.clear();
    get("overview-retry").click();
    await until(() => get("overview-out-basis").textContent.includes("route-years"));
    assert(get("overview-retry").hidden);

    selectCountry("");
    await until(() => !api.movement.focus && get("overview-summary").hidden);
    get("overview-residents").click();
    selectCountry("FRA");
    assert(get("residents-dialog").open);
    assert.match(get("residents-dialog").querySelector("h2").textContent, /France/);
    await until(() => api.movement.series?.country === "FRA");
    console.log("PASS overview: shared country and dates, totals and source coverage, direction-first exploration, ranked period comparison and route details, resident action, recovery.");
  } finally {
    await new Promise(resolve => setTimeout(resolve, 50));
    dom.window.close();
  }
}
test().catch(error => { console.error(error); process.exitCode = 1; });

// Exercise the release page in script-tag order, using the same controls as a visitor.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const dist = path.join(__dirname, "../dist");
const read = (file) => fs.readFileSync(path.join(dist, file), "utf8");

async function until(condition, description) {
  const deadline = Date.now() + 15000;
  while (!condition()) {
    if (Date.now() > deadline) throw Error("Timed out waiting for " + description);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

async function main() {
  const dom = new JSDOM(read("index.html"), {
    url: "https://atlas.test/", runScripts: "outside-only",
  });
  const w = dom.window;
  const $ = (selector) => w.document.querySelector(selector);
  const $$ = (selector) => Array.from(w.document.querySelectorAll(selector));
  const event = (element, type) => element.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
  function change(selector, value, type = "change") {
    const element = $(selector);
    element.value = String(value);
    assert.equal(element.value, String(value), selector + " has the requested value");
    event(element, type);
  }

  w.matchMedia = () => ({ matches: false });
  w.requestAnimationFrame = (callback) => w.setTimeout(callback, 0);
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  w.fetch = async (url) => {
    const file = new URL(url, w.location).pathname;
    const exists = fs.existsSync(path.join(dist, file));
    return { ok: exists, status: exists ? 200 : 404, json: async () => JSON.parse(read(file)) };
  };
  for (const script of $$("script[src]")) {
    const file = new URL(script.src).pathname;
    vm.runInContext(read(file), dom.getInternalVMContext(), { filename: file });
  }

  function setRange(start, end, inDialog = false) {
    const prefix = inDialog ? "#route-range-" : "#range-";
    change(prefix + "start", start, "input");
    change(prefix + "end", end, "input");
    event($(prefix + "form"), "submit");
  }
  async function waitForRoute(origin, destination, count) {
    await until(() => $("#route-dialog").open &&
      $("#route-dialog").dataset.origin === origin && $("#route-dialog").dataset.destination === destination &&
      $("#route-forward-count")?.textContent.includes(count), origin + " to " + destination + " dialog");
  }
  async function closeRoute() {
    $("#route-close").click();
    await until(() => !$("#route-dialog").open, "route dialog to close");
  }

  try {
    await until(() => $("#movement-focus option[value=DEU]") && $("#route-list button") &&
      $("#discover-routes [data-route='ESP-ROU']"), "published page initialization");

    // A visitor can choose the task before the country. Both directions have a
    // separately labelled period total and the playback-year list has its own ranking.
    $("#overview-in").click();
    assert.equal(w.document.activeElement, $("#country"));
    change("#country", "DEU");
    await until(() => $("#route-list button")?.textContent.includes("→ Germany") &&
      /\d/.test($("#overview-out-total").textContent), "German country overview");
    assert.match($("#overview-period").textContent, /Germany.*2020–2024/);
    assert.match($("#overview-in-total").textContent, /\d/);
    assert.match($("#overview-in-basis").textContent, /reported/);
    change("#movement-cursor", 1, "input");
    assert.match($("#movement-year").textContent, /2020/);
    assert.match($("#route-list button").textContent, /Romania.*83,164/);
    assert.match($("#movement-contributions button").textContent, /Romania.*83,164/);

    // Compare leading destinations in two equal-length periods. Inspecting the
    // earlier ranking must leave the map selection and its dates intact.
    change("#country", "ESP");
    $("#overview-out").click();
    await until(() => $("#route-list button")?.textContent.includes("Spain → Romania"), "Spanish destinations");
    $("#overview-compare summary").click();
    await until(() => $("#overview-rankings section:nth-of-type(2) li button"), "previous-period leaders");
    const periods = $$("#overview-rankings section");
    assert.deepEqual(periods.map((period) => period.querySelector("h3").textContent), ["2020–2024", "2015–2019"]);
    const previous = periods[1].querySelector(".overview-rank-grid > div:nth-child(2) button");
    const displayedCount = previous.textContent.split(" · ").at(-1);
    previous.click();
    await until(() => $("#route-dialog").open && $("#route-forward-count")?.textContent === displayedCount, "earlier-period detail figure");
    assert.equal($("#route-range-start").value, "2015");
    assert.equal($("#route-range-end").value, "2019");
    await closeRoute();
    assert.equal($("#range-start").value, "2020");

    // Explicitly broadening the earlier route must keep the years being inspected.
    previous.click();
    await until(() => $("#route-dialog").open && $("#route-range-start").value === "2015", "reopen earlier route");
    $("#route-all-destinations").click();
    await until(() => !$("#route-dialog").open && $("#scenario-summary").textContent.includes("2015–2019") &&
      $("#movement-count").textContent.includes("2015–2019"), "all destinations in the inspected earlier period");
    assert.equal($("#movement-all").checked, true);
    assert.equal($("#country").value, "ESP");
    setRange(2020, 2024);
    await until(() => $("#route-list button")?.textContent.includes("231,388"), "restore current Spanish routes");

    $("#section-routes summary").click();
    $("#route-list button").click();
    await waitForRoute("ESP", "ROU", "231,388");
    assert.match($("#route-reverse-count").textContent, /185,328/);
    setRange(2010, 2012, true);
    await waitForRoute("ESP", "ROU", "155,807");
    $("#route-reverse").click();
    await until(() => $("#route-view-title")?.textContent.includes("Romania → Spain"), "reverse inspection");
    await closeRoute();
    assert.equal($("#country").value, "ESP");
    assert.equal($("#movement-all").checked, true);
    assert.match($("#movement-count").textContent, /2010–2012/);
    assert.match($("#overview-period").textContent, /2010–2012/);
    assert($$("#route-list button").some((b) => /Spain → Romania.*155,807/.test(b.textContent)));

    // Resident population is an independent, dated UN stock snapshot. Check a
    // published number, a prior snapshot, its denominator and an uncovered area.
    change("#country", "FRA");
    $("#overview-residents").click();
    await until(() => $(".residents-total")?.textContent === "9,186,757", "French resident population");
    assert.match($(".residents-source a").href, /^https:\/\/www\.un\.org\//);
    assert.equal($(".residents-year").value, "2024");
    change(".residents-search", "Algeria", "input");
    assert.equal($(".residents-table tbody tr").textContent, "Algeria1,405,23515.3%");
    change(".residents-year", "1990");
    assert.equal($(".residents-total").textContent, "5,890,023");
    assert.match($(".residents-table tbody tr").textContent, /1,344,293/);
    $(".residents-close").click();
    change("#country", "GRL");
    $("#overview-residents").click();
    await until(() => $(".residents-body").textContent.includes("unavailable for Greenland"), "uncovered resident origins");
    $(".residents-close").click();

    change("#country", "VEN");
    $("#overview-out").click();
    setRange(2013, 2013);
    await until(() => $("#movement-count").textContent.includes("2013–2013"), "2013 timeline");
    assert.doesNotMatch($("#events").textContent, /Political, economic and humanitarian crisis/);
    setRange(2018, 2018);
    await until(() => $("#events").textContent.includes("Political, economic and humanitarian crisis"), "sourced Venezuelan event");
    assert($("#events a[href^='https://']"));
    change("#country", "KIR");
    $("#overview-in").click();
    await until(() => /No sourced historical context/.test($("#events").textContent), "explicit historical gap");

    const discovery = $("#discover-routes [data-route='NPL-ROU']");
    discovery.click();
    await waitForRoute("NPL", "ROU", "42,531");
    assert.equal($("#data-policy").value, "official");
    assert.equal($("#country").value, "NPL");
    assert.equal($("#movement-all").checked, false);
    assert.equal($("#range-start").value, "2021");
    assert.equal($("#range-end").value, "2024");
    $("#route-reverse").click();
    await until(() => $("#route-dialog").dataset.origin === "ROU", "reverse discovery route");
    $("#route-all-destinations").click();
    await until(() => !$("#route-dialog").open && $("#scenario-summary").textContent.includes("Romania → Everywhere") &&
      $("#route-list button")?.textContent.includes("Romania →"), "all destinations for the inspected origin");
    assert.equal($("#movement-all").checked, true);
    assert.equal($("#range-start").value, "2021");

    console.log("PASS published country journeys, period comparison, ranked routes, resident stocks, history and discovery.");
  } finally {
    dom.window.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

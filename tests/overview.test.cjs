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
  const pending = new Map();
  w.fetch = async file => {
    if (pending.has(file)) await pending.get(file);
    return {
      ok: !failures.has(file) && fs.existsSync(path.join(root, file)),
      json: async () => JSON.parse(read(file)),
    };
  };
  w.requestAnimationFrame = fn => w.setTimeout(fn, 0);
  w.matchMedia = () => ({matches: true});
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(event("close")); };
  const scripts = [...w.document.querySelectorAll("script[src]")].map(node => new URL(node.src).pathname.slice(1));
  w.eval(scripts.map(read).join("\n;") + "\nwindow.overviewTest = {movement,state,applyCountryScenario};");
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
    await until(() => get("national-immigration").textContent.includes("5,826,876"));
    assert.match(get("national-emigration").textContent, /2,480,042/);
    assert.match(get("national-net").textContent, /3,346,834/);
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
    assert.match(get("overview-period").textContent, /Spain · Partner-country flows · 2020–2024/);
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

    await api.applyCountryScenario({focus:"AUS",direction:"out",peers:null,start:2024,end:2024});
    await until(() => !get("national-figures").hidden && get("national-net").textContent.includes("330,458"));
    assert.match(get("national-immigration").textContent, /595,820/);
    assert.match(get("national-emigration").textContent, /265,362/);
    assert.match(get("national-sources").textContent, /Australian Bureau of Statistics/);

    await api.applyCountryScenario({focus:"AZE", direction:"in", peers:null, start:2005, end:2007});
    await until(() => !get("national-figures").hidden && /Azerbaijan/.test(get("national-heading").textContent));
    assert.match(get("national-immigration").textContent, /Unavailable/i);
    assert.match(get("national-emigration").textContent, /Unavailable/i);
    assert.match(get("national-net-basis").textContent, /estimate/i);
    await api.applyCountryScenario({focus:"UKR", direction:"out", peers:null, start:2020, end:2021});
    await until(() => !get("national-figures").hidden && /Ukraine/.test(get("national-heading").textContent));
    assert.match(get("national-emigration").textContent, /Unavailable/i);
    assert.match(get("national-net-basis").textContent, /estimate/i);

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

    // Published December LTIM estimates and bilateral reports answer separate questions.
    const uk = {focus:"GBR", direction:"in", peers:null, start:2020, end:2024};
    const ukFile = "data/national/countries/GBR.json";
    failures.add(ukFile);
    await api.applyCountryScenario(uk);
    await until(() => !get("overview-national").hidden && !get("national-retry").hidden);
    assert(get("national-figures").hidden);
    await until(() => get("overview-in-total").textContent.includes("578,309"));
    assert.match(get("overview-out-total").textContent, /553,192/);
    failures.delete(ukFile);
    let releaseUK;
    pending.set(ukFile, new Promise(resolve => { releaseUK = resolve; }));
    get("national-retry").click();
    await api.applyCountryScenario({...uk, focus:"DEU"});
    await until(() => !get("national-figures").hidden && get("national-immigration").textContent.includes("5,826,876"));
    pending.delete(ukFile);
    releaseUK();
    await w.loadNational("GBR", 2020, 2024);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.match(get("national-immigration").textContent, /5,826,876/, "A late ONS response must not replace Germany's figures");

    await api.applyCountryScenario(uk);
    await until(() => !get("national-figures").hidden && get("national-net").textContent.includes("2,630,000"));
    assert(!get("overview-national").hidden);
    assert(get("overview-national").compareDocumentPosition(get("overview-in-total")) &
      w.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.match(get("national-immigration").textContent, /5,460,000/);
    assert.match(get("national-emigration").textContent, /2,830,000/);
    const annualRows = [...get("national-years").querySelectorAll("tbody tr")];
    assert.equal(annualRows.length, 5);
    for (const [year, number] of [[2020,"93,000"],[2021,"467,000"],[2022,"891,000"],[2023,"848,000"],[2024,"331,000"]]) {
      assert(annualRows.some(row => row.textContent.includes(String(year)) &&
        [...row.cells].some(cell => cell.textContent.includes(number))), "ONS net for December " + year);
    }
    await api.applyCountryScenario({...uk, start:2024, peers:["ESP"]});
    await until(() => get("national-net").textContent.includes("331,000"));
    assert.match(get("national-immigration").textContent, /1,012,000/);
    assert.match(get("national-emigration").textContent, /680,000/);
    assert.match(get("national-attribution").textContent, /21 May 2026/);
    assert.match(get("national-net-basis").textContent, /revised/i);
    // ONS covers the entire UK even when the map selects one partner. Subtracting its rounded components gives 332,000.
    assert.equal(get("national-years").querySelectorAll("tbody tr").length, 1);
    for (const mode of ["model", "best", "official"]) {
      const policy = get("data-policy");
      policy.value = mode;
      await policy.onchange({target:policy});
      await until(() => !get("national-figures").hidden && get("national-net").textContent.includes("331,000"));
    }
    await api.applyCountryScenario({...uk, focus:"ESP", start:2023, end:2023});
    await until(() => get("national-immigration").textContent.includes("1,250,991"));
    assert.match(get("national-emigration").textContent, /608,695/);
    assert.match(get("national-net").textContent, /642,296/);
    assert.match(get("national-years").textContent, /2023/);

    get("national-full").click();
    await until(() => get("national-years").querySelectorAll("tbody tr").length === 75);
    assert.match(get("national-immigration").textContent, /Unavailable for full range/);
    assert.match(get("national-immigration-basis").textContent, /of 75 years/);
    assert.match(get("national-net-basis").textContent, /mixed/i);
    assert.match(get("overview-period").textContent, /2023/);
    assert.equal(get("national-net").textContent.includes("642,296"), false);
    const priorText = get("national-net").textContent;
    get("national-start").value = 1949;
    get("national-range-form").dispatchEvent(event("submit"));
    assert(!get("national-date-error").hidden);
    assert.equal(get("national-net").textContent, priorText);
    assert(!get("national-sources").textContent.includes("FLOW model"));
    assert(get("national-sources").querySelector('a[href*="un.org"]'));

    await api.applyCountryScenario({focus:"NPL", direction:"out", peers:null, start:2023, end:2024});
    await until(() => !get("national-figures").hidden && /[-−]811,064/.test(get("national-net").textContent));
    assert.match(get("national-net-basis").textContent, /projection/i);
    assert.match(get("national-immigration").textContent, /Unavailable/i);
    assert.match(get("national-emigration").textContent, /Unavailable/i);
    get("national-start").value = 1950;
    get("national-end").value = 1950;
    get("national-range-form").dispatchEvent(event("submit"));
    await until(() => get("national-net").textContent.includes("+3,863"));
    assert.match(get("national-heading").textContent + get("national-years").textContent, /1950/);
    assert.match(get("overview-period").textContent, /2023–2024/, "National history preserves the map dates");
    get("national-use-map").click();
    await until(() => /[-−]811,064/.test(get("national-net").textContent));

    await api.applyCountryScenario({focus:"KIR",direction:"in",peers:null,start:1960,end:1960});
    await until(() => !get("national-figures").hidden && get("national-net").textContent.trim() === "0");
    assert.match(get("national-net-basis").textContent, /estimate/i);
    assert.match(get("national-immigration").textContent, /Unavailable/i);
    assert.match(get("national-emigration").textContent, /Unavailable/i);
    await api.applyCountryScenario({...uk, focus:"DEU", start:2024});
    selectCountry("GRL");
    await until(() => !get("national-figures").hidden && /[-−]284/.test(get("national-net").textContent));
    assert.match(get("national-net-basis").textContent, /projection/i);
    assert.match(get("overview-in-total").textContent, /Unavailable/i);
    selectCountry("ATA");
    await until(() => /unavailable/i.test(get("national-status").textContent));
    assert(get("national-figures").hidden, "Uncovered areas cannot display the last territory's totals");
    assert(get("national-dates").hidden);
    selectCountry("");
    await until(() => !api.movement.focus && get("overview-summary").hidden);
    get("overview-residents").click();
    selectCountry("FRA");
    assert(get("residents-dialog").open);
    assert.match(get("residents-dialog").querySelector("h2").textContent, /France/);
    await until(() => api.movement.series?.country === "FRA");
    await assert.rejects(w.loadNational("GBR", 1949, 1950));
    await assert.rejects(w.loadNational("GBR", 2024, 2023));
    // A malformed source cannot be cached as a usable national series.
    const fetch = w.fetch;
    let attempts = 0;
    try {
      w.fetch = async file => {
        const response = await fetch(file);
        if (file !== "data/national/countries/AGO.json") return response;
        attempts++;
        if (attempts > 1) return response;
        const malformed = await response.json();
        malformed.years[0].net.sourceIds = ["absent-source"];
        return {ok:true, json: async () => malformed};
      };
      await assert.rejects(w.loadNational("AGO", 1950, 1950));
      const [single, overlapping] = await Promise.all([
        w.loadNational("AGO", 1950, 1950), w.loadNational("AGO", 1950, 1951),
      ]);
      assert.equal(attempts, 2, "Overlapping ranges share one validated country download");
      assert.equal(single.years.length, 1);
      assert.equal(overlapping.years.length, 2);
      assert.equal(single.years[0].net.value, overlapping.years[0].net.value);
    } finally {
      w.fetch = fetch;
    }
    console.log("PASS overview: shared country and dates, source coverage, ranked period comparison, resident action, worldwide national figures, independent historical range, source basis, missing gross flows, zero and recovery.");
  } finally {
    await new Promise(resolve => setTimeout(resolve, 50));
    dom.window.close();
  }
}
test().catch(error => { console.error(error); process.exitCode = 1; });

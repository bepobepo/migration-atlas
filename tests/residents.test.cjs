const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

(async () => {
  const dom = new JSDOM('<button id="open">Who lives here?</button>', { runScripts: "outside-only" });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  const $ = selector => w.document.querySelector(selector);
  const data = {
    destination: "BEL", name: "Belgium", years: [2020, 2024], total: [0, 16000], other: [null, 100],
    origins: [
      {code: "FRA", name: "France", values: [0, 4000]}, {code: "POL", name: "Poland", values: [null, null]},
      {code: "NLD", name: "Netherlands", values: [0, 0]}, {code: "DEU", name: "Germany", values: [0, 1]},
    ],
    basis: "Country of birth.", coverageNote: "Selected origin observations.", source: {name: "Test source", url: "https://example.org"},
  };
  let resolveSlowRequest;
  let fail = true;
  let pauseCalls = 0;
  w.pauseMovement = () => { pauseCalls++; };
  w.fetch = async url => {
    const code = url.split("/").pop().split(".")[0];
    if (code === "BEL") return { ok:true, json:async () => data };
    if (code === "USA") return new Promise(resolve => { resolveSlowRequest = resolve; });
    if (code === "FRA" && fail) throw Error("Fetch failed");
    if (["DZA", "ISR", "JPN", "BEN", "SOM", "PSE"].includes(code))
      return {ok: true, json: async () => require("../dist/data/residents/" + code + ".json")};
    return {status:404, ok:false};
  };
  w.eval(fs.readFileSync(path.resolve(__dirname, "../dist/residents.js"), "utf8"));
  $("#open").focus();
  const slow = w.openResidents("USA");
  await w.openResidents("BEL");
  resolveSlowRequest({status:404, ok:false});
  await slow;
  assert.equal(pauseCalls, 2);
  assert.match($("#residents-heading").textContent, /Belgium/);
  assert.equal($(".residents-total").textContent, "16,000");
  assert($(".residents-population").hidden);
  const texts = () => Array.from(w.document.querySelectorAll(".residents-table tbody tr"), e => e.textContent);
  assert.deepEqual(texts(), ["France4,00025%","Other origins1000.6%","Germany1<0.1%","Netherlands00%","PolandUnavailable—"]);
  $(".residents-search").value = "NLD";
  $(".residents-search").dispatchEvent(new w.Event("input"));
  assert.deepEqual(texts(), ["Netherlands00%"]);
  $(".residents-year").value = "2020";
  $(".residents-year").dispatchEvent(new w.Event("change"));
  assert.deepEqual(texts(), ["Netherlands0—"]);
  assert.equal($(".residents-total").textContent, "0");
  assert.equal($("#residents-dialog").open, true);
  $(".residents-close").click();
  assert.equal(w.document.activeElement.id, "open");
  await w.openResidents("FRA");
  assert.match($(".residents-body").textContent, /Retry/);
  fail = false;
  $(".residents-body button").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.match($(".residents-body").textContent, /unavailable for FRA/);
  await w.openResidents("DZA");
  $(".residents-search").value = "France";
  $(".residents-search").dispatchEvent(new w.Event("input"));
  assert.equal($(".residents-year").value, "2024");
  assert.equal($("tbody tr td").textContent, "563");
  assert.match($(".residents-date").textContent, /1 July 2024/);
  assert.match($(".residents-source a").href, /^https:\/\/www.un.org\//);
  await w.openResidents("ISR");
  assert.equal($(".residents-total-label").textContent, "Migrant residents (birthplace-based estimate)");
  assert.match($(".residents-definition").textContent, /became a citizen/);
  assert.match($(".residents-definition").textContent, /refugee/);
  assert.equal($(".residents-total").textContent, "2,091,569");
  assert.match($(".residents-population").textContent, /22\.3% of all residents.*projection of 9,387,021/);
  assert.match($("caption").textContent, /2,091,569 migrant residents/);
  $(".residents-search").value = "Morocco";
  $(".residents-search").dispatchEvent(new w.Event("input"));
  assert.deepEqual(texts(), ["Morocco190,6079.1%"]);
  $(".residents-year").value = "2020";
  $(".residents-year").dispatchEvent(new w.Event("change"));
  assert.match($(".residents-population").textContent, /23\.5% of all residents.*estimate of 8,800,376/);
  assert.match($("caption").textContent, /2,068,830 migrant residents/);
  for (const [country, description] of [["JPN", /uses citizenship here/],
    ["BEN", /both birthplace and citizenship/], ["SOM", /direct data were unavailable/]]) {
    await w.openResidents(country);
    assert.match($(".residents-definition").textContent, description);
  }
  await w.openResidents("PSE");
  assert.equal($(".residents-total-label").textContent, "Residents born abroad");
  assert.equal($(".residents-country-note").hidden, false);
  assert.match($(".residents-country-note").textContent, /East Jerusalem/);
  dom.window.close();
  console.log("PASS resident country selection, dated snapshots, fixed share denominator, search, missing/zero handling, retry, stale requests and focus return.");
})().catch(err => { console.error(err); process.exitCode = 1; });

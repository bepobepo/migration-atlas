const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../dist");
const data = JSON.parse(fs.readFileSync(path.join(root, "data/events.json")));
const vm = require("node:vm");
const context = {};
vm.runInNewContext(
  fs.readFileSync(path.join(root, "history.js"), "utf8") +
    "\nthis.api={eventScope,eventLabel,historyMatches,renderHistoryCards};",
  context,
);
const { historyMatches, eventScope } = context.api;
const match = (corridors, start = 1985, end = 2024) =>
  historyMatches(data, { corridors, start, end });
const ids = (records) => Array.from(records, (r) => r.id);
assert.deepEqual(ids(match([["VEN", "USA"]])), [19, 18]);
assert.deepEqual(ids(match([["VEN", "USA"]], 1985, 2013)), []);
assert.deepEqual(ids(match([["USA", "VEN"]])), []);
assert.deepEqual(
  ids(
    match([
      ["RUS", "USA"],
      ["VEN", "USA"],
      ["VEN", "COL"],
    ]),
  ),
  [19, 18],
);
assert.deepEqual(ids(match([["RUS", "USA"]])), []);
assert.deepEqual(ids(match([["VEN", "ESP"]])), [15, 19, 18]);
assert.deepEqual(ids(match([["VEN", "USA"]], 2014, 2023)), [18]);
assert.deepEqual(ids(match([["VEN", "USA"]], 2014, 2013)), []);
assert.deepEqual(ids(match([["BLR", "POL"]], 2020, 2024)), [16]);
assert.deepEqual(ids(match([["SDN", "TCD"]], 2023, 2024)), [20]);
assert.deepEqual(ids(match([["SDN", "TCD"]], 2020, 2022)), []);
assert.deepEqual(ids(match([["TCD", "SDN"]], 2023, 2024)), []);
assert.deepEqual(ids(match([["AFG", "PAK"]], 2021, 2024)), [21]);
assert.deepEqual(ids(match([["SYR", "TUR"]], 2011, 2016)), [22]);
assert.deepEqual(ids(match([["UKR", "DEU"]], 2022, 2024)), [23]);
assert.deepEqual(ids(match([["MMR", "BGD"]], 2017, 2017)), [24]);
assert.deepEqual(ids(match([["BGD", "MMR"]], 2017, 2017)), []);
assert.deepEqual(ids(match([["MMR", "BGD"]], 2016, 2016)), []);
assert.deepEqual(ids(match([["SSD", "UGA"]], 2016, 2017)), [25]);
assert.deepEqual(ids(match([["ETH", "SDN"]], 2020, 2020)), [26]);
assert.deepEqual(ids(match([["NIC", "CRI"]], 2018, 2018)), [27]);
assert.deepEqual(ids(match([["CRI", "NIC"]], 2018, 2018)), []);
assert.deepEqual(ids(match([["HTI", "USA"]], 2024, 2024)), [28]);
assert.deepEqual(ids(match([["HTI", "USA"]], 2023, 2023)), []);
assert.deepEqual(ids(match([["RWA", "TZA"]], 1994, 1994)), [29]);
assert.deepEqual(ids(match([["CUB", "USA"]], 1980, 1980)), [30]);
assert.deepEqual(ids(match([["VNM", "USA"]], 1975, 1975)), [31]);
assert.equal(eventScope({}), "route");
assert.equal(
  data[18].text.includes("2024"),
  false,
  "generic card must not leak 2024 developments into earlier playback",
);
const destinationContext = {
  id: 100,
  scope: "destination-country",
  country: "USA",
  start: 2020,
  end: 2024,
  title: "Destination context",
};
assert.deepEqual(
  ids(
    historyMatches([...data, destinationContext], {
      corridors: [["VEN", "USA"]],
      start: 2020,
      end: 2024,
    }),
  ),
  [19, 18, 100],
);
assert.deepEqual(
  ids(
    historyMatches([destinationContext], {
      corridors: [["USA", "VEN"]],
      start: 2020,
      end: 2024,
    }),
  ),
  [],
);
(async () => {
  const dom = new JSDOM(
      fs.readFileSync(path.join(root, "index.html"), "utf8"),
      { runScripts: "outside-only", url: "https://atlas.test/" },
    ),
    w = dom.window;
  w.matchMedia = () => ({ matches: true });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(path.join(root, url), "utf8")),
  });
  w.eval(fs.readFileSync(path.join(root, "vendor/d3.js"), "utf8"));
  w.eval(
    fs.readFileSync(path.join(root, "provenance.js"), "utf8") +
      "\n" +
      fs.readFileSync(path.join(root, "data-ui.js"), "utf8") +
      '\nsetDataPolicy("model");\n' +
      fs.readFileSync(path.join(root, "history.js"), "utf8") +
      "\n" +
      fs.readFileSync(path.join(root, "app.js"), "utf8") +
      "\nwindow.testHistory={state,setRange,renderRouteContext,selectEvent,get events(){return events}};",
  );
  const flush = () => new Promise((r) => setImmediate(r));
  await flush();
  await flush();
  const a = w.testHistory,
    $ = (selector) => w.document.querySelector(selector);
  await a.setRange(1985, 2024);
  const box = w.document.createElement("div");
  a.renderRouteContext(box, "VEN", "USA");
  assert.equal(box.querySelectorAll(".route-context-card").length, 2);
  assert.match(box.textContent, /Country context available/);
  assert.match(box.textContent, /Context in Venezuela/);
  assert.doesNotMatch(
    box.textContent,
    /Spain|No route-specific historical account/,
  );
  assert.match(box.textContent, /2014–2024/);
  await a.setRange(1985, 2013);
  a.renderRouteContext(box, "VEN", "USA");
  assert.equal(box.querySelectorAll(".route-context-card").length, 0);
  assert.match(
    box.textContent,
    /No route-specific historical account or country context/,
  );
  await a.setRange(1985, 2023);
  a.renderRouteContext(box, "VEN", "USA");
  assert.equal(box.querySelectorAll(".route-context-card").length, 1);
  assert.doesNotMatch(box.textContent, /Election uncertainty/);
  const before = JSON.stringify(a.state);
  a.selectEvent(a.events[18]);
  assert.equal(JSON.stringify(a.state), before);
  assert.equal($("#modal").open, true);
  assert.match(
    $("#modal-content").textContent,
    /Political, economic and humanitarian crisis/,
  );
  assert.equal(w.document.querySelectorAll(".story-line").length, 0);
  $("#modal").close();
  $("#all-events").click();
  assert.equal(w.document.querySelectorAll("#catalog button").length, data.length);
  assert.doesNotMatch($("#catalog").textContent, /undefined/);
  dom.window.close();
  console.log(
    "PASS historical context: directed country/route scopes, deduplication, chronology, Venezuela–USA/Spain, reverse and incoming subsets, rendering and non-mutating generic navigation.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

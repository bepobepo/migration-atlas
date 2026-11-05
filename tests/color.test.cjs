const { JSDOM } = require("jsdom"),
  fs = require("fs"),
  assert = require("node:assert/strict"),
  path = require("path");
const root = path.resolve(__dirname, "../dist");
(async () => {
  const dom = new JSDOM(fs.readFileSync(root + "/index.html", "utf8"), {
      runScripts: "outside-only",
      url: "https://test.local",
    }),
    w = dom.window;
  w.matchMedia = () => ({ matches: true });
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.fetch = async (url) => ({
    ok: fs.existsSync(root + "/" + url),
    json: async () => JSON.parse(fs.readFileSync(root + "/" + url)),
  });
  w.eval(fs.readFileSync(root + "/vendor/d3.js", "utf8"));
  w.eval(
    fs.readFileSync(root + "/app.js", "utf8") +
      "\n" +
      fs.readFileSync(root + "/color.js", "utf8") +
      "\nwindow.api={movement,prepareMovement,paintMovement,colorRatio,migrationOpacity,cumulative,selectedPeers,runMovement,pauseMovement,inspectMovement};",
  );
  await new Promise((r) => setTimeout(r, 200));
  const a = w.api,
    $ = (s) => w.document.querySelector(s);
  async function setup(focus, dir, peers, start, end) {
    $("#movement-focus").value = focus;
    $("#movement-direction").value = dir;
    a.movement.peers = peers;
    $("#range-start").value = start;
    $("#range-end").value = end;
    assert.equal(await a.prepareMovement(), true);
    a.movement.cursor = end - start + 1;
    a.paintMovement();
  }
  await setup("RUS", "out", ["ISR"], 2020, 2024);
  assert.equal(a.movement.total, 14592.4);
  assert.equal(a.cumulative("ISR"), 14592.4);
  assert.ok(a.colorRatio("RUS", 14592.4) < a.colorRatio("ISR", 14592.4));
  assert.equal(a.migrationOpacity("RUS", 14592.4, true), 0.12);
  assert.equal(a.migrationOpacity("ISR", 14592.4, false), 0.88);
  const cursor = a.movement.cursor;
  $("#movement-metric").value = "population";
  $("#movement-metric").dispatchEvent(new w.Event("change"));
  assert.equal(a.movement.cursor, cursor);
  assert.ok(a.migrationOpacity("RUS", 14592.4, true) > 0.8);
  a.inspectMovement("ISR");
  assert.equal(a.movement.peers[0], "ISR");
  assert.equal(a.movement.focus, "RUS");
  await setup("RUS", "out", null, 2020, 2024);
  assert.equal(Math.round(a.movement.total * 10), 27988907);
  await setup("ISR", "in", ["RUS", "UKR", "FRA"], 2020, 2024);
  assert.equal(a.selectedPeers().length, 3);
  assert.equal(
    a.movement.total,
    a.selectedPeers().reduce((s, p) => s + a.cumulative(p), 0),
  );
  await setup("COL", "out", ["VEN"], 2020, 2024);
  assert.ok(a.movement.total >= 0);
  await setup("PSE", "out", ["ISR"], 1960, 1960);
  assert.equal(a.colorRatio("PSE", 1), null);
  assert.equal(a.migrationOpacity("PSE", 1, true), null);
  await setup("LIE", "out", null, 1960, 2024);
  assert.ok(a.colorRatio("LIE", a.movement.total) > 100);
  assert.equal(a.migrationOpacity("LIE", a.movement.total, true), 0.12);
  await setup("RUS", "out", ["ISR"], 2021, 2021);
  a.movement.cursor = 0;
  a.runMovement();
  a.pauseMovement();
  assert.equal(a.movement.clock, null);
  $("#movement-cursor").value = 1;
  $("#movement-cursor").dispatchEvent(new w.Event("input"));
  assert.equal(a.movement.cursor, 1);
  $("#movement-restart").click();
  assert.equal(a.movement.cursor, 0);
  a.movement.speed = 4;
  a.runMovement();
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(a.movement.cursor, 1);
  assert.equal(a.movement.clock, null);
  const originalFetch = w.fetch;
  w.fetch = async (url) =>
    url.includes("series/")
      ? {
          ok: true,
          json: async () => ({ country: "RUS", peers: { ISR: [0] } }),
        }
      : originalFetch(url);
  assert.equal(await a.prepareMovement(), false);
  assert.equal(a.movement.series, null);
  assert.match($("#movement-status").textContent, /Complete data unavailable/);
  w.fetch = originalFetch;
  console.log(
    "PASS color playback: exact Russia/Israel and Everywhere totals, multiple origins, global corridor, scales, missing baselines, >100%, inspection, pause, scrub and restart.",
  );
  dom.window.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

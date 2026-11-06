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
    fs.readFileSync(path.join(root, "provenance.js"), "utf8") +
      "\n" +
      fs.readFileSync(path.join(root, "data-ui.js"), "utf8") +
      '\nsetDataPolicy("model");\n' +
      fs.readFileSync(root + "/history.js", "utf8") +
      "\n" +
      fs.readFileSync(root + "/app.js", "utf8") +
      "\n" +
      fs.readFileSync(root + "/color.js", "utf8") +
      "\nwindow.api={movement,prepareMovement,paintMovement,colorRatio,migrationOpacity,migrationFill,cumulative,selectedPeers,runMovement,pauseMovement,inspectMovement,modal,selectEvent,get events(){return events},state};",
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
  assert.equal(a.migrationOpacity("RUS", 14592.4, true), 0);
  assert.equal(a.migrationOpacity("ISR", 14592.4, false), 1);
  const cursor = a.movement.cursor;
  $("#movement-metric").value = "population";
  $("#movement-metric").dispatchEvent(new w.Event("change"));
  assert.equal(a.movement.cursor, cursor);
  assert.equal(a.migrationFill("RUS", 14592.4), "#ffffff");
  a.inspectMovement("ISR");
  assert.equal(a.movement.peers[0], "ISR");
  assert.equal(a.movement.focus, "RUS");
  await setup("RUS", "out", null, 2020, 2024);
  assert.equal(Math.round(a.movement.total * 10), 27988907);
  await setup("ISR", "in", ["RUS", "UKR", "FRA"], 2020, 2024);
  assert.equal(a.selectedPeers().length, 3);
  assert.equal(
    w.document.querySelector(".movement-label").textContent,
    "Israel",
  );
  assert.equal(w.document.querySelectorAll(".endpoint-label").length, 1);
  assert.equal(
    a.movement.total,
    a.selectedPeers().reduce((s, p) => s + a.cumulative(p), 0),
  );
  await setup("COL", "out", ["VEN"], 2020, 2024);
  assert.ok(a.movement.total >= 0);
  await setup("PSE", "out", ["ISR"], 1960, 1960);
  assert.equal(a.colorRatio("PSE", 1), null);
  assert.equal(a.migrationOpacity("PSE", 1, true), 0);
  await setup("LIE", "out", null, 1960, 2024);
  assert.ok(a.colorRatio("LIE", a.movement.total) > 100);
  assert.equal(a.migrationOpacity("LIE", a.movement.total, true), 0);
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
  // Strong blue encoding is shared by both views, with a fixed full-range domain.
  $("#movement-metric").value = "volume";
  $("#movement-metric").dispatchEvent(new w.Event("change"));
  await setup("RUS", "out", null, 2020, 2024);
  assert.equal(a.movement.cursor, 5); // selection previews full-range totals
  const final = (peer) =>
    a.movement.series.peers[peer].slice(60, 65).reduce((s, v) => s + v, 0) / 10;
  const positive = a
    .selectedPeers()
    .filter((p) => final(p) > 0)
    .sort((a, b) => final(b) - final(a));
  const zero = a.selectedPeers().find((p) => final(p) === 0);
  assert.equal(a.movement.maximum, final(positive[0]));
  assert.equal(a.migrationFill("RUS", a.movement.total), "#ffffff");
  assert.equal(a.migrationFill(zero, 0), "#ffffff");
  assert.equal(
    w.document.querySelector(`.migration-fill [data-country="${zero}"]`),
    null,
  );
  const luminance = (fill) => {
    const rgb = fill.match(/\d+/g).map(Number);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  assert.ok(
    luminance(a.migrationFill(positive[0], final(positive[0]))) <
      luminance(a.migrationFill(positive.at(-1), final(positive.at(-1)))),
  );
  const maximum = a.movement.maximum,
    target = positive[0],
    fill = a.migrationFill(target, final(target));
  $("#movement-view").value = "arrows";
  $("#movement-view").dispatchEvent(new w.Event("change"));
  assert.equal(a.movement.cursor, 5);
  assert.ok(w.document.querySelectorAll(".movement-arrows .arc").length <= 30);
  assert.equal(
    w.document
      .querySelector('.migration-fill [data-country="RUS"]')
      .getAttribute("fill"),
    "#ffffff",
  );
  const hit = w.document.querySelector(".movement-arrows .arc-hit");
  hit.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert.equal(a.movement.focus, "RUS");
  assert.equal(a.movement.peers, null);
  assert.equal(a.movement.maximum, maximum);
  $("#show-all-routes").click();
  $("#search").value = "Israel";
  $("#search").dispatchEvent(new w.Event("input"));
  assert.equal(a.movement.maximum, maximum);
  assert.equal(a.migrationFill(target, final(target)), fill);
  $("#search").value = "";
  $("#search").dispatchEvent(new w.Event("input"));
  $("#movement-cursor").value = 1;
  $("#movement-cursor").dispatchEvent(new w.Event("input"));
  assert.equal(a.movement.maximum, maximum);
  assert.equal(a.movement.cursor, 1);
  const route = w.document.querySelector(
    '.movement-arrows .arc-hit[data-route="RUS-ISR"]',
  );
  assert.ok(route);
  assert.equal(route.__data__[2], a.cumulative("ISR"));
  await setup("ISR", "in", ["RUS", "UKR", "FRA"], 2020, 2024);
  assert.equal(
    w.document
      .querySelector('.migration-fill [data-country="ISR"]')
      .getAttribute("fill"),
    "#ffffff",
  );
  assert.notEqual(
    w.document
      .querySelector('.migration-fill [data-country="RUS"]')
      .getAttribute("fill"),
    "#ffffff",
  );
  await setup("ISR", "in", ["PSE"], 1960, 1960);
  $("#movement-metric").value = "population";
  $("#movement-metric").dispatchEvent(new w.Event("change"));
  assert.equal(a.migrationFill("PSE", 1), "url(#population-missing)");
  await setup("ISR", "in", ["MLT"], 2020, 2024);
  if (a.movement.total > 0)
    assert.ok(
      w.document.querySelector('.migration-fill circle[data-country="MLT"]'),
    );
  await setup("RUS", "both", ["ISR"], 2020, 2024);
  const out = a.movement.directionSeries.out.peers.ISR.slice(60, 65).reduce(
    (s, v) => s + v,
    0,
  );
  const incoming = a.movement.directionSeries.in.peers.ISR.slice(60, 65).reduce(
    (s, v) => s + v,
    0,
  );
  assert.equal(Math.round(a.movement.total * 10), out + incoming);
  assert.ok(
    w.document.querySelector('.movement-arrows .arc-hit[data-route="ISR-RUS"]'),
  );
  assert.ok(
    w.document.querySelector('.movement-arrows .arc-hit[data-route="RUS-ISR"]'),
  );
  const reverseHit = w.document.querySelector(
    '.movement-arrows .arc-hit[data-route="ISR-RUS"]',
  );
  reverseHit.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert.match(
    w.document.querySelector(".movement-tip h3").textContent,
    /Israel → Russia/,
  );

  await setup("VEN", "out", ["USA"], 1985, 2024);
  assert.match(
    $("#events").textContent,
    /Political, economic and humanitarian crisis/,
  );
  assert.match($("#events").textContent, /2024/);
  assert.doesNotMatch($("#events").textContent, /Spain/);
  $("#movement-cursor").value = 2023 - 1985 + 1;
  $("#movement-cursor").dispatchEvent(new w.Event("input"));
  assert.equal(w.document.querySelector('[data-event-id="19"]'), null);
  $("#movement-cursor").value = 2013 - 1985 + 1;
  $("#movement-cursor").dispatchEvent(new w.Event("input"));
  assert.equal(w.document.querySelector('[data-event-id="18"]'), null);
  const scenarioBefore = JSON.stringify({
    focus: a.movement.focus,
    peers: a.movement.peers,
    cursor: a.movement.cursor,
    start: a.movement.start,
    end: a.movement.end,
  });
  const stateBefore = JSON.stringify(a.state);
  a.runMovement();
  a.selectEvent(a.events[15]);
  assert.equal(a.movement.clock, null);
  assert.equal($("#modal").open, true);
  assert.match($("#modal-content").textContent, /Spain/);
  assert.equal(JSON.stringify(a.state), stateBefore);
  assert.equal(
    JSON.stringify({
      focus: a.movement.focus,
      peers: a.movement.peers,
      cursor: a.movement.cursor,
      start: a.movement.start,
      end: a.movement.end,
    }),
    scenarioBefore,
  );
  $("#modal").close();
  a.runMovement();
  a.modal("<p>Source information</p>");
  assert.equal(a.movement.clock, null);
  $("#modal").close();
  await setup("RUS", "out", ["ISR"], 2020, 2024);
  $("#movement-play").click();
  assert.equal(a.movement.cursor, 0);
  assert.equal(
    w.document.querySelector('.migration-fill [data-country="ISR"]'),
    null,
  );
  a.pauseMovement();
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
  assert.match($("#movement-count").textContent, /No complete total loaded/);
  assert.equal($("#movement-cursor").disabled, true);
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

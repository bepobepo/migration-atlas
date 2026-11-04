const { JSDOM } = require("jsdom");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const tests = [];
const test = (name, run) => tests.push({ name, run });
const root = path.resolve(__dirname, "../dist");
const flush = () => new Promise((r) => setImmediate(r));
async function boot(overrides = {}) {
  const dom = new JSDOM(
      fs.readFileSync(path.join(root, "index.html"), "utf8"),
      { runScripts: "outside-only", url: "https://atlas.test/" },
    ),
    w = dom.window;
  const timers = new Map();
  let tid = 0;
  w.matchMedia = () => ({ matches: true });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.setInterval = (fn) => {
    timers.set(++tid, fn);
    return tid;
  };
  w.clearInterval = (id) => timers.delete(id);
  w.fetch = async (url) => {
    if (overrides[url]) return overrides[url]();
    return {
      ok: true,
      json: async () =>
        JSON.parse(fs.readFileSync(path.join(root, url), "utf8")),
    };
  };
  w.eval(fs.readFileSync(path.join(root, "vendor/d3.js"), "utf8"));
  w.eval(
    fs.readFileSync(
      process.env.APP_UNDER_TEST || path.join(root, "app.js"),
      "utf8",
    ) +
      "\nwindow.testAPI={state,cache,selectRoute,selectEvent,setYear,draw,get rows(){return rows},get centers(){return centers}};",
  );
  await flush();
  await flush();
  return {
    w,
    dom,
    api: w.testAPI,
    timers,
    $: (s) => w.document.querySelector(s),
    change: (selector, value, type = "change") => {
      const el = w.document.querySelector(selector);
      el.value = value;
      el.dispatchEvent(new w.Event(type));
    },
  };
}
test("initial map has 30 valid directional routes and 18 navigable stories", async () => {
  const a = await boot();
  try {
    assert.equal(a.$("#period").textContent, "2020–2024");
    assert.equal(a.w.document.querySelectorAll(".arc").length, 30);
    assert.ok(
      [...a.w.document.querySelectorAll(".arc")].every(
        (p) => p.getAttribute("d") && !p.getAttribute("d").includes("NaN"),
      ),
    );
    a.$("#all-events").click();
    assert.equal(a.w.document.querySelectorAll("#catalog button").length, 18);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("small countries have readable names and visible routes", async () => {
  const a = await boot();
  try {
    assert.equal(a.$('option[value="MLT"]').textContent, "Malta");
    a.change("#country", "MLT");
    assert.ok(a.api.rows.some((r) => r[0] === "MLT"));
    assert.ok(
      [...a.w.document.querySelectorAll(".arc")].every((p) =>
        p.getAttribute("d"),
      ),
    );
    assert.ok(
      Object.values(a.api.centers).every((p) => p.every(Number.isFinite)),
    );
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("Play rewinds at the last interval and advances; pause stops playback", async () => {
  const a = await boot();
  try {
    a.$("#play").click();
    await flush();
    assert.equal(a.api.state.year, 1950);
    [...a.timers.values()][0]();
    await flush();
    assert.equal(a.api.state.year, 1955);
    a.$("#play").click();
    assert.equal(a.timers.size, 0);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("direction changes cannot retain a selected route outside the filter", async () => {
  const a = await boot();
  try {
    a.change("#country", "ESP");
    a.api.selectRoute(a.api.rows.find((r) => r[0] === "ESP" && r[1] === "COL"));
    a.$('[data-dir="in"]').click();
    assert.ok(
      [...a.w.document.querySelectorAll(".arc")].every(
        (el) => el.__data__[1] === "ESP",
      ),
    );
    assert.equal(a.api.state.route, null);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("story navigation clears search and shows an unweighted 1950s connection", async () => {
  const a = await boot();
  try {
    a.change("#search", "Belarus", "input");
    a.$("#all-events").click();
    a.$("#catalog button").click();
    await flush();
    assert.equal(a.$("#search").value, "");
    assert.equal(a.api.state.year, 1950);
    assert.equal(a.w.document.querySelectorAll(".arc").length, 0);
    assert.ok(a.$(".story-line").getAttribute("d"));
    assert.match(a.$("#map-status").textContent, /no comparable/);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("repeated detail renders produce exactly 13 trend bars and stable map groups", async () => {
  const a = await boot();
  try {
    const r = a.api.rows.find((r) => r[0] === "COL" && r[1] === "ESP");
    a.api.selectRoute(r);
    a.api.draw();
    a.api.draw();
    await flush();
    await flush();
    assert.equal(a.w.document.querySelectorAll(".spark button").length, 13);
    const groups = a.w.document.querySelectorAll("#map g").length;
    for (let i = 0; i < 5; i++) a.api.draw();
    assert.equal(a.w.document.querySelectorAll("#map g").length, groups);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("an old failed timeline request cannot erase a newer successful period", async () => {
  let reject;
  const a = await boot({
    "data/2015.json": () => new Promise((r, j) => (reject = j)),
  });
  try {
    const old = a.api.setYear(2015);
    assert.equal(
      a.w.document.querySelectorAll(".arc").length,
      0,
      "old-period arrows must disappear while loading",
    );
    await a.api.setYear(2020);
    reject(Error("old request failed"));
    await old;
    assert.equal(a.api.rows.length, 14792);
    assert.equal(a.$("#period").textContent, "2020–2024");
    assert.doesNotMatch(a.$("#map-status").textContent, /Could not/);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("current request failure is distinguished from no data and can be retried", async () => {
  let fail = true;
  const data = JSON.parse(
    fs.readFileSync(path.join(root, "data/2015.json"), "utf8"),
  );
  const a = await boot({
    "data/2015.json": async () => {
      if (fail) throw Error("offline");
      return { ok: true, json: async () => data };
    },
  });
  try {
    await a.api.setYear(2015);
    assert.match(a.$("#coverage").textContent, /could not be loaded/);
    fail = false;
    await a.api.setYear(2015);
    assert.equal(a.api.rows.length, 14792);
    assert.doesNotMatch(a.$("#coverage").textContent, /could not/);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("zero estimates stay in list without becoming arrows", async () => {
  const a = await boot();
  try {
    const r = a.api.rows.find((r) => r[2] === 0);
    a.api.selectRoute(r);
    await flush();
    assert.match(a.$(".big-value").textContent, /Estimated zero/);
    assert.ok(
      [...a.w.document.querySelectorAll(".arc")].every(
        (p) => p.__data__[2] > 0,
      ),
    );
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("zoom controls work without changing selected period or migration values", async () => {
  const a = await boot();
  try {
    a.$("#zin").click();
    assert.match(a.$("#map > g").getAttribute("transform"), /scale\(1.5\)/);
    a.$("#reset").click();
    assert.match(a.$("#map > g").getAttribute("transform"), /scale\(1\)/);
    assert.equal(a.api.state.year, 2020);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});

test("controls wait for required assets instead of throwing during startup", async () => {
  let resolve;
  const a = await boot({
    "data/countries.json": () => new Promise((r) => (resolve = r)),
  });
  try {
    assert.equal(a.$("#play").disabled, true);
    assert.equal(a.$("#all-events").disabled, true);
    resolve({
      ok: true,
      json: async () =>
        JSON.parse(
          fs.readFileSync(path.join(root, "data/countries.json"), "utf8"),
        ),
    });
    await flush();
    await flush();
    assert.equal(a.$("#play").disabled, false);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("arrow clicks open a tooltip with the selected route, period, estimate and source", async () => {
  const a = await boot();
  try {
    const hit = a.$(".arc-hit");
    const [origin, destination, value] = hit.__data__;
    const metadata = JSON.parse(
      fs.readFileSync(path.join(root, "data/countries.json")),
    );
    hit.dispatchEvent(
      new a.w.MouseEvent("click", {
        bubbles: true,
        detail: 1,
        clientX: 250,
        clientY: 180,
      }),
    );
    assert.equal(a.$("#migration-tooltip").hidden, false);
    assert.equal(
      a.$(".tooltip-route").textContent,
      `${metadata[origin].name} → ${metadata[destination].name}`,
    );
    assert.equal(a.$(".tooltip-period").textContent, "2020–2024");
    assert.equal(
      a.$(".tooltip-value").textContent,
      "≈ " +
        new Intl.NumberFormat("en", { maximumSignificantDigits: 3 }).format(
          value,
        ),
    );
    assert.match(a.$("#migration-tooltip .source").href, /data.humdata.org/);
    assert.equal(
      a.$('.arc-hit[aria-expanded="true"]').dataset.route,
      `${origin}-${destination}`,
    );
    assert.deepEqual(Array.from(a.api.state.route), [origin, destination]);
    assert.match(a.$("#detail").textContent, /MODELLED MIGRATION/);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("arrow tooltip supports Enter, Space, Escape and close-button focus return", async () => {
  const a = await boot();
  try {
    const key = a.$(".arc-hit").dataset.route;
    a.$(".arc-hit").dispatchEvent(
      new a.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    assert.equal(a.w.document.activeElement, a.$(".tooltip-close"));
    a.w.document.dispatchEvent(
      new a.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert.equal(a.$("#migration-tooltip").hidden, true);
    assert.equal(a.w.document.activeElement.dataset.route, key);
    a.w.document.activeElement.dispatchEvent(
      new a.w.KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    assert.equal(a.$("#migration-tooltip").hidden, false);
    a.$(".tooltip-close").click();
    assert.equal(a.$("#migration-tooltip").hidden, true);
    assert.equal(a.w.document.activeElement.dataset.route, key);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("tooltip closes on outside taps, period changes, filters and zoom", async () => {
  const a = await boot();
  const open = () =>
    a
      .$(".arc-hit")
      .dispatchEvent(new a.w.MouseEvent("click", { bubbles: true, detail: 1 }));
  try {
    open();
    a.$("#migration-tooltip").dispatchEvent(
      new a.w.Event("pointerdown", { bubbles: true }),
    );
    assert.equal(
      a.$("#migration-tooltip").hidden,
      false,
      "inside taps retain the popup",
    );
    a.$("#map").dispatchEvent(new a.w.Event("pointerdown", { bubbles: true }));
    assert.equal(a.$("#migration-tooltip").hidden, true);
    open();
    await a.api.setYear(2015);
    assert.equal(a.$("#migration-tooltip").hidden, true);
    open();
    a.$('[data-dir="in"]').click();
    assert.equal(a.$("#migration-tooltip").hidden, true);
    open();
    a.$("#zin").click();
    assert.equal(a.$("#migration-tooltip").hidden, true);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("tooltip stays within narrow map bounds and clicking another arrow updates its data", async () => {
  const a = await boot();
  try {
    a.$(".map-wrap").getBoundingClientRect = () => ({
      left: 10,
      top: 20,
      width: 300,
      height: 400,
    });
    a.$("#migration-tooltip").getBoundingClientRect = () => ({
      width: 276,
      height: 260,
    });
    const hits = [...a.w.document.querySelectorAll(".arc-hit")];
    hits[0].dispatchEvent(
      new a.w.MouseEvent("click", {
        bubbles: true,
        detail: 1,
        clientX: 308,
        clientY: 418,
      }),
    );
    const tip = a.$("#migration-tooltip");
    assert.ok(
      parseFloat(tip.style.left) >= 12 &&
        parseFloat(tip.style.left) + 276 <= 288,
    );
    assert.ok(
      parseFloat(tip.style.top) >= 12 && parseFloat(tip.style.top) + 260 <= 388,
    );
    const previous = a.$(".tooltip-route").textContent;
    a.w.document
      .querySelectorAll(".arc-hit")[1]
      .dispatchEvent(
        new a.w.MouseEvent("click", {
          bubbles: true,
          detail: 1,
          clientX: 12,
          clientY: 22,
        }),
      );
    assert.notEqual(a.$(".tooltip-route").textContent, previous);
    assert.equal(tip.style.left, "12px");
    assert.equal(tip.style.top, "16px");
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.run();
      console.log("PASS " + t.name);
    } catch (e) {
      failed++;
      console.error("FAIL " + t.name + "\n" + e.stack);
    }
  }
  console.log(`${tests.length - failed}/${tests.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
})();

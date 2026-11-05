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
      "\nwindow.testAPI={state,cache,selectRoute,selectEvent,setYear,setRange,loadRange,validateRange,draw,mapScale,updateMapSizing,get rows(){return rows},get centers(){return centers}};",
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
    assert.equal(a.api.rows.length, 37442);
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
    assert.equal(a.api.rows.length, 37442);
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
test("touch dismissal does not focus the SVG route or leave a native focus outline", async () => {
  const a = await boot();
  try {
    const style = a.w.document.createElement("style");
    style.textContent = fs.readFileSync(path.join(root, "style.css"), "utf8");
    a.w.document.head.append(style);
    const key = a.$(".arc-hit").dataset.route;
    a.$(".arc-hit").dispatchEvent(
      new a.w.MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    a.$(".tooltip-close").focus();
    a.$(".tooltip-close").dispatchEvent(
      new a.w.MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    assert.equal(a.$("#migration-tooltip").hidden, true);
    assert.notEqual(a.w.document.activeElement.dataset.route, key);
    assert.equal(
      a.$("#migration-tooltip").contains(a.w.document.activeElement),
      false,
    );
    const hit = a.$(`.arc-hit[data-route="${key}"]`);
    hit.focus();
    assert.equal(a.w.getComputedStyle(hit).outline, "none");
    assert.equal(a.w.getComputedStyle(hit).vectorEffect, "non-scaling-stroke");
    hit.dispatchEvent(
      new a.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    a.$(".tooltip-close").click();
    assert.equal(a.w.document.activeElement.dataset.route, key);
    assert.equal(
      a.w.getComputedStyle(a.w.document.activeElement).outline,
      "none",
    );
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
    a.w.document.querySelectorAll(".arc-hit")[1].dispatchEvent(
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

test("Italy to Poland opens full migration details with both directions and every period", async () => {
  const a = await boot();
  try {
    assert.equal(a.$("#pair-origin").value, "ITA");
    assert.equal(a.$("#pair-destination").value, "POL");
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { bubbles: true, cancelable: true }),
    );
    await flush();
    await flush();
    assert.equal(a.$("#route-dialog").open, true);
    assert.equal(a.$("#route-view-title").textContent, "Italy → Poland");
    assert.equal(a.$("#route-forward-count").textContent, "≈ 28,800");
    assert.equal(a.$("#route-reverse-count").textContent, "≈ 14,000");
    assert.equal(a.w.document.querySelectorAll(".history-period").length, 15);
    assert.match(
      a.$("#route-context").textContent,
      /No route-specific historical account/,
    );
    assert.ok(
      [...a.w.document.querySelectorAll(".arc")].some(
        (el) => el.__data__[0] === "ITA" && el.__data__[1] === "POL",
      ),
    );
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("migration details can open from a route card and an arrow tooltip", async () => {
  const a = await boot();
  try {
    const label = a.$(".route-card strong").textContent;
    a.$(".route-card").click();
    await flush();
    assert.equal(a.$("#route-view-title").textContent, label);
    a.$("#route-close").click();
    a.$(".arc-hit").dispatchEvent(
      new a.w.MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    const tooltipRoute = a.$(".tooltip-route").textContent;
    a.$(".tooltip-details").click();
    await flush();
    assert.equal(a.$("#migration-tooltip").hidden, true);
    assert.equal(a.$("#route-dialog").open, true);
    assert.equal(a.$("#route-view-title").textContent, tooltipRoute);
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("route detail period selection updates map and handles the historical gap", async () => {
  const a = await boot();
  try {
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    await flush();
    a.change("#route-period", "1950");
    await flush();
    assert.equal(a.api.state.year, 1950);
    assert.equal(a.$("#route-forward-count").textContent, "No comparable data");
    assert.equal(a.w.document.querySelectorAll(".arc").length, 0);
    a.$('.history-period[data-year="2000"]').click();
    await flush();
    const data = JSON.parse(fs.readFileSync(path.join(root, "data/2000.json"))),
      v = data.find((r) => r[0] === "ITA" && r[1] === "POL")[2];
    assert.equal(
      a.$("#route-forward-count").textContent,
      "≈ " +
        new Intl.NumberFormat("en", { maximumSignificantDigits: 3 }).format(v),
    );
    assert.equal(a.api.state.year, 2000);
    assert.equal(
      a.$('.history-period[data-year="2000"]').getAttribute("aria-pressed"),
      "true",
    );
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("reversing a pair updates its direction, data, map selection and country selectors", async () => {
  const a = await boot();
  try {
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    await flush();
    a.$("#route-reverse").click();
    await flush();
    await flush();
    assert.equal(a.$("#route-view-title").textContent, "Poland → Italy");
    assert.equal(a.$("#route-forward-count").textContent, "≈ 14,000");
    assert.equal(a.$("#pair-origin").value, "POL");
    assert.equal(a.$("#pair-destination").value, "ITA");
    assert.deepEqual(Array.from(a.api.state.route), ["POL", "ITA"]);
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("country-pair validation prevents self routes and permits worldwide routes", async () => {
  const a = await boot();
  const submit = () =>
    a
      .$("#pair-form")
      .dispatchEvent(new a.w.Event("submit", { cancelable: true }));
  try {
    a.change("#pair-origin", "ITA");
    a.change("#pair-destination", "ITA");
    submit();
    assert.match(a.$("#pair-error").textContent, /different countries/);
    assert.equal(a.$("#route-dialog").open, false);
    a.change("#pair-origin", "USA");
    a.change("#pair-destination", "CAN");
    submit();
    assert.equal(a.$("#pair-error").hidden, true);
    assert.equal(a.$("#route-dialog").open, true);
    a.$("#route-close").click();
    a.change("#pair-destination", "POL");
    a.$("#pair-swap").click();
    assert.equal(a.$("#pair-origin").value, "POL");
    assert.equal(a.$("#pair-destination").value, "USA");
    submit();
    await flush();
    assert.equal(a.$("#route-dialog").open, true);
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("route-specific historical context excludes stories about other corridors", async () => {
  const a = await boot();
  try {
    a.change("#pair-origin", "BLR");
    a.change("#pair-destination", "POL");
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    assert.equal(
      a.w.document.querySelectorAll(".route-context-card").length,
      1,
    );
    assert.match(a.$("#route-context").textContent, /August 2020/);
    assert.doesNotMatch(a.$("#route-context").textContent, /Syrian|Venezuela/);
    assert.match(a.$("#route-context a").href, /gov.pl/);
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("opening migration details pauses playback so the figures remain readable", async () => {
  const a = await boot();
  try {
    a.$("#play").click();
    await flush();
    assert.equal(a.timers.size, 1);
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    assert.equal(a.timers.size, 0);
    assert.equal(a.$("#route-dialog").open, true);
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});

test("late history responses and queued close events cannot replace the newest route", async () => {
  let resolve;
  const data = JSON.parse(fs.readFileSync(path.join(root, "data/2015.json")));
  const a = await boot({
    "data/2015.json": () => new Promise((r) => (resolve = r)),
  });
  try {
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    a.$("#route-close").click();
    a.change("#pair-origin", "POL");
    a.change("#pair-destination", "ITA");
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    a.$("#route-dialog").dispatchEvent(new a.w.Event("close"));
    resolve({ ok: true, json: async () => data });
    await flush();
    await flush();
    assert.equal(a.$("#route-view-title").textContent, "Poland → Italy");
    assert.equal(a.$("#route-forward-count").textContent, "≈ 14,000");
    assert.equal(a.w.document.querySelectorAll(".history-period").length, 15);
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("route history separates fetch failures from data gaps and supports retry", async () => {
  let fail = true;
  const data = JSON.parse(fs.readFileSync(path.join(root, "data/2015.json")));
  const a = await boot({
    "data/2015.json": async () => {
      if (fail) throw Error("offline");
      return { ok: true, json: async () => data };
    },
  });
  try {
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    await flush();
    assert.match(
      a.$('.history-period[data-year="2015"]').closest("tr").textContent,
      /Could not load/,
    );
    assert.match(
      a.$('.history-period[data-year="1950"]').closest("tr").textContent,
      /No comparable data/,
    );
    assert.equal(a.$("#route-forward-count").textContent, "≈ 28,800");
    fail = false;
    a.$("#route-history > button").click();
    await flush();
    await flush();
    assert.doesNotMatch(
      a.$('.history-period[data-year="2015"]').closest("tr").textContent,
      /Could not load/,
    );
    assert.equal(a.$("#route-history > button"), null);
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});

test("Italy-France data uses France in selectors, map labels and source attribution", async () => {
  const a = await boot();
  try {
    const corrections = {
      FRA: "France",
      AUS: "Australia",
      BRA: "Brazil",
      KAZ: "Kazakhstan",
    };
    for (const selector of ["#country", "#pair-origin", "#pair-destination"]) {
      for (const [code, name] of Object.entries(corrections)) {
        assert.equal(
          a.$(`${selector} option[value="${code}"]`).textContent,
          name,
        );
      }
      assert.doesNotMatch(
        a.$(selector).textContent,
        /Clipperton|Ashmore|Brazilian Island|Baikonur/,
      );
    }
    await a.api.setYear(1960);
    a.change("#pair-origin", "ITA");
    a.change("#pair-destination", "FRA");
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    await flush();
    assert.equal(a.$("#route-view-title").textContent, "Italy → France");
    assert.equal(a.$("#route-forward-count").textContent, "≈ 774,000");
    assert.equal(a.$("#route-reverse-count").textContent, "≈ 512,000");
    assert.equal(a.$("#route-source-codes").textContent, "ITA → FRA");
    assert.match(
      a.$(".route-provenance").textContent,
      /not observed migration counts/,
    );
    assert.match(a.$(".route-provenance a").href, /data.humdata.org/);
    assert.ok(
      [...a.w.document.querySelectorAll(".endpoint-label")].some(
        (el) => el.textContent === "France",
      ),
    );
    assert.doesNotMatch(a.$("#route-content").textContent, /Clipperton/);
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});

function chooseEverywhere(a, origin) {
  a.change("#pair-origin", origin);
  a.change("#pair-destination", "everywhere");
  a.$("#pair-form").dispatchEvent(
    new a.w.Event("submit", { cancelable: true }),
  );
}
test("Everywhere clears old filters and displays every positive outgoing route", async () => {
  const a = await boot();
  try {
    a.change("#search", "Belarus", "input");
    chooseEverywhere(a, "ITA");
    assert.equal(a.api.state.country, "ITA");
    assert.equal(a.api.state.dir, "out");
    assert.equal(a.api.state.everywhere, true);
    assert.equal(a.api.state.route, null);
    assert.equal(a.api.state.event, null);
    assert.equal(a.$("#search").value, "");
    assert.equal(a.$("#route-dialog").open, false);
    assert.equal(a.$("#everywhere-controls").hidden, false);
    assert.equal(a.$("#pair-swap").disabled, true);
    assert.equal(a.$("#pair-open").textContent, "Show all destinations ↗");
    const expected = a.api.rows
      .filter((r) => r[0] === "ITA" && r[2] > 0)
      .map((r) => r[0] + "-" + r[1])
      .sort();
    const actual = [...a.w.document.querySelectorAll(".arc-hit")]
      .map((p) => p.dataset.route)
      .sort();
    assert.ok(expected.length > 30);
    assert.deepEqual(actual, Array.from(expected));
    assert.equal(a.w.document.querySelectorAll(".arc").length, expected.length);
    assert.ok(
      [...a.w.document.querySelectorAll(".arc")].every(
        (p) => p.getAttribute("d") && !p.getAttribute("d").includes("NaN"),
      ),
    );
    assert.match(a.$("#outgoing-scope").textContent, /Worldwide destinations/);
    assert.equal(a.$("#outgoing-total").textContent, "≈ 1,720,000");
    assert.equal(a.$("#route-count").textContent, "193 available");
    const total = a.$("#outgoing-total").textContent;
    a.$("#show-all-routes").click();
    assert.equal(a.w.document.querySelectorAll(".arc").length, 30);
    assert.match(a.$("#coverage").textContent, /30 largest/);
    assert.equal(a.$("#outgoing-total").textContent, total);
    a.$("#show-all-routes").click();
    assert.equal(a.w.document.querySelectorAll(".arc").length, expected.length);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("Everywhere includes worldwide destinations for non-European origins", async () => {
  const a = await boot();
  try {
    chooseEverywhere(a, "COL");
    assert.equal(a.$("#route-count").textContent, "193 available");
    assert.ok(a.api.rows.some((r) => r[0] === "COL" && r[1] === "VEN"));
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});

test("Everywhere totals survive destination search and timeline gaps stay unavailable", async () => {
  const a = await boot();
  try {
    chooseEverywhere(a, "ITA");
    const total = a.$("#outgoing-total").textContent;
    a.change("#search", "Poland", "input");
    assert.equal(a.$("#outgoing-total").textContent, total);
    assert.equal(a.w.document.querySelectorAll(".arc").length, 1);
    assert.equal(a.$(".arc-hit").dataset.route, "ITA-POL");
    assert.match(
      a.$("#detail").textContent,
      /total includes all covered destinations/,
    );
    await a.api.setYear(1950);
    assert.equal(a.$("#outgoing-total").textContent, "No comparable data");
    assert.equal(a.w.document.querySelectorAll(".arc").length, 0);
    assert.equal(a.w.document.querySelectorAll(".destination-card").length, 0);
    assert.match(a.$("#top-destinations").textContent, /begin in 1960/);
    await a.api.setYear(2015);
    assert.match(a.$("#detail").textContent, /2015–2019/);
    assert.equal(a.$("#outgoing-total").textContent, "≈ 2,150,000");
    assert.notEqual(a.$("#outgoing-total").textContent, total);
    assert.equal(a.w.document.querySelectorAll(".destination-card").length, 5);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("Everywhere arrows show tooltips and ranked destinations open details with a way back", async () => {
  const a = await boot();
  try {
    chooseEverywhere(a, "ITA");
    a.$('.arc-hit[data-route="ITA-POL"]').dispatchEvent(
      new a.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    assert.equal(a.$("#migration-tooltip").hidden, false);
    assert.equal(a.$(".tooltip-route").textContent, "Italy → Poland");
    assert.equal(a.$(".tooltip-value").textContent, "≈ 28,800");
    a.$("#detail .all-destinations-link").click();
    assert.equal(a.api.state.route, null);
    assert.equal(a.$("#migration-tooltip").hidden, true);
    const largest = [...a.api.rows]
      .filter((r) => r[0] === "ITA")
      .sort((a, b) => b[2] - a[2])[0];
    assert.equal(a.$(".destination-card").dataset.destination, largest[1]);
    a.$(".destination-card").click();
    await flush();
    await flush();
    assert.equal(a.$("#route-dialog").open, true);
    assert.deepEqual(Array.from(a.api.state.route), ["ITA", largest[1]]);
    assert.equal(a.api.state.everywhere, false);
    assert.equal(a.$("#pair-swap").disabled, false);
    a.$("#route-all-destinations").click();
    assert.equal(a.$("#route-dialog").open, false);
    assert.equal(a.api.state.everywhere, true);
    assert.equal(a.api.state.route, null);
    assert.equal(a.$("#pair-destination").value, "everywhere");
    a.change("#pair-destination", "POL");
    assert.equal(a.$("#pair-swap").disabled, false);
    assert.equal(a.$("#pair-coverage").hidden, true);
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    assert.equal(a.$("#route-view-title").textContent, "Italy → Poland");
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("Everywhere resets on filters and retains its range when reading an event", async () => {
  const a = await boot();
  try {
    chooseEverywhere(a, "");
    assert.equal(a.$("#pair-error").hidden, false);
    assert.match(a.$("#pair-error").textContent, /Choose an origin/);
    assert.equal(a.api.state.everywhere, false);
    chooseEverywhere(a, "ITA");
    a.$('[data-dir="in"]').click();
    assert.equal(a.api.state.everywhere, false);
    assert.equal(a.$("#everywhere-controls").hidden, true);
    assert.equal(a.$("#outgoing-total"), null);
    assert.ok(
      [...a.w.document.querySelectorAll(".arc-hit")].every(
        (p) => p.__data__[1] === "ITA",
      ),
    );
    chooseEverywhere(a, "ITA");
    a.change("#country", "POL");
    assert.equal(a.api.state.everywhere, false);
    chooseEverywhere(a, "BLR");
    assert.ok(a.$(".event-btn"));
    a.$(".event-btn").click();
    await flush();
    assert.equal(a.api.state.everywhere, true);
    assert.equal(a.$("#everywhere-controls").hidden, false);
    assert.equal(a.$("#outgoing-total"), null);
    a.$("#detail .all-destinations-link").click();
    assert.ok(a.$("#outgoing-total"));
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("Everywhere loading and fetch failures never become an estimated zero", async () => {
  let reject;
  const a = await boot({
    "data/2015.json": () => new Promise((_, r) => (reject = r)),
  });
  try {
    chooseEverywhere(a, "ITA");
    const pending = a.api.setYear(2015);
    assert.equal(a.$("#outgoing-total").textContent, "Loading…");
    assert.equal(a.w.document.querySelectorAll(".destination-card").length, 0);
    reject(Error("offline"));
    await pending;
    assert.equal(a.$("#outgoing-total").textContent, "Could not load");
    assert.equal(a.w.document.querySelectorAll(".arc").length, 0);
    assert.match(a.$("#top-destinations").textContent, /could not be loaded/);
    await a.api.setYear(2020);
    assert.match(a.$("#outgoing-total").textContent, /≈/);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});

test("arrows, heads and map points stay small at desktop and mobile zoom sizes", async () => {
  const a = await boot();
  try {
    a.api.selectRoute(a.$(".arc-hit").__data__);
    for (const box of [
      { width: 1000, height: 540 },
      { width: 360, height: 260 },
    ]) {
      a.$("#map").getBoundingClientRect = () => box;
      a.$("#reset").click();
      for (let i = 0; i < 6; i++) {
        a.$("#zin").click();
        const scale = a.api.mapScale();
        for (const path of a.w.document.querySelectorAll(".arc")) {
          assert.equal(
            path.getAttribute("vector-effect"),
            "non-scaling-stroke",
          );
          assert.ok(+path.getAttribute("stroke-width") <= 2.4);
        }
        for (const marker of a.w.document.querySelectorAll("marker")) {
          assert.equal(marker.getAttribute("markerUnits"), "userSpaceOnUse");
          assert.ok(
            Math.abs(+marker.getAttribute("markerWidth") * scale - 7) < 0.00001,
          );
        }
        assert.ok(
          [...a.w.document.querySelectorAll(".country-point")].every(
            (p) => Math.abs(+p.getAttribute("r") * scale - 2.5) < 0.00001,
          ),
        );
        assert.ok(
          a.$(".endpoint-label").getAttribute("transform").includes("scale("),
        );
      }
    }
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("arbitrary inclusive ranges sum annual data exactly and retain the selected pair", async () => {
  const a = await boot();
  try {
    await a.api.setRange(1999, 2003);
    assert.equal(a.$("#period").textContent, "1999–2003");
    assert.equal(
      a.api.rows.find((r) => r[0] === "ITA" && r[1] === "FRA")[2],
      146384.1,
    );
    a.change("#pair-origin", "ITA");
    a.change("#pair-destination", "FRA");
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    await flush();
    assert.equal(a.$("#route-forward-count").textContent, "≈ 146,000");
    assert.equal(a.$("#route-period").value, "custom");
    assert.equal(a.$(".route-stat-period").textContent, "1999–2003");
    a.change("#route-range-start", "2021");
    a.change("#route-range-end", "2021");
    a.$("#route-range-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    await flush();
    assert.equal(a.$("#route-forward-count").textContent, "≈ 15,200");
    assert.equal(
      a.api.rows.find((r) => r[0] === "ITA" && r[1] === "FRA")[2],
      15237.9,
    );
    assert.equal(a.$("#period").textContent, "2021");
    assert.equal(a.$("#range-start").value, "2021");
    a.$("#route-close").click();
    a.$('.arc-hit[data-route="ITA-FRA"]').dispatchEvent(
      new a.w.MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    assert.equal(a.$(".tooltip-period").textContent, "2021");
    assert.match(a.$(".tooltip-note").textContent, /1 calendar year/);
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("custom ranges agree with existing five-year data and combine chunks without overlap", async () => {
  const a = await boot();
  try {
    const existing = Array.from(a.api.rows, (r) => Array.from(r));
    await a.api.setRange(2020, 2024);
    assert.deepEqual(
      Array.from(a.api.rows, (r) => Array.from(r)),
      existing,
    );
    const ranges = await Promise.all([
      a.api.loadRange(1999, 2010),
      a.api.loadRange(1999, 2003),
      a.api.loadRange(2004, 2010),
    ]);
    const map = (r) =>
      new Map(r.map(([a, b, v]) => [a + ":" + b, Math.round(v * 10)]));
    const [whole, left, right] = ranges.map(map);
    assert.equal(whole.size, 37442);
    for (const [key, value] of whole)
      assert.equal(value, left.get(key) + right.get(key));
    await a.api.setRange(1960, 2024);
    assert.equal(a.api.rows.length, 37442);
    assert.equal(a.$("#period").textContent, "1960–2024");
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("incoming totals include only immigration and historical drivers overlap the range", async () => {
  const a = await boot();
  try {
    a.change("#country", "POL");
    a.$('[data-dir="in"]').click();
    await a.api.setRange(2020, 2022);
    assert.equal(a.$("#incoming-total").textContent, "≈ 1,380,000");
    assert.equal(
      Math.round(
        a.api.rows
          .filter((r) => r[1] === "POL")
          .reduce((sum, r) => sum + r[2], 0) * 10,
      ),
      13759265,
    );
    assert.match(a.$("#events").textContent, /Beyond the border/);
    assert.match(a.$("#events").textContent, /Forced to leave/);
    a.change("#pair-origin", "BLR");
    a.change("#pair-destination", "POL");
    a.$("#pair-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    await flush();
    assert.equal(a.$("#route-forward-count").textContent, "≈ 13,700");
    assert.match(a.$("#route-context").textContent, /Beyond the border/);
    assert.doesNotMatch(a.$("#route-context").textContent, /Forced to leave/);
    assert.match(
      a.$("#route-context").textContent,
      /does not attribute a number/,
    );
    await a.api.setRange(2018, 2019);
    assert.equal(
      a.w.document.querySelectorAll(".route-context-card").length,
      0,
    );
    assert.match(
      a.$("#route-context").textContent,
      /No route-specific historical account/,
    );
  } finally {
    a.$("#route-close").click();
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("invalid year ranges do not replace the current selection; valid form ranges pause playback", async () => {
  const a = await boot();
  try {
    for (const [start, end] of [
      [2024, 2020],
      [1959, 2024],
      [1960, 2025],
      [2020.5, 2024],
      ["", 2024],
    ]) {
      a.change("#range-start", String(start));
      a.change("#range-end", String(end));
      a.$("#range-form").dispatchEvent(
        new a.w.Event("submit", { cancelable: true }),
      );
      assert.equal(a.$("#range-error").hidden, false);
      assert.equal(a.$("#period").textContent, "2020–2024");
    }
    a.$("#play").click();
    a.change("#range-start", "2020");
    a.change("#range-end", "2022");
    a.$("#range-form").dispatchEvent(
      new a.w.Event("submit", { cancelable: true }),
    );
    await flush();
    await flush();
    assert.equal(a.timers.size, 0);
    assert.equal(a.$("#range-error").hidden, true);
    assert.equal(a.$("#period").textContent, "2020–2022");
    a.$("#next").click();
    await flush();
    assert.equal(a.api.state.customRange, false);
    assert.equal(a.$("#period").textContent, "2020–2024");
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("annual range failures and incomplete corridors show no partial totals and can be retried", async () => {
  let fail = true;
  const data = JSON.parse(
    fs.readFileSync(path.join(root, "data/annual/2021.json")),
  );
  const a = await boot({
    "data/annual/2021.json": async () => {
      if (fail) throw Error("offline");
      return { ok: true, json: async () => data };
    },
  });
  try {
    chooseEverywhere(a, "ITA");
    await a.api.setRange(2020, 2022);
    assert.equal(a.$("#outgoing-total").textContent, "Could not load");
    assert.equal(a.api.rows.length, 0);
    fail = false;
    await a.api.setRange(2020, 2022);
    assert.match(a.$("#outgoing-total").textContent, /≈/);
    assert.equal(a.api.rows.length, 37442);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
  const b = await boot({
    "data/annual/2021.json": async () => ({
      ok: true,
      json: async () => data.slice(1),
    }),
  });
  try {
    await b.api.setRange(2020, 2022);
    assert.equal(b.api.rows.length, 0);
    assert.match(b.$("#map-status").textContent, /no partial total/);
  } finally {
    b.api.state.route = null;
    await flush();
    b.dom.window.close();
  }
});
test("a late custom range cannot overwrite a more recent selection", async () => {
  let resolve;
  const a = await boot({
    "data/annual/2021.json": () => new Promise((r) => (resolve = r)),
  });
  try {
    const pending = a.api.setRange(2021, 2021);
    await a.api.setYear(2015);
    resolve({
      ok: true,
      json: async () =>
        JSON.parse(fs.readFileSync(path.join(root, "data/annual/2021.json"))),
    });
    await pending;
    assert.equal(a.$("#period").textContent, "2015–2019");
    assert.equal(a.api.state.endYear, 2019);
    assert.equal(a.api.state.customRange, false);
  } finally {
    a.api.state.route = null;
    await flush();
    a.dom.window.close();
  }
});
test("countries without source coverage are explicitly labelled and never become zero", async () => {
  const a = await boot();
  try {
    assert.match(
      a.$('#country option[value="GRL"]').textContent,
      /no estimates/,
    );
    a.change("#country", "GRL");
    a.$('[data-dir="in"]').click();
    await a.api.setRange(2020, 2022);
    assert.equal(a.$("#incoming-total").textContent, "No comparable data");
    assert.match(a.$("#top-destinations").textContent, /no estimates in FLOW/);
    assert.equal(a.w.document.querySelectorAll(".arc").length, 0);
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

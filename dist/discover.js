/* Curated residence-flow comparisons from the same pinned official series as the map. */
(() => {
  const catalog = document.querySelector("#discover-routes");
  if (!catalog) return;
  const grid = catalog.querySelector(".discover-grid");
  const status = catalog.querySelector("#discover-status");
  const stories = [
    {
      origin: "ESP", destination: "ROU", start: 2020, end: 2024,
      fromName: "Spain", toName: "Romania", directionComparison: true,
      context: "More moves were reported towards Romania. These figures cover changes of residence across all citizenships. Spain changed its method in 2021, and the two countries’ reports can differ.",
    },
    {
      origin: "NPL", destination: "ROU", start: 2021, end: 2024,
      fromName: "Nepal", toName: "Romania",
      context: "Reported arrivals from Nepal rose roughly sixfold between the first and last year shown.",
    },
    {
      origin: "POL", destination: "ISL", start: 2020, end: 2024,
      fromName: "Poland", toName: "Iceland", directionComparison: true,
      context: "People moved in both directions. The reported flow to Iceland was larger in each of the five years.",
    },
  ];
  const el = (tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };
  async function explore(story) {
    if (catalog.getAttribute("aria-busy") === "true") return;
    catalog.setAttribute("aria-busy", "true");
    try {
      const policy = document.querySelector("#data-policy");
      if (dataPolicy !== "official") {
        policy.value = "official";
        await policy.onchange({ target: policy });
      }
      const ready = await applyCountryScenario({
        focus: story.origin, direction: "out", peers: [story.destination],
        start: story.start, end: story.end,
      });
      if (!ready) throw Error("Route unavailable");
      await openMovementDetails(story.origin, story.destination);
      status.textContent = "";
    } catch {
      status.textContent = "This route could not be opened. Use its button to retry.";
    } finally {
      catalog.removeAttribute("aria-busy");
    }
  }
  function measure(resolver, from, to, start, end) {
    const report = resolver.getRouteProvenance(from, to, start, end, "official");
    if (report.missing || !report.official) return null;
    const total = report.years.reduce((sum, year) => sum + year.officialValue, 0);
    return formatSourceValue(total, report, "official");
  }
  async function render() {
    try {
      const resolver = await officialDataReady();
      const nodes = [];
      for (const story of stories) {
        const { origin, destination, start, end, fromName, toName, directionComparison } = story;
        const title = fromName + " to " + toName;
        const first = measure(resolver, origin, destination, start, directionComparison ? end : start);
        const second = directionComparison ? measure(resolver, destination, origin, start, end)
          : measure(resolver, origin, destination, end, end);
        const whole = resolver.getRouteProvenance(origin, destination, start, end, "official");
        if (first === null || second === null || whole.missing) continue;
        const card = document.createElement("article");
        const coverage = directionComparison ? "Both directions" : "Arrivals";
        card.append(el("p", `${start}–${end} · ${coverage} reported each year`), el("h3", title));
        const figures = document.createElement("dl");
        for (const [label, value] of [[directionComparison ? "To " + toName : start, first],
                                       [directionComparison ? "To " + fromName : end, second]]) {
          const column = document.createElement("div");
          column.append(el("dt", label), el("dd", value));
          figures.append(column);
        }
        card.append(figures, el("p", story.context));
        const button = el("button", "Explore official figures");
        button.type = "button";
        button.dataset.route = origin + "-" + destination;
        button.setAttribute("aria-label", `Explore official figures for ${title}, ${start}–${end}`);
        button.onclick = () => explore(story);
        card.append(button);
        nodes.push(card);
      }
      grid.replaceChildren(...nodes);
      status.textContent = nodes.length ? "" : "Comparable official figures are unavailable for these routes.";
    } catch {
      status.textContent = "Discovery figures could not be loaded. ";
      const retry = el("button", "Retry");
      retry.type = "button";
      retry.onclick = render;
      status.append(retry);
    }
  }
  render();
})();

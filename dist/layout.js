/* Layout controls move existing nodes so selection and playback handlers survive. */
(() => {
  const select = (selector) => document.querySelector(selector);
  const column = select(".map-column");
  const map = select(".map-wrap");
  const panel = select(".movement-panel");
  if (!column || !map || !panel) return;
  const preferenceKey = "migration-atlas.sections.v1";
  let preferences = {};
  try {
    preferences = JSON.parse(localStorage.getItem(preferenceKey) || "{}") || {};
  } catch {}
  const resizeMap = () =>
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  function section(id, label, open = false) {
    const details = document.createElement("details");
    details.id = id;
    details.className = "layout-section layout-ancillary";
    details.open = Object.prototype.hasOwnProperty.call(preferences, id)
      ? preferences[id] === true
      : open;
    const summary = document.createElement("summary");
    summary.textContent = label;
    details.append(summary);
    details.addEventListener("toggle", () => {
      preferences[id] = details.open;
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(preferences));
      } catch {}
      resizeMap();
    });
    return details;
  }
  const viewbar = document.createElement("div");
  viewbar.className = "map-viewbar";
  const description = document.createElement("p");
  description.id = "scenario-summary";
  description.setAttribute("aria-label", "Current migration selection");
  const focus = document.createElement("button");
  focus.id = "focus-map";
  focus.type = "button";
  focus.textContent = "Focus map ⤢";
  focus.setAttribute("aria-pressed", "false");
  focus.setAttribute("aria-controls", "migration-workspace");
  viewbar.append(description, focus);
  column.prepend(viewbar);
  select(".workspace").id = "migration-workspace";

  const settings = section("section-selection", "Selection and dates", true);
  viewbar.after(settings);
  const settingsContent = document.createElement("div");
  settingsContent.className = "selection-content";
  settings.append(settingsContent);
  for (const node of [select(".toolbar"), select("#pair-form"), panel]) {
    if (node) settingsContent.append(node);
  }

  const dock = document.createElement("section");
  dock.id = "playback-dock";
  dock.className = "playback-dock";
  dock.setAttribute(
    "aria-label",
    "Timeline, playback controls and migration totals",
  );
  map.after(dock);
  for (const selector of [
    ".movement-transport",
    "#movement-year",
    "#movement-cursor",
    "#movement-count",
    "#movement-legend",
    "#movement-status",
  ]) {
    const node = select(selector);
    if (node) dock.append(node);
  }
  const range = select("#range-form");
  if (range) settingsContent.append(range);
  const quickSteps = select(".timeline");
  if (quickSteps) settingsContent.append(quickSteps);

  const contributions = section(
    "section-contributions",
    "Country contributions",
  );
  dock.after(contributions);
  const contributionList = select("#movement-contributions");
  if (contributionList) contributions.append(contributionList);
  const sourceNote = panel.querySelector(":scope > p.small");

  const aside = select("aside");
  const migrationDetails = section(
    "section-migration-details",
    "Migration details",
  );
  const currentDetails = select("#detail");
  if (aside && currentDetails) {
    currentDetails.before(migrationDetails);
    migrationDetails.append(currentDetails);
  }
  const history = section("section-history", "Historical drivers", true);
  const eventsHeading = select(".events-heading");
  if (aside && eventsHeading) {
    eventsHeading.before(history);
    const count = select("#event-count");
    if (count) {
      count.classList.add("section-count");
      history.querySelector("summary").append(count);
    }
    for (const node of [
      eventsHeading,
      select("#events"),
      select("#all-events"),
    ]) {
      if (node) history.append(node);
    }
  }
  for (const [selector, id, label] of [
    [".routes", "section-routes", "Route list"],
    [".method", "section-methodology", "Methodology and sources"],
  ]) {
    const node = select(selector);
    if (!node) continue;
    const wrapper = section(id, label);
    node.before(wrapper);
    wrapper.append(node);
    if (selector === ".method" && sourceNote) node.append(sourceNote);
  }
  for (const selector of [".map-caption", "#everywhere-controls"])
    select(selector)?.classList.add("layout-ancillary");

  function selectedText(selector) {
    const element = select(selector);
    return element?.selectedOptions?.[0]?.textContent || "";
  }
  function updateSummary() {
    if (
      typeof document === "undefined" ||
      !document ||
      !description.isConnected
    )
      return;
    const hasMovement = typeof movement !== "undefined" && movement.focus;
    const focal = hasMovement
      ? typeof name === "function"
        ? name(movement.focus)
        : selectedText("#movement-focus")
      : selectedText("#country");
    const direction = hasMovement
      ? movement.direction
      : typeof state !== "undefined"
        ? state.dir
        : "both";
    let peers = "Everywhere";
    if (hasMovement && Array.isArray(movement.peers)) {
      peers =
        movement.peers.length === 1 && typeof name === "function"
          ? name(movement.peers[0])
          : `${movement.peers.length} ${direction === "in" ? "origins" : "destinations"}`;
    }
    let label =
      !hasMovement && !select("#country")?.value
        ? "All world connections"
        : direction === "in"
          ? `${peers} → ${focal}`
          : direction === "both"
            ? `Movement involving ${focal} ↔ ${peers}`
            : `${focal} → ${peers}`;
    const start = select("#range-start")?.value;
    const end = select("#range-end")?.value;
    label += ` · ${start || "…"}–${end || "…"}`;
    label += ` · ${selectedText("#movement-metric") || "Migration volume"}`;
    if (description.textContent !== label) description.textContent = label;
  }
  focus.addEventListener("click", () => {
    const active = !document.body.classList.contains("layout-focus");
    document.body.classList.toggle("layout-focus", active);
    focus.setAttribute("aria-pressed", String(active));
    focus.textContent = active ? "Restore panels ⤡" : "Focus map ⤢";
    updateSummary();
    resizeMap();
    if (active)
      viewbar.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  });
  document.addEventListener("change", updateSummary);
  document.addEventListener("input", updateSummary);
  const observer = new MutationObserver(updateSummary);
  for (const selector of [
    "#movement-focus",
    "#movement-count",
    "#movement-year",
    "#movement-status",
    "#period",
  ]) {
    const node = select(selector);
    if (node)
      observer.observe(node, {
        childList: true,
        subtree: true,
        characterData: true,
      });
  }
  updateSummary();
})();

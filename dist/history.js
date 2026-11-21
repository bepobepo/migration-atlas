/* One directed, date-scoped relevance model shared by all historical views. */
function eventScope(record) {
  return record.scope || "route";
}
function eventLabel(record, nameForCode = (code) => code) {
  const scope = eventScope(record);
  if (scope === "route")
    return (
      record.route ||
      `${nameForCode(record.origin)} → ${nameForCode(record.destination)}`
    );
  return `Context in ${nameForCode(record.country)} · ${scope === "origin-country" ? "emigration" : "immigration"}`;
}
function historyMatches(records, { corridors, start, end, includeCountryContext }) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return [];
  const seen = new Set(),
    order = { route: 0, "origin-country": 1, "destination-country": 2 };
  return records
    .filter((record) => {
      if (record.start > end || record.end < start) return false;
      const scope = eventScope(record);
      const matches =
        corridors === undefined ||
        corridors.some(([origin, destination]) =>
          scope === "route"
            ? record.origin === origin && record.destination === destination
            : scope === "origin-country"
              ? record.country === origin
              : scope === "destination-country"
                ? record.country === destination
                : false,
        );
      if (!matches) return false;
      if (scope !== "route" && includeCountryContext && !includeCountryContext(record)) {
        return false;
      }
      const key =
        record.id ??
        `${scope}:${record.country || record.origin}:${record.destination || ""}:${record.start}:${record.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        (order[eventScope(a)] ?? 3) - (order[eventScope(b)] ?? 3) ||
        b.start - a.start ||
        String(a.id).localeCompare(String(b.id)),
    );
}
function historyNarrative(record, through = record.end) {
  return [
    record.text,
    ...(record.updates || []).filter((item) => item.year <= through).map((item) => item.text),
  ].join(" ");
}
function renderHistoryCards(
  container,
  records,
  {
    start,
    end,
    nameForCode = (code) => code,
    showRouteGap = false,
    groupByScope = false,
    emptyMessage = "No sourced historical context is available for these corridors and years.",
  } = {},
) {
  container.replaceChildren();
  const document = container.ownerDocument;
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "route-explanation history-empty";
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }
  if (
    showRouteGap &&
    !records.some((record) => eventScope(record) === "route")
  ) {
    const note = document.createElement("p");
    note.className = "route-explanation history-coverage-note";
    note.textContent =
      "Country context available; no additional account specific to this route.";
    container.append(note);
  }
  let previousGroup;
  for (const record of records) {
    const scope = eventScope(record);
    if (groupByScope && scope !== previousGroup) {
      const heading = document.createElement("h4");
      heading.textContent = {
        route: "Documented routes",
        "origin-country": "Wider context in origin countries",
        "destination-country": "Wider context in destination countries",
      }[scope];
      container.append(heading);
      previousGroup = scope;
    }
    const article = document.createElement("article");
    article.className = "route-context-card";
    article.dataset.eventId = record.id;
    article.dataset.scope = eventScope(record);
    const label = document.createElement("span");
    label.className = "eyebrow";
    const first = Math.max(start ?? record.start, record.start),
      last = Math.min(end ?? record.end, record.end);
    label.textContent = `${first === last ? first : `${first}–${last}`} · ${eventLabel(record, nameForCode)}`;
    const title = document.createElement("h4");
    title.textContent = record.title;
    const text = document.createElement("p");
    text.textContent = historyNarrative(record, last);
    article.append(label, title, text);
    for (const [i, url] of [record.source, record.additionalSource]
      .filter(Boolean)
      .entries()) {
      const link = document.createElement("a");
      link.className = "source";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent =
        i === 0 ? "Historical source ↗" : "Further historical context ↗";
      if (i) article.append(document.createElement("br"));
      article.append(link);
    }
    container.append(article);
  }
}

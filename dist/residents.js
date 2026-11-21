/* Dated resident populations use UN DESA's destination and origin observations. */
(() => {
  const PAGE_SIZE = 15;
  const number = new Intl.NumberFormat("en");
  const percent = new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const cache = new Map();
  let dialog;
  let returnFocus;
  let request = 0;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function createDialog() {
    const node = element("dialog");
    node.id = "residents-dialog";
    node.setAttribute("aria-labelledby", "residents-heading");
    node.innerHTML = `
      <div class="residents-heading-row">
        <h2 id="residents-heading"></h2>
        <button type="button" class="residents-close" aria-label="Close resident origins">Close ×</button>
      </div>
      <div class="residents-body"></div>`;
    node.querySelector(".residents-close").onclick = () => node.close();
    node.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      node.close();
    });
    node.addEventListener("close", () => {
      if (node.open) return;
      request++;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    });
    document.body.append(node);
    return node;
  }

  function percentage(value, total) {
    if (value == null || total == null || total <= 0) return "—";
    const ratio = value / total;
    if (ratio > 0 && ratio < 0.001) return "<0.1%";
    return percent.format(ratio);
  }

  function render(dataset, body) {
    body.innerHTML = `
      <div class="residents-snapshot">
        <div><p class="residents-total-label"></p>
          <strong class="residents-total"></strong>
          <p class="residents-date"></p></div>
        <label>Snapshot year<select class="residents-year"></select></label>
        <p class="residents-population" hidden></p>
      </div>
      <p class="residents-definition"></p>
      <p class="residents-country-note" hidden></p>
      <div class="residents-filters">
        <label>Find an origin<input class="residents-search" type="search" placeholder="Country or area"></label>
      </div>
      <p class="residents-results" role="status"></p>
      <table class="residents-table">
        <caption>Origins of the international migrant population</caption>
        <thead><tr><th scope="col">Origin</th><th scope="col">Residents</th><th scope="col">Share of migrant residents</th></tr></thead>
        <tbody></tbody>
      </table>
      <button type="button" class="residents-more" hidden></button>
      <p class="residents-coverage"></p>
      <p class="residents-source"></p>`;
    body.querySelector(".residents-total-label").textContent = dataset.label || "International migrant residents";
    body.querySelector(".residents-definition").textContent = dataset.basis;
    if (dataset.countryNote) {
      const note = body.querySelector(".residents-country-note");
      note.textContent = dataset.countryNote;
      note.hidden = false;
    }
    body.querySelector(".residents-coverage").textContent = dataset.coverageNote;
    const credits = body.querySelector(".residents-source");
    for (const [label, url] of [[dataset.source.name, dataset.source.url],
      ["Source workbook", dataset.source.workbookUrl], [dataset.populationSource?.name, dataset.populationSource?.url],
      ["CC BY 3.0 IGO", dataset.source.licenseUrl]]) {
      if (!url) continue;
      if (credits.childNodes.length) credits.append(" · ");
      const link = element("a", label + " ↗");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      credits.append(link);
    }

    const yearPicker = body.querySelector(".residents-year");
    const search = body.querySelector(".residents-search");
    const more = body.querySelector(".residents-more");
    const results = body.querySelector(".residents-results");
    const rows = body.querySelector("tbody");
    let limit = PAGE_SIZE;
    let sorted = [];
    for (const year of dataset.years.slice().sort((a, b) => b - a)) {
      const option = element("option", year);
      option.value = year;
      yearPicker.append(option);
    }

    function renderRows() {
      const query = search.value.trim().toLocaleLowerCase();
      const selected = sorted.filter(({ name, code }) =>
        (name + " " + code).toLocaleLowerCase().includes(query));
      const shown = selected.slice(0, limit);
      const total = dataset.total[dataset.years.indexOf(Number(yearPicker.value))];
      rows.replaceChildren();
      for (const { name, value } of shown) {
        const row = rows.insertRow();
        const heading = element("th", name);
        heading.scope = "row";
        row.append(heading, element("td", value == null ? "Unavailable" : number.format(value)),
          element("td", percentage(value, total)));
      }
      body.querySelector(".residents-table").hidden = !selected.length;
      results.textContent = selected.length
        ? `Showing ${shown.length} of ${selected.length} origin entries.`
        : query ? "No listed origin matches your search." : "Origin figures are unavailable for this snapshot.";
      more.hidden = shown.length >= selected.length;
      more.textContent = `Show ${Math.min(PAGE_SIZE, selected.length - shown.length)} more`;
    }
    function updateYear() {
      const year = Number(yearPicker.value);
      const index = dataset.years.indexOf(year);
      const total = dataset.total[index];
      body.querySelector(".residents-total").textContent = total == null ? "Unavailable" : number.format(total);
      body.querySelector(".residents-date").textContent = `Estimated residents on 1 July ${year}`;
      const population = dataset.population?.[index];
      const comparison = body.querySelector(".residents-population");
      comparison.hidden = !(total != null && population > 0);
      if (!comparison.hidden) {
        const basis = dataset.populationSource.projectionYears.includes(year) ? "projection" : "estimate";
        comparison.textContent = `${percentage(total, population)} of all residents, using the UN’s midyear population ${basis} of ${number.format(population)}.`;
      }
      body.querySelector("caption").textContent = total == null
        ? "Origins of migrant residents"
        : `Origins of the ${number.format(total)} migrant residents`;
      sorted = dataset.origins.map(({code, name, values}) => ({code, name, value: values[index]}));
      if (dataset.other?.[index] != null) {
        sorted.push({ code: "", name: "Other origins", value: dataset.other[index] });
      }
      sorted.sort((a, b) =>
        Number(a.value == null) - Number(b.value == null) ||
        (b.value ?? 0) - (a.value ?? 0) || a.name.localeCompare(b.name));
      limit = PAGE_SIZE;
      renderRows();
    }
    yearPicker.onchange = updateYear;
    search.oninput = () => { limit = PAGE_SIZE; renderRows(); };
    more.onclick = () => { limit += PAGE_SIZE; renderRows(); };
    updateYear();
  }

  async function loadCountry(code) {
    if (!cache.has(code)) {
      const pending = fetch(`data/residents/${code}.json`, { cache: "no-cache" }).then(async response => {
        if (response.status === 404) return null;
        if (!response.ok) throw Error("Could not load resident origins");
        const data = await response.json();
        if (data.destination !== code || !data.years?.length || !Array.isArray(data.origins) ||
            data.total?.length !== data.years.length || !data.source?.url)
          throw Error("Incomplete resident snapshot");
        return data;
      }).catch(error => { cache.delete(code); throw error; });
      cache.set(code, pending);
    }
    return cache.get(code);
  }

  window.openResidents = async function openResidents(code) {
    if (typeof pauseMovement === "function") pauseMovement();
    if (!dialog) dialog = createDialog();
    const token = ++request;
    const body = dialog.querySelector(".residents-body");
    const name = typeof countries !== "undefined" && countries?.[code]?.name;
    dialog.querySelector("h2").textContent = name ? `Who lives in ${name}?` : "Who lives here?";
    if (!dialog.open) {
      returnFocus = document.activeElement;
      dialog.showModal();
    }
    dialog.scrollTop = 0;
    const status = element("p", "Loading resident population…");
    status.setAttribute("role", "status");
    body.replaceChildren(status);
    if (!/^[A-Z]{3}$/.test(code || "")) {
      status.textContent = "Choose a country to explore the origins of its residents.";
      return;
    }
    try {
      const data = await loadCountry(code);
      if (token !== request || !dialog.open) return;
      if (data === null) {
        status.textContent = `The resident population by origin is unavailable for ${name || code} in this collection.`;
        return;
      }
      dialog.querySelector("h2").textContent = `Who lives in ${data.name}?`;
      render(data, body);
    } catch {
      if (token !== request || !dialog.open) return;
      status.textContent = "The resident population figures could not be loaded.";
      const retry = element("button", "Retry");
      retry.type = "button";
      retry.onclick = () => openResidents(code);
      body.append(retry);
    }
  };
})();

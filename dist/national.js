/* National publications have a separate coverage and period from the bilateral map. */
(() => {
  const files = new Map();
  function readCountry(country) {
    if (!files.has(country)) {
      const pending = fetch("data/national/countries/" + country + ".json").then(async response => {
        if (!response.ok) throw Error("National series unavailable");
        const data = await response.json();
        if (data.country !== country || !data.sources || data.minYear !== 1950 || data.maxYear !== 2024 ||
            !Array.isArray(data.years) || data.years.length !== data.maxYear - data.minYear + 1)
          throw Error("Incomplete national series");
        for (const [index, row] of data.years.entries()) {
          if (row.year !== data.minYear + index) throw Error("Unexpected national period");
          for (const field of ["immigration", "emigration", "net"]) {
            const metric = row[field];
            if (metric === null) continue;
            if (!metric || !Number.isSafeInteger(metric.value) || (field !== "net" && metric.value < 0) ||
                !["published", "derived", "estimate", "projection"].includes(metric.kind) ||
                !Array.isArray(metric.flags) || !Array.isArray(metric.sourceIds) || !metric.sourceIds.length ||
                !metric.sourceIds.every(id => data.sources[id]?.url && data.sources[id].name))
              throw Error("Invalid national observation");
          }
        }
        return data;
      }).catch(error => { files.delete(country); throw error; });
      files.set(country, pending);
    }
    return files.get(country);
  }

  window.loadNational = async (country, start, end) => {
    if (!/^[A-Z]{3}$/.test(country) || !Number.isInteger(start) || !Number.isInteger(end) ||
        start < 1950 || end > 2024 || start > end) throw Error("Invalid national selection");
    const data = await readCountry(country);
    return {start, end, minYear: data.minYear, maxYear: data.maxYear,
      sources: data.sources, years: data.years.slice(start - data.minYear, end - data.minYear + 1)};
  };
})();

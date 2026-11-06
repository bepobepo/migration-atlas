/* Resolve comparable annual official flows over the unchanged FLOW baseline. */
const MODEL_SOURCE_ID = "flow-v1";
let dataPolicy = "best";
let officialResolver = null;
let officialReadyPromise = null;

function createProvenanceResolver(payload, initialPolicy = "best") {
  const sources = {
    [MODEL_SOURCE_ID]: {
      id: MODEL_SOURCE_ID,
      name: "FLOW v1.0",
      kind: "modelled",
      url: "https://data.humdata.org/dataset/annual-migration-flow-estimates-by-sex-between-all-countries-since-1960",
    },
  };
  for (const [id, source] of Object.entries(payload?.sources || {})) {
    sources[id] = {
      ...source,
      id,
      name: source.name || source.label || source.provider || id,
    };
  }
  const index = new Map();
  const byPair = new Map();
  const resolvedRows = new WeakMap();
  const resolvedSeries = new WeakMap();
  let policy = "best";
  const key = (a, b, year) => `${a}:${b}:${year}`;
  const pair = (a, b) => `${a}:${b}`;
  const tenths = (value) => {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isSafeInteger(Math.round(value * 10)) ||
      Math.abs(value * 10 - Math.round(value * 10)) > 1e-5
    )
      throw Error("Invalid official/model flow value");
    return Math.round(value * 10);
  };
  function flagsOf(flags) {
    if (flags == null || flags === "") return [];
    const parts = Array.isArray(flags) ? flags : String(flags).split(/[\s,;]+/);
    return [
      ...new Set(
        parts.flatMap((part) => {
          const value = String(part).trim();
          return /^[a-z]+$/i.test(value) && value.length <= 5
            ? value.toLowerCase().split("")
            : value
              ? [value]
              : [];
        }),
      ),
    ];
  }
  if (!payload || !Array.isArray(payload.records))
    throw Error("Official records are unavailable");
  for (const input of payload.records) {
    const { origin, destination, year, sourceId } = input;
    if (
      !/^[A-Z]{3}$/.test(origin || "") ||
      !/^[A-Z]{3}$/.test(destination || "") ||
      origin === destination ||
      !Number.isInteger(year) ||
      year < 1960 ||
      year > 2024 ||
      !sources[sourceId]
    )
      throw Error("Invalid official flow identity or provenance");
    // Suppressed/confidential observations must be removed by the importer,
    // never normalized into an official zero here.
    if (input.value == null || input.modelValue == null)
      throw Error("Missing official/model baseline value");
    const record = {
      ...input,
      flags: flagsOf(input.flags),
      valueTenths: tenths(input.value),
      modelTenths: tenths(input.modelValue),
    };
    if (
      record.flags.some((flag) => flag === "c" || flag === ":" || flag === "n")
    )
      throw Error("Suppressed official observation cannot override a model");
    const id = key(origin, destination, year);
    if (index.has(id))
      throw Error(
        "Duplicate official flow; choose a reporter before resolving",
      );
    index.set(id, record);
    const p = pair(origin, destination);
    if (!byPair.has(p)) byPair.set(p, []);
    byPair.get(p).push(record);
  }
  for (const records of byPair.values())
    records.sort((a, b) => a.year - b.year);
  function setPolicy(value) {
    if (value !== "best" && value !== "model")
      throw Error("Unknown migration data policy");
    policy = value;
    return policy;
  }
  setPolicy(initialPolicy);
  function estimated(record) {
    return (
      record.flags.includes("e") ||
      record.flags.includes("i") ||
      sources[record.sourceId]?.kind === "official-estimate" ||
      sources[record.sourceId]?.estimated === true
    );
  }
  function getPoint(origin, destination, year) {
    const record = index.get(key(origin, destination, year));
    const official = policy === "best" && !!record;
    const isEstimate = official && estimated(record);
    return {
      year,
      origin,
      destination,
      value: record ? (official ? record.value : record.modelValue) : null,
      officialValue: record?.value ?? null,
      officialSourceId: record?.sourceId ?? null,
      modelValue: record?.modelValue ?? null,
      sourceId: official ? record.sourceId : MODEL_SOURCE_ID,
      provider:
        sources[official ? record.sourceId : MODEL_SOURCE_ID]?.provider ||
        sources[official ? record.sourceId : MODEL_SOURCE_ID]?.name,
      basis: official
        ? isEstimate
          ? "official-estimate"
          : "official-statistic"
        : "modelled",
      kind: official
        ? isEstimate
          ? "official-estimate"
          : "official-statistic"
        : "modelled",
      flags: official ? record.flags.slice() : [],
      reportingCountry: official
        ? record.reportingCountry ||
          sources[record.sourceId]?.reportingCountry ||
          null
        : null,
      ageDefinition: official ? record.ageDefinition || null : null,
      measure: official
        ? record.measure || sources[record.sourceId]?.measure || null
        : "modelled-flow",
      source: sources[official ? record.sourceId : MODEL_SOURCE_ID],
      alternatives: official ? record.alternatives || [] : [],
    };
  }
  function summarizeProvenance(corridors, start, end) {
    const unique = new Map();
    for (const corridor of corridors || []) {
      const [origin, destination] = corridor;
      if (origin && destination && origin !== destination)
        unique.set(pair(origin, destination), [origin, destination]);
    }
    const result = {
      official: 0,
      officialEstimated: 0,
      modelled: 0,
      total: 0,
      sourceIds: [],
      flags: [],
    };
    const sourceIds = new Set(),
      flags = new Set();
    const first = Math.max(1960, start),
      last = Math.min(2024, end);
    if (Number.isInteger(start) && Number.isInteger(end) && first <= last) {
      for (const [pairKey, [origin, destination]] of unique) {
        result.total += last - first + 1;
        // Most worldwide corridor-years have no official import. Avoid building
        // per-year inspection objects or searching an entirely modelled pair.
        if (policy === "model" || !byPair.has(pairKey)) {
          result.modelled += last - first + 1;
          sourceIds.add(MODEL_SOURCE_ID);
          continue;
        }
        for (let year = first; year <= last; year++) {
          const record = index.get(key(origin, destination, year));
          if (record) {
            result.official++;
            if (estimated(record)) result.officialEstimated++;
            sourceIds.add(record.sourceId);
            for (const flag of record.flags) flags.add(flag);
          } else {
            result.modelled++;
            sourceIds.add(MODEL_SOURCE_ID);
          }
        }
      }
    }
    result.sourceIds = [...sourceIds];
    result.flags = [...flags].sort();
    result.label = !result.total
      ? "No comparable data"
      : result.official && result.modelled
        ? "Mixed official and modelled"
        : result.modelled
          ? "Modelled estimate"
          : result.officialEstimated
            ? "Official estimates"
            : "Official statistics";
    result.basis = !result.total
      ? "unavailable"
      : result.official && result.modelled
        ? "mixed"
        : result.modelled
          ? "modelled"
          : result.officialEstimated
            ? "official-estimate"
            : "official-statistic";
    return result;
  }
  function getRouteProvenance(origin, destination, start, end) {
    const summary = summarizeProvenance([[origin, destination]], start, end);
    const years = [];
    for (
      let year = Math.max(1960, start);
      Number.isInteger(year) && year <= Math.min(2024, end);
      year++
    )
      years.push(getPoint(origin, destination, year));
    return {
      ...summary,
      summary,
      origin,
      destination,
      start,
      end,
      years,
      sources: summary.sourceIds.map((id) => sources[id]),
    };
  }
  function resolveRows(rawRows, start, end) {
    const prior = resolvedRows.get(rawRows);
    if (prior && (prior.start !== start || prior.end !== end))
      throw Error(
        "Resolved migration rows cannot be reused for a different interval",
      );
    const baseline = prior ? prior.baseline : rawRows.map((row) => row.slice());
    const rows = baseline.map((row) => row.slice());
    const positions = new Map();
    for (let i = 0; i < rows.length; i++) {
      const [a, b, value] = rows[i],
        id = pair(a, b);
      if (positions.has(id)) throw Error("Duplicate model corridor");
      tenths(value);
      positions.set(id, i);
    }
    if (policy === "best") {
      for (const [id, position] of positions) {
        const records = (byPair.get(id) || []).filter(
          (record) => record.year >= start && record.year <= end,
        );
        if (!records.length) continue;
        const baselineTenths = tenths(rows[position][2]);
        const knownBaseline = records.reduce(
          (sum, record) => sum + record.modelTenths,
          0,
        );
        if (
          (start === end && knownBaseline !== baselineTenths) ||
          knownBaseline > baselineTenths
        )
          throw Error("Official override baseline does not match FLOW");
        const delta = records.reduce(
          (sum, record) => sum + record.valueTenths - record.modelTenths,
          0,
        );
        const value = baselineTenths + delta;
        if (!Number.isSafeInteger(value) || value < 0)
          throw Error("Invalid resolved migration total");
        rows[position][2] = value / 10;
      }
    }
    resolvedRows.set(rows, { baseline, start, end });
    return rows;
  }
  function resolveSeries(rawSeries, direction) {
    if (direction !== "out" && direction !== "in")
      throw Error("Resolve one directed series at a time");
    const prior = resolvedSeries.get(rawSeries);
    if (prior && prior.direction !== direction)
      throw Error("Resolved series direction mismatch");
    const baseline = prior
      ? prior.baseline
      : {
          ...rawSeries,
          peers: Object.fromEntries(
            Object.entries(rawSeries.peers).map(([peer, values]) => [
              peer,
              values.slice(),
            ]),
          ),
        };
    const result = {
      ...baseline,
      peers: Object.fromEntries(
        Object.entries(baseline.peers).map(([peer, values]) => [
          peer,
          values.slice(),
        ]),
      ),
    };
    const startYear = Number.isInteger(baseline.startYear)
      ? baseline.startYear
      : 1960;
    for (const [peer, values] of Object.entries(result.peers)) {
      const origin = direction === "out" ? baseline.country : peer;
      const destination = direction === "out" ? peer : baseline.country;
      for (const record of byPair.get(pair(origin, destination)) || []) {
        const offset = record.year - startYear;
        if (offset < 0 || offset >= values.length) continue;
        if (values[offset] !== record.modelTenths)
          throw Error("Official override does not match annual FLOW series");
        if (policy === "best") values[offset] = record.valueTenths;
      }
    }
    resolvedSeries.set(result, { baseline, direction });
    return result;
  }
  return {
    resolveRows,
    resolveSeries,
    summarizeProvenance,
    getRouteProvenance,
    getPoint,
    setPolicy,
    get policy() {
      return policy;
    },
    sources,
  };
}

async function officialDataReady(options = {}) {
  if (officialResolver) return officialResolver;
  if (!officialReadyPromise) {
    const fetcher = options.fetcher || globalThis.fetch;
    const url = options.url || "data/official/flows.json";
    officialReadyPromise = Promise.resolve()
      .then(() => fetcher(url))
      .then((response) => {
        if (!response.ok)
          throw Error("Official migration data could not be loaded");
        return response.json();
      })
      .then((payload) => {
        officialResolver = createProvenanceResolver(payload, dataPolicy);
        return officialResolver;
      })
      .catch((error) => {
        officialReadyPromise = null;
        officialResolver = null;
        throw error;
      });
  }
  return officialReadyPromise;
}
function setDataPolicy(policy) {
  if (policy !== "best" && policy !== "model")
    throw Error("Unknown migration data policy");
  dataPolicy = policy;
  officialResolver?.setPolicy(policy);
  return policy;
}
function currentOfficialResolver() {
  if (!officialResolver)
    throw Error(
      "Wait for complete official migration provenance before showing figures",
    );
  return officialResolver;
}
function resolveRows(...args) {
  return currentOfficialResolver().resolveRows(...args);
}
function resolveSeries(...args) {
  return currentOfficialResolver().resolveSeries(...args);
}
function summarizeProvenance(...args) {
  return currentOfficialResolver().summarizeProvenance(...args);
}
function getRouteProvenance(...args) {
  return currentOfficialResolver().getRouteProvenance(...args);
}

if (typeof module !== "undefined" && module.exports)
  module.exports = {
    createProvenanceResolver,
    officialDataReady,
    setDataPolicy,
    resolveRows,
    resolveSeries,
    summarizeProvenance,
    getRouteProvenance,
    MODEL_SOURCE_ID,
    get dataPolicy() {
      return dataPolicy;
    },
  };

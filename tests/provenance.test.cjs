const assert = require("node:assert/strict");
const provenance = require("../dist/provenance.js");

const payload = {
  sources: {
    immigration: {
      name: "Eurostat immigration",
      provider: "Eurostat",
      measure: "immigration_previous_residence",
      url: "https://ec.europa.eu/eurostat/",
    },
    emigration: {
      name: "Eurostat emigration",
      provider: "Eurostat",
      measure: "emigration_next_residence",
      url: "https://ec.europa.eu/eurostat/",
    },
  },
  records: [
    {
      origin: "BLR",
      destination: "POL",
      year: 2020,
      value: 1000,
      modelValue: 10,
      sourceId: "immigration",
      reportingCountry: "POL",
      flags: "p",
      alternatives: [{ sourceId: "emigration", value: 900 }],
    },
    {
      origin: "BLR",
      destination: "POL",
      year: 2021,
      value: 0,
      modelValue: 20,
      sourceId: "immigration",
      reportingCountry: "POL",
      flags: [],
    },
    {
      origin: "BLR",
      destination: "POL",
      year: 2022,
      value: 200,
      modelValue: 30,
      sourceId: "immigration",
      reportingCountry: "POL",
      flags: "ip",
    },
    {
      origin: "POL",
      destination: "BLR",
      year: 2020,
      value: 7,
      modelValue: 5,
      sourceId: "emigration",
      reportingCountry: "POL",
      flags: "b",
    },
  ],
};

async function main() {
  const r = provenance.createProvenanceResolver(payload, "best");
  const annual = [
    ["BLR", "POL", 10],
    ["POL", "BLR", 5],
    ["ITA", "FRA", 50],
  ];
  const immutable = JSON.stringify(annual);
  const resolved = r.resolveRows(annual, 2020, 2020);
  assert.deepEqual(resolved, [
    ["BLR", "POL", 1000],
    ["POL", "BLR", 7],
    ["ITA", "FRA", 50],
  ]);
  assert.equal(JSON.stringify(annual), immutable);
  assert.deepEqual(
    r.resolveRows(resolved, 2020, 2020),
    resolved,
    "repeated resolution cannot apply correction twice",
  );
  assert.equal(
    r.resolveRows([["BLR", "POL", 20]], 2021, 2021)[0][2],
    0,
    "official zero replaces a positive model",
  );
  const multi = r.resolveRows([["BLR", "POL", 150]], 2020, 2024);
  assert.equal(multi[0][2], 1290, "official points and model gaps sum exactly");
  assert.equal(r.resolveRows([["BLR", "POL", 60]], 2020, 2022)[0][2], 1200);
  assert.throws(
    () => r.resolveRows([["BLR", "POL", 11]], 2020, 2020),
    /baseline/,
  );
  assert.throws(
    () => r.resolveRows(resolved, 2020, 2024),
    /different interval/,
  );

  const rawOut = {
    country: "BLR",
    startYear: 2020,
    peers: { POL: [100, 200, 300, 400, 500], ISR: [0, 0, 1, 1, 0] },
  };
  const rawIn = {
    country: "POL",
    startYear: 2020,
    peers: { BLR: [100, 200, 300, 400, 500] },
  };
  const out = r.resolveSeries(rawOut, "out");
  const incoming = r.resolveSeries(rawIn, "in");
  assert.deepEqual(out.peers.POL, [10000, 0, 2000, 400, 500]);
  assert.deepEqual(
    incoming.peers.BLR,
    out.peers.POL,
    "both series orientations use the same directed observation",
  );
  assert.deepEqual(rawOut.peers.POL, [100, 200, 300, 400, 500]);
  assert.deepEqual(r.resolveSeries(out, "out"), out);
  assert.equal(
    out.peers.POL.reduce((sum, value) => sum + value, 0) / 10,
    multi[0][2],
  );
  assert.throws(
    () =>
      r.resolveSeries(
        { country: "BLR", startYear: 2020, peers: { POL: [999] } },
        "out",
      ),
    /baseline|match/,
  );
  assert.throws(() => r.resolveSeries(rawOut, "both"), /directed/);
  const reverse = r.resolveSeries(
    { country: "POL", startYear: 2020, peers: { BLR: [50] } },
    "out",
  );
  assert.deepEqual(reverse.peers.BLR, [70]);

  const summary = r.summarizeProvenance(
    [
      ["BLR", "POL"],
      ["BLR", "POL"],
    ],
    2020,
    2024,
  );
  assert.equal(summary.label, "Mixed official and modelled");
  assert.deepEqual(
    [
      summary.official,
      summary.officialEstimated,
      summary.modelled,
      summary.total,
    ],
    [3, 1, 2, 5],
  );
  assert.deepEqual(summary.flags, ["i", "p"]);
  assert.deepEqual(summary.sourceIds, [
    "immigration",
    provenance.MODEL_SOURCE_ID,
  ]);
  assert.equal(
    r.summarizeProvenance([["BLR", "POL"]], 2020, 2022).label,
    "Official estimates",
  );
  assert.equal(
    r.summarizeProvenance([["BLR", "POL"]], 2020, 2020).label,
    "Official statistics",
  );
  assert.equal(
    r.summarizeProvenance([["ITA", "FRA"]], 2020, 2024).label,
    "Modelled estimate",
  );
  assert.equal(
    r.summarizeProvenance([["BLR", "POL"]], 1950, 1959).label,
    "No comparable data",
  );
  assert.equal(r.summarizeProvenance([["BLR", "POL"]], 2021, 2020).total, 0);
  const route = r.getRouteProvenance("BLR", "POL", 2020, 2024);
  assert.equal(route.years.length, 5);
  assert.equal(route.years[0].value, 1000);
  assert.equal(route.years[0].provider, "Eurostat");
  assert.equal(route.years[0].reportingCountry, "POL");
  assert.deepEqual(route.years[0].alternatives, [
    { sourceId: "emigration", value: 900 },
  ]);
  assert.equal(route.years[2].basis, "official-estimate");
  assert.equal(route.years[3].basis, "modelled");
  assert.equal(
    route.years[3].value,
    null,
    "unknown model reference is not invented as zero",
  );

  r.setPolicy("model");
  assert.deepEqual(r.resolveRows(multi, 2020, 2024), [["BLR", "POL", 150]]);
  assert.deepEqual(r.resolveSeries(out, "out"), rawOut);
  assert.equal(r.summarizeProvenance([["BLR", "POL"]], 2020, 2024).modelled, 5);
  const modelPoint = r.getRouteProvenance("BLR", "POL", 2020, 2020).years[0];
  assert.equal(modelPoint.value, 10);
  assert.equal(modelPoint.officialValue, 1000);
  assert.equal(modelPoint.sourceId, provenance.MODEL_SOURCE_ID);
  assert.deepEqual(modelPoint.flags, []);
  assert.throws(() => r.setPolicy("unknown"), /Unknown/);

  // Official-only is the public default and preserves unavailable observations.
  const officialOnly = provenance.createProvenanceResolver(payload);
  assert.equal(officialOnly.policy, "official");
  assert.equal(provenance.dataPolicy, "official");
  const officialAnnual = officialOnly.resolveRows(annual, 2020, 2020);
  assert.deepEqual(officialAnnual, [
    ["BLR", "POL", 1000],
    ["POL", "BLR", 7],
  ]);
  const officialRange = officialOnly.resolveRows(
    [
      ["BLR", "POL", 150],
      ["ITA", "FRA", 80],
    ],
    2020,
    2024,
  );
  assert.deepEqual(
    officialRange,
    [["BLR", "POL", 1200]],
    "only published official observations enter the subtotal",
  );
  assert.deepEqual(
    officialOnly.resolveRows(officialRange, 2020, 2024),
    officialRange,
  );
  assert.deepEqual(
    officialOnly.resolveRows([["BLR", "POL", 20]], 2021, 2021),
    [["BLR", "POL", 0]],
    "published zero survives official-only filtering",
  );
  const missingPoint = officialOnly.getPoint("ITA", "FRA", 2020);
  assert.deepEqual(
    [missingPoint.value, missingPoint.sourceId, missingPoint.source],
    [null, null, null],
  );
  assert.equal(missingPoint.basis, "unavailable");
  assert.equal(missingPoint.measure, "official-flow-unavailable");
  const officialSummary = officialOnly.summarizeProvenance(
    [["BLR", "POL"]],
    2020,
    2024,
  );
  assert.deepEqual(
    [
      officialSummary.official,
      officialSummary.missing,
      officialSummary.modelled,
      officialSummary.total,
    ],
    [3, 2, 0, 5],
  );
  assert.equal(officialSummary.label, "Partial official estimates");
  assert.equal(officialSummary.basis, "official-partial");
  assert.deepEqual(officialSummary.sourceIds, ["immigration"]);
  const noOfficial = officialOnly.getRouteProvenance("ITA", "FRA", 2020, 2024);
  assert.equal(noOfficial.label, "Official data unavailable");
  assert.equal(noOfficial.missing, 5);
  assert.equal(noOfficial.basis, "unavailable");
  assert.deepEqual(noOfficial.sources, []);
  assert.equal(
    officialOnly.summarizeProvenance([["BLR", "POL"]], 2020, 2021).label,
    "Official statistics",
  );
  assert.equal(
    officialOnly.summarizeProvenance([["POL", "BLR"]], 2020, 2021).label,
    "Partial official statistics",
  );
  const officialOut = officialOnly.resolveSeries(rawOut, "out");
  const officialIn = officialOnly.resolveSeries(rawIn, "in");
  assert.deepEqual(officialOut.peers.POL, [10000, 0, 2000, null, null]);
  assert.deepEqual(officialOut.peers.ISR, [null, null, null, null, null]);
  assert.deepEqual(officialIn.peers.BLR, officialOut.peers.POL);
  assert.deepEqual(officialOnly.resolveSeries(officialOut, "out"), officialOut);
  assert.deepEqual(rawOut.peers.POL, [100, 200, 300, 400, 500]);
  assert.equal(
    officialOut.peers.POL.reduce((sum, value) => sum + (value ?? 0), 0) / 10,
    officialRange[0][2],
  );
  officialOnly.setPolicy("best");
  assert.deepEqual(
    officialOnly.resolveRows(officialRange, 2020, 2024),
    [
      ["BLR", "POL", 1290],
      ["ITA", "FRA", 80],
    ],
    "mixed comparison restores all original corridors after official filtering",
  );
  assert.deepEqual(
    officialOnly.resolveSeries(officialOut, "out").peers.POL,
    out.peers.POL,
  );
  officialOnly.setPolicy("model");
  assert.deepEqual(officialOnly.resolveRows(officialRange, 2020, 2024), [
    ["BLR", "POL", 150],
    ["ITA", "FRA", 80],
  ]);
  assert.deepEqual(officialOnly.resolveSeries(officialOut, "out"), rawOut);
  officialOnly.setPolicy("official");
  assert.throws(
    () => officialOnly.resolveRows([["BLR", "POL", 11]], 2020, 2020),
    /baseline/,
  );
  assert.throws(
    () =>
      officialOnly.resolveSeries(
        { country: "BLR", startYear: 2020, peers: { POL: [999] } },
        "out",
      ),
    /baseline|match/,
  );

  assert.throws(
    () =>
      provenance.createProvenanceResolver({
        ...payload,
        records: [...payload.records, payload.records[0]],
      }),
    /Duplicate/,
  );
  for (const flags of ["c", "N", ":"])
    assert.throws(
      () =>
        provenance.createProvenanceResolver({
          ...payload,
          records: [{ ...payload.records[0], flags }],
        }),
      /Suppressed/,
    );
  assert.throws(
    () =>
      provenance.createProvenanceResolver({
        ...payload,
        records: [{ ...payload.records[0], value: null }],
      }),
    /Missing/,
  );
  assert.throws(
    () => provenance.resolveRows(annual, 2020, 2020),
    /Wait for complete/,
  );
  let fetches = 0;
  const fetcher = async () => {
    fetches++;
    if (fetches === 1) throw Error("offline");
    return { ok: true, json: async () => payload };
  };
  await assert.rejects(provenance.officialDataReady({ fetcher }), /offline/);
  await provenance.officialDataReady({ fetcher });
  await provenance.officialDataReady({ fetcher });
  assert.equal(
    fetches,
    2,
    "failed loads can retry; successful index is cached",
  );
  assert.equal(provenance.resolveRows(annual, 2020, 2020)[0][2], 1000);
  provenance.setDataPolicy("model");
  assert.equal(provenance.dataPolicy, "model");
  assert.equal(provenance.resolveRows(annual, 2020, 2020)[0][2], 10);
  console.log(
    "PASS provenance: official-only default, missing observations, partial coverage, annual/range/series agreement, zero overrides, immutable baseline, directional consistency, flags, all policy comparisons, failures and retry.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

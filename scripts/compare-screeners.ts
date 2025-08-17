#!/usr/bin/env ts-node

import {
  getScreenerSnapshot,
  compareCriteria,
  compareDataSources,
  compareCandidateSets,
  stepThroughV2,
  saveJSON,
} from "../src/debug/screener-debug";

async function main() {
  console.log("== AlphaStack Screener Debug ==");
  console.log(`BASE_URL=${process.env.BASE_URL ?? "http://localhost:3001"}`);

  const [snapV1, snapV2] = await Promise.all([
    getScreenerSnapshot("v1"),
    getScreenerSnapshot("v2"),
  ]);

  console.log(`V1 candidates: ${snapV1.candidates.length}`);
  console.log(`V2 candidates: ${snapV2.candidates.length}`);

  const critDiff = compareCriteria(snapV1.criteria, snapV2.criteria);
  const dsDiff = compareDataSources(snapV1.dataSources, snapV2.dataSources);
  const setDiff = compareCandidateSets(snapV1.candidates, snapV2.candidates);

  // Persist artifacts for inspection
  saveJSON("debug/snapshots/v1.json", snapV1);
  saveJSON("debug/snapshots/v2.json", snapV2);
  saveJSON("debug/diffs/criteria.json", critDiff);
  saveJSON("debug/diffs/datasources.json", dsDiff);
  saveJSON("debug/diffs/candidates.json", setDiff);

  console.log("\n== Candidate Set Diff ==");
  console.table({
    V1: setDiff.countA,
    V2: setDiff.countB,
    Overlap: setDiff.both.length,
    Only_V1: setDiff.onlyA.length,
    Only_V2: setDiff.onlyB.length,
  });

  if (setDiff.onlyV2?.length || setDiff.onlyA.length || setDiff.onlyB.length) {
    console.log(`Only in V1 (${setDiff.onlyA.length}):`, setDiff.onlyA.slice(0, 25));
    console.log(`Only in V2 (${setDiff.onlyB.length}):`, setDiff.onlyB.slice(0, 25));
  }

  console.log("\n== Criteria Diff ==");
  console.log("Missing in V1:", critDiff.missingInA);
  console.log("Missing in V2:", critDiff.missingInB);
  if (critDiff.diffs.length) {
    console.table(critDiff.diffs.map(d => ({ key: d.key, v1: JSON.stringify(d.a), v2: JSON.stringify(d.b) })));
  } else {
    console.log("No value diffs.");
  }

  console.log("\n== Data Source Diff ==");
  console.log("Only in V1:", dsDiff.onlyA.map(d => `${d.name}@${d.version ?? "?"}`));
  console.log("Only in V2:", dsDiff.onlyB.map(d => `${d.name}@${d.version ?? "?"}`));

  console.log("\n== V2 Stepwise Filter Trace ==");
  const stepReports = await stepThroughV2();
  // Summarize drops per filter
  for (const step of stepReports) {
    console.log(
      `${step.filterName}: ${step.beforeCount} -> ${step.afterCount} (-${step.beforeCount - step.afterCount})`
    );
  }
  saveJSON("debug/stepwise/v2.json", stepReports);

  console.log("\nDone. Inspect ./debug/** artifacts for full detail.");
}

main().catch((e) => {
  console.error("Debug runner failed:", e);
  process.exit(1);
});
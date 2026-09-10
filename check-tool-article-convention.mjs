#!/usr/bin/env node
/**
 * Enforces the site's own tool/article convention (see
 * roadmap-acquisizione.md, 2026-09-09 entry, and the site's own
 * architecture review): every tool in blog/tools/ ships fixed,
 * single-language code; every article in blog/posts/ shows both
 * Python and R as real, editable, executable cells, side by side.
 *
 * This was never written down before it was discovered by reading
 * nine existing examples while building a tenth — this script exists
 * so the tenth one doesn't have to happen again.
 *
 * Checks only the language of {.webgeods-python #id} / {.webgeods-r
 * #id} fenced cell headers -- a plain ```python/```r markdown fence
 * (no cell, not executable) doesn't count, which is exactly how
 * raster-viewshed.qmd shows Python as inert reference only.
 *
 * Usage: node check-tool-article-convention.mjs
 * Exit code: 0 if every file follows the convention, 1 otherwise.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CELL_RE = /\{\.webgeods-(python|r)[ #}]/g;

function languagesUsedIn(filePath) {
  const text = readFileSync(filePath, "utf8");
  const langs = new Set();
  for (const m of text.matchAll(CELL_RE)) langs.add(m[1]);
  return langs;
}

function qmdFiles(dir, { exclude = [] } = {}) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".qmd") && !exclude.includes(f))
    .map((f) => path.join(dir, f));
}

// Articles that deliberately don't show BOTH languages as real cells --
// each entry documents why, so this stays a reviewed exception list,
// not a silent escape hatch.
const BILINGUAL_EXCEPTIONS = new Map([
  [
    "raster-viewshed.qmd",
    "no viewshed implementation exists in this browser's Python runtime (rasterio/GDAL have no viewshed function usable in Pyodide) -- Python is shown as an inert reference code block only, not an executable cell.",
  ],
]);

let failed = false;

console.log("== Tools: must be single-language ==");
for (const file of qmdFiles("blog/tools", { exclude: ["index.qmd"] })) {
  const langs = languagesUsedIn(file);
  const name = path.basename(file);
  if (langs.size > 1) {
    console.log(`  ✗ ${name}: uses both ${[...langs].join(" and ")} -- tools must pick one`);
    failed = true;
  } else if (langs.size === 0) {
    console.log(`  ✗ ${name}: no {.webgeods-python}/{.webgeods-r} cell found`);
    failed = true;
  } else {
    console.log(`  ✓ ${name} (${[...langs][0]})`);
  }
}

console.log("\n== Articles: must show both languages as real cells ==");
for (const file of qmdFiles("blog/posts")) {
  const name = path.basename(file);
  const langs = languagesUsedIn(file);
  const exception = BILINGUAL_EXCEPTIONS.get(name);

  if (exception) {
    console.log(`  ~ ${name}: exempted -- ${exception}`);
    continue;
  }
  if (langs.size < 2) {
    const missing = ["python", "r"].filter((l) => !langs.has(l));
    console.log(`  ✗ ${name}: missing ${missing.join(", ")} -- articles must show both languages`);
    failed = true;
  } else {
    console.log(`  ✓ ${name}`);
  }
}

console.log("");
if (failed) {
  console.log("FAILED: one or more files break the tool/article convention -- see above.");
  process.exit(1);
}
console.log("All tools and articles follow the convention.");

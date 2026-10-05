#!/usr/bin/env node
/**
 * Records what a tool or article page shows after the usual run, so a
 * migrated page can be compared with the one it replaces: works the
 * same on OJS, Dashboard and Preact pages, it only looks at the DOM and
 * the map.
 *
 *   node capture-page.mjs <page URL> [out.json] [--article]
 *
 * Tool page: Load example, then the compute button if there is one
 * (first panel button whose label starts with ▶), waiting for every "⌛" to
 * clear. Article page (--article): runs every Python and R cell in page
 * order. Then records, as JSON:
 *   stats    text of every stat card (whitespace collapsed)
 *   sources  feature count per GeoJSON map source, plus image sources
 *   legend   text of every legend
 *   rows     row count of every table
 *   status   the status line
 * Basemap sources are ignored. Prints the JSON and writes it to out.json
 * if given; `node capture-page.mjs --compare a.json b.json` prints the
 * differences between two captures.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);

if (args[0] === "--compare") {
  const [a, b] = [JSON.parse(readFileSync(args[1], "utf8")), JSON.parse(readFileSync(args[2], "utf8"))];
  let same = true;
  // Key order inside an object (map sources) doesn't matter.
  const sorted = (v) => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]))
    : v);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const [x, y] = [JSON.stringify(sorted(a[key])), JSON.stringify(sorted(b[key]))];
    if (x !== y) {
      same = false;
      console.log(`≠ ${key}\n  before: ${x}\n  after:  ${y}`);
    }
  }
  console.log(same ? "SAME" : "DIFFERENT");
  process.exit(same ? 0 : 1);
}

const url = args.find((a) => !a.startsWith("--") && /^https?:/.test(a));
const out = args.find((a) => a.endsWith(".json"));
const article = args.includes("--article");
const TIMEOUT = 400000;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(TIMEOUT);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".maplibregl-canvas");
await page.waitForTimeout(1500);

const settle = async () => {
  await page.waitForFunction(() => ![...document.querySelectorAll("button, .webgeods-panel-status")].some((e) => (e.textContent ?? "").includes("⌛")));
  await page.waitForTimeout(1500);
};

if (article) {
  const ids = await page.evaluate(() => [...document.querySelectorAll(".webgeods-editor-container")].map((e) => e.id));
  for (const id of ids) {
    await page.evaluate(async (cellId) => { try { await WebGeoDS.CodeCell.find(cellId).run(); } catch (e) { console.error(e); } }, id);
  }
  await page.waitForTimeout(2500);
} else {
  await page.getByRole("button", { name: /Load example/ }).first().click();
  await page.waitForFunction(() => /example data loaded|loaded/i.test(document.body.textContent));
  await settle();
  const compute = page.locator(".webgeods-panel button.webgeods-panel-btn", { hasText: /^▶/ }).first();
  if (await compute.count()) {
    await compute.click();
    await page.waitForTimeout(500);
    await settle();
  }
}

const capture = await page.evaluate(() => {
  const text = (e) => e.textContent.replace(/\s+/g, " ").trim();
  const mapEl = document.querySelector(".webgeods-map-container");
  const map = mapEl && window.WebGeoDS.Map.find(mapEl.id)?.map;
  const sources = {};
  if (map) {
    for (const [id, source] of Object.entries(map.getStyle().sources)) {
      if (source.type === "geojson") {
        const n = map.getSource(id).serialize().data?.features?.length ?? 0;
        if (n > 0) sources[id] = n;
      } else if (source.type === "image") {
        sources[id] = "image";
      }
    }
  }
  return {
    stats: [...document.querySelectorAll(".webgeods-stat-grid")].map((grid) => [...grid.children].map(text).join(" | ")),
    sources,
    legend: [...document.querySelectorAll(".webgeods-legend")].map(text).filter(Boolean),
    rows: [...document.querySelectorAll("table.webgeods-table")].map((t) => t.querySelectorAll("tbody tr").length),
    status: text(document.querySelector(".webgeods-panel-status") ?? document.body).slice(0, 120)
  };
});
capture.errors = errors;

const json = JSON.stringify(capture, null, 2);
console.log(json);
if (out) writeFileSync(out, json);
await browser.close();

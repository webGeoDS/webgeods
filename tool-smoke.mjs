#!/usr/bin/env node
/**
 * Baseline test for any ToolDashboard tool page, derived from the tool's
 * own config (which the page exposes as WebGeoDS.Preact.tools[tool]):
 * nothing in here is specific to one tool.
 *
 *   node tool-smoke.mjs http://127.0.0.1:4801/tools/network-from-lines.html
 *
 * Serve the rendered site first (`node static-server.mjs blog/_site 4801`,
 * or `npm run dev` in preact-build/). Checks, in order:
 *   - the config has no unknown or missing fields (configCheck warnings)
 *   - example -> compute: every layer with data is on the map (the example
 *     may come from blog/examples/precomputed; compute always runs live)
 *   - stat card filled, legend shown when the config has categories
 *   - each labeled layer turns off and back on
 *   - selection from the map, the diagram, a chart bar and the table
 *     (whichever the tool has) lights the selection layer; clicking the
 *     same map feature again clears it
 *   - reset empties map, selection and stats
 *   - phone width (390px): no horizontal scroll after a compute
 *   - no errors in the console
 * A tool's own numbers stay in its own checklist; this is the floor
 * every tool gets for free. Exit code 1 if any check fails.
 */

import { chromium } from "playwright";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node tool-smoke.mjs <tool page URL> [--headed]");
  process.exit(2);
}
const headed = process.argv.includes("--headed");
const TIMEOUT = 300000; // a first compute loads the Python engine

const browser = await chromium.launch({ headless: !headed });
let failed = 0;
const skip = (name, why) => console.log(`– ${name}: skipped, ${why}`);
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

async function openTool(viewport) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(TIMEOUT);
  const errors = [];
  const warnings = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
    if (/WebGeoDS ToolDashboard/.test(m.text())) warnings.push(m.text());
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.WebGeoDS?.Preact?.tools && Object.keys(window.WebGeoDS.Preact.tools).length);
  await page.waitForSelector(".webgeods-dashboard .maplibregl-canvas");
  const tool = await page.evaluate(() => Object.keys(window.WebGeoDS.Preact.tools)[0]);
  return { page, tool, errors, warnings };
}

// In-page helpers, as strings evaluated against the exposed state.
const T = (tool) => `window.WebGeoDS.Preact.tools[${JSON.stringify(tool)}]`;
const MAP = "WebGeoDS.Map.find(document.querySelector('.webgeods-dashboard .webgeods-map-container').id).map";
const status = (page) => page.evaluate(() => document.querySelector(".webgeods-dashboard .webgeods-panel-row:nth-child(2) .webgeods-panel-status")?.textContent ?? "");
const waitStatus = (page, re) => page.waitForFunction((src) =>
  new RegExp(src).test(document.querySelector(".webgeods-dashboard .webgeods-panel-row:nth-child(2) .webgeods-panel-status")?.textContent ?? ""), re.source);
const sourceCount = (page, id) => page.evaluate(`(${MAP}).getSource(${JSON.stringify(id)})?.serialize().data.features?.length ?? 0`);
const stats = (page) => page.evaluate(() => document.querySelector(".webgeods-dashboard .webgeods-stat-grid")?.textContent.replace(/\s+/g, " ").trim() ?? "");
const idle = (page) => page.evaluate(`new Promise((resolve) => { const m = ${MAP}; if (m.loaded() && !m.isMoving()) resolve(); else m.once("idle", resolve); })`);

let exampleMs = null;

async function loadAndCompute(page, tool) {
  const exampleStatus = await page.evaluate(`${T(tool)}.config.exampleStatus ?? "example data loaded"`);
  const computeLabel = await page.evaluate(`${T(tool)}.config.computeLabel ?? "▶ Compute"`);
  const started = Date.now();
  await page.getByRole("button", { name: /Load example/ }).click();
  await page.waitForFunction((text) =>
    (document.querySelector(".webgeods-dashboard .webgeods-panel-row:nth-child(2) .webgeods-panel-status")?.textContent ?? "").includes(text.slice(0, 20)), exampleStatus);
  // A precomputed example (useToolData.js) shows without the engine.
  exampleMs = Date.now() - started;
  // A tool that only inspects has nothing more to run.
  if (!(await page.evaluate(`!!${T(tool)}.config.cells.compute`))) {
    await page.waitForTimeout(800);
    await idle(page);
    return;
  }
  await page.getByRole("button", { name: computeLabel }).click();
  await waitStatus(page, /✓ Done|failed|Error/);
  await page.waitForTimeout(800);
  await idle(page);
}

// ---- desktop ----------------------------------------------------------------

const { page, tool, errors, warnings } = await openTool({ width: 1400, height: 1000 });
console.log(`Tool: ${tool}  (${url})`);
const initialStats = await stats(page);

await loadAndCompute(page, tool);
const inspectOnly = await page.evaluate(`!${T(tool)}.config.cells.compute`);
check(inspectOnly ? "example loaded and inspected" : "example + compute finish with ✓ Done",
  inspectOnly ? !/failed|Error|⚠/.test(await status(page)) : /✓ Done/.test(await status(page)), await status(page));
check("config: no unknown or missing fields", warnings.length === 0, warnings);
console.log(`– example shown in ${exampleMs} ms (${exampleMs < 5000 ? "precomputed" : "run live"})`);

// A raster layer counts as one "feature" when it has a raster.
const layers = await page.evaluate(`${T(tool)}.layers.map((l) => ({ id: l.id, label: l.label ?? null, type: l.type,
  features: l.type === "raster" ? (l.raster ? 1 : 0) : (l.data?.features?.length ?? 0), clickable: !!l.onClick }))`);
const shown = (l) => (l.type === "raster"
  ? page.evaluate(`(${MAP}).getLayer(${JSON.stringify(l.id)}) ? 1 : 0`)
  : sourceCount(page, l.id));
const selectionLayer = await page.evaluate(`${T(tool)}.selectionLayer`);
const withData = layers.filter((l) => l.features > 0 && l.id !== selectionLayer);
const onMap = await Promise.all(withData.map(async (l) => [l.id, await shown(l), l.features]));
check(`layers with data are on the map (${withData.map((l) => l.id).join(", ")})`,
  withData.length > 0 && onMap.every(([, shown, expected]) => shown === expected), onMap);

const statText = await stats(page);
check(inspectOnly ? "stat card filled by the inspection" : "stat card filled with the result", statText.length > 0 && statText !== initialStats, statText);

const hasCategories = await page.evaluate(`!!${T(tool)}.config.categories`);
if (hasCategories) {
  const legendItems = await page.evaluate(() => document.querySelectorAll(".webgeods-dashboard .webgeods-legend > div").length);
  check("legend lists the categories", legendItems > 0, legendItems);
}

// Layer switches
const labeled = withData.filter((l) => l.label);
if (labeled.length > 1) {
  const visibility = (id) => page.evaluate(`(${MAP}).getLayoutProperty(${JSON.stringify(id)}, "visibility") ?? "visible"`);
  const results = [];
  for (const layer of labeled) {
    const box = page.locator(".webgeods-layer-control label", { hasText: layer.label }).locator("input");
    // A layer may start switched off (startHidden): each click flips it.
    const start = await visibility(layer.id);
    await box.click(); await page.waitForTimeout(200);
    const flipped = await visibility(layer.id);
    await box.click(); await page.waitForTimeout(200);
    const back = await visibility(layer.id);
    results.push([layer.label, start, flipped, back]);
  }
  check(`layer switches: ${labeled.map((l) => l.label).join(", ")}`,
    results.every(([, start, flipped, back]) => flipped !== start && back === start), results);
} else skip("layer switches", "fewer than two labeled layers with data");

// Selection
if (selectionLayer) {
  const selected = () => sourceCount(page, selectionLayer);
  const clickable = layers.find((l) => l.clickable && l.features > 0);

  if (clickable) {
    // A point feature of the clickable layer, clicked where the map draws it.
    // The map must be on screen for the mouse to reach it.
    await page.evaluate(() => document.querySelector(".webgeods-dashboard .webgeods-map-container").scrollIntoView({ block: "center" }));
    await idle(page);
    const locate = () => page.evaluate(`(() => {
      const m = ${MAP};
      const layer = ${T(tool)}.layers.find((l) => l.id === ${JSON.stringify(clickable.id)});
      // A point that is alone under its own pixel: in dense data the
      // topmost feature there could be another one.
      const points = layer.data.features.filter((f) => f.geometry?.type === "Point");
      const alone = (f) => { const q = m.project(f.geometry.coordinates); return m.queryRenderedFeatures([q.x, q.y], { layers: [layer.id] }).length === 1; };
      // Chosen once, then found again after the selection zooms.
      window.__smokeFeature ??= points.find(alone) ?? points[0];
      const feature = points.includes(window.__smokeFeature) ? window.__smokeFeature : null;
      if (!feature) return null;
      const p = m.project(feature.geometry.coordinates);
      const r = m.getCanvas().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    })()`);
    const target = await locate();
    if (target) {
      await page.mouse.click(target.x, target.y); await page.waitForTimeout(500);
      const first = await selected();
      // A selection may zoom to what it covers: find the feature again.
      await idle(page);
      const again = await locate();
      await page.mouse.click(again.x, again.y); await page.waitForTimeout(500);
      const second = await selected();
      check(`map click selects (${clickable.id}), same click clears`, first >= 1 && second === 0, { first, second });
    } else skip("map click", `no point feature in ${clickable.id}`);
  } else skip("map click", "no layer with selectBy");

  const sideId = await page.evaluate(`${T(tool)}.config.side?.id ?? null`);
  if (sideId) {
    const circle = await page.$(`#${sideId} svg circle`);
    if (circle) {
      const b = await circle.boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500);
      const n = await selected();
      check("diagram node click selects", n >= 1, n);
    } else skip("diagram click", "no diagram");
    const bar = await page.$(`#${sideId} .vega-embed .mark-rect path`);
    if (bar) {
      const b = await bar.boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(700);
      const n = await selected();
      check("chart bar click selects", n >= 1, n);
    } else skip("chart click", "no chart");
  } else skip("diagram and chart clicks", "no side panel");

  const tables = await page.evaluate(`(${T(tool)}.config.tables ?? []).map((t) => t.id)`);
  const selectableId = await page.evaluate(`${T(tool)}.config.selectable?.id ?? null`);
  if (tables.includes(selectableId)) {
    const row = page.locator(".webgeods-dashboard .webgeods-table-scroll tbody tr").first();
    await row.click(); await page.waitForTimeout(500);
    const n = await selected();
    const rows = await page.evaluate(() => document.querySelectorAll(".webgeods-dashboard tr.webgeods-row-selected").length);
    check("table row click selects one feature (map + row)", n === 1 && rows === 1, { n, rows });
  } else skip("table click", "no table of the selectable features");
} else skip("selection", "no selectable in the config");

// Reset
await page.locator(".webgeods-dashboard .webgeods-panel-row").first().getByRole("button", { name: /Reset/ }).click();
await page.waitForTimeout(800);
const afterReset = await Promise.all(withData.map(async (l) => [l.id, await shown(l)]));
const resetStats = await stats(page);
check("reset empties the map and the stats", afterReset.every(([, n]) => n === 0) &&
  (selectionLayer ? (await sourceCount(page, selectionLayer)) === 0 : true) &&
  resetStats === initialStats, { afterReset, resetStats, initialStats });

check("no errors in the console", errors.length === 0, errors);
await page.close();

// ---- phone ------------------------------------------------------------------

const phone = await openTool({ width: 390, height: 844 });
await loadAndCompute(phone.page, phone.tool);
const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("phone (390px): no horizontal scroll after compute", overflow <= 0, { overflow });
check("phone: no errors in the console", phone.errors.length === 0, phone.errors);

await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL SMOKE CHECKS PASSED");
process.exit(failed ? 1 : 0);

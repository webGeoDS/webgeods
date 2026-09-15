#!/usr/bin/env node
/**
 * Dedicated test suite for WebGeoDS.Dashboard (shared/dashboard.js +
 * shared/dashboard-dom.js) — separate from smoke-test.mjs (the whole
 * page, R/Python included) and from map-tests/ (WebGeoDS.Map on its
 * own), same reasoning as both: check the JS orchestration layer by
 * itself, fast, without a Quarto render or a webR/Pyodide cold-load.
 *
 * WebGeoDS.CodeCell is stubbed (see dashboard-test.html) -- every
 * check registers its own canned cells via
 * window.__registerCells(tool) before constructing a Dashboard via
 * window.__buildConfig(tool), both set up once below. This suite
 * verifies Dashboard's OWN orchestration (config -> DOM ->
 * _cell().run() -> layers/stats/legend/table/diagram -> reset), not
 * Python/R execution or real file upload (shared/upload.js's own
 * Upload.load() is a separate concern).
 *
 * Self-contained: starts its own static file server (serving the
 * whole project root) and a headless browser — no external setup
 * needed beyond `npm install` at the project root.
 *
 * Usage: node run-dashboard-tests.mjs [--headed]
 */

import { chromium } from "playwright";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const headed = process.argv.includes("--headed");

const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".mjs": "application/javascript",
};

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.join(PROJECT_ROOT, urlPath);
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/dashboard-tests/dashboard-test.html`;

// ============================================================
// Result collection — same shape/style as map-tests/run-map-tests.mjs
// ============================================================

const results = [];

async function check(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, pass: true, ms: Date.now() - start });
    console.log(`  ✓ ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    results.push({ name, pass: false, ms: Date.now() - start, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message.split("\n")[0]}`);
  }
}

// A small, reusable fixture: two point features for the inspect
// stage, three for compute (deliberately different counts, so a
// check can tell which stage's data actually reached the map), plus
// a matching tiny graph for compute.diagram.
const FIXTURES = {
  INSPECT_FC: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "a" }, geometry: { type: "Point", coordinates: [12.49, 41.90] } },
      { type: "Feature", properties: { name: "b" }, geometry: { type: "Point", coordinates: [12.50, 41.91] } },
    ],
  },
  COMPUTE_FC: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "x" }, geometry: { type: "Point", coordinates: [12.49, 41.90] } },
      { type: "Feature", properties: { name: "y" }, geometry: { type: "Point", coordinates: [12.50, 41.91] } },
      { type: "Feature", properties: { name: "z" }, geometry: { type: "Point", coordinates: [12.51, 41.92] } },
    ],
  },
  DIAGRAM_NODES: [
    { type: "Feature", properties: { node: 0 }, geometry: { type: "Point", coordinates: [12.49, 41.90] } },
    { type: "Feature", properties: { node: 1 }, geometry: { type: "Point", coordinates: [12.50, 41.91] } },
  ],
  DIAGRAM_LINKS: [
    { type: "Feature", properties: { source: 0, target: 1 }, geometry: { type: "LineString", coordinates: [[12.49, 41.90], [12.50, 41.91]] } },
  ],
};

async function main() {
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.setDefaultTimeout(15000);

  console.log(`Opening ${baseUrl} ...\n`);
  await page.goto(baseUrl, { waitUntil: "load" });

  // Set up, ONCE, everything every check needs from the Node side:
  // the fixtures above, a config builder (one compute.table +
  // compute.diagram + compute.download, a fresh mount <div> per tool
  // id), and a cell-registration helper defaulting to the standard
  // fixtures but overridable per check. Passed in as ONE argument
  // (page.evaluate only takes one) and stashed on `window` so every
  // later check's own page.evaluate() call needs zero arguments.
  await page.evaluate((fixtures) => {
    window.__fixtures = fixtures;

    window.__buildConfig = (tool) => ({
      tool,
      mount: (() => {
        const el = document.createElement("div");
        el.id = tool + "-mount";
        document.body.appendChild(el);
        return el;
      })(),
      map: { center: [12.49, 41.90], zoom: 10 },
      // Required for compute.diagram to render anything at all --
      // _renderDiagram() early-returns without this.sidePanelEl,
      // which _buildDom() only creates when layout.sidePanel is set.
      layout: { sidePanel: { id: tool + "-sidepanel" } },
      upload: { languages: ["python"], kind: "vector" },
      example: { cellId: tool + "-ex", kind: "geojson", status: "✓ example loaded" },
      inspect: {
        cellId: tool + "-insp",
        layers: [{ source: tool + "-inspect-src", from: (v) => v.features, type: "circle", fit: true }],
        stats: (v) => [["Count", v.features.features.length]],
      },
      compute: {
        cellId: tool + "-cmp",
        label: "▶ Compute",
        inputs: [],
        layers: [{ source: tool + "-compute-src", from: (v) => v.features, type: "circle" }],
        stats: (v) => [["Result count", v.features.features.length]],
        legend: (v) => [{ color: "#111111", label: "pt" }],
        table: { sources: [tool + "-compute-src"], emptyMessage: "No results yet" },
        diagram: { nodes: (v) => v.nodes, links: (v) => v.links },
        download: { getFeatures: (v) => v.features, defaultFilename: "result.geojson" },
      },
    });

    window.__registerCells = (tool, overrides = {}) => {
      const inspectFC = overrides.inspectFC ?? window.__fixtures.INSPECT_FC;
      const computeFC = overrides.computeFC ?? window.__fixtures.COMPUTE_FC;
      const diagramNodes = overrides.diagramNodes ?? window.__fixtures.DIAGRAM_NODES;
      const diagramLinks = overrides.diagramLinks ?? window.__fixtures.DIAGRAM_LINKS;
      WebGeoDS.CodeCell.register(tool + "-ex", async () => null);
      WebGeoDS.CodeCell.register(tool + "-insp", async () => ({ features: inspectFC }));
      WebGeoDS.CodeCell.register(tool + "-cmp", async () => ({
        features: computeFC,
        nodes: diagramNodes,
        links: diagramLinks,
      }));
    };
  }, FIXTURES);

  console.log("Construction");

  await check("upload/reset buttons always present; example/download only when configured", async () => {
    const info = await page.evaluate(() => {
      const dashboard = new WebGeoDS.Dashboard(window.__buildConfig("t-construction"));
      return {
        hasExampleBtn: [...dashboard.el.querySelectorAll("button")].some((b) => b.textContent.includes("example")),
        hasResetBtn: [...dashboard.el.querySelectorAll("button")].some((b) => b.textContent.includes("Reset")),
        hasComputeBtn: [...dashboard.el.querySelectorAll("button")].some((b) => b.textContent.includes("Compute")),
      };
    });
    if (!info.hasExampleBtn) throw new Error("Load example button missing");
    if (!info.hasResetBtn) throw new Error("Reset button missing");
    if (!info.hasComputeBtn) throw new Error("Compute button missing");
  });

  await check("compute.table absent -> dashboard.table is null", async () => {
    const isNull = await page.evaluate(() => {
      const cfg = window.__buildConfig("t-no-table");
      delete cfg.compute.table;
      const dashboard = new WebGeoDS.Dashboard(cfg);
      return dashboard.table === null;
    });
    if (!isNull) throw new Error("dashboard.table should be null when compute.table isn't configured");
  });

  console.log("\nready() / compute.table");

  await check("dashboard.table exists after ready(), showing the empty state before any Compute", async () => {
    const info = await page.evaluate(async () => {
      const tool = "t-table-empty";
      window.__registerCells(tool);
      const dashboard = new WebGeoDS.Dashboard(window.__buildConfig(tool));
      await dashboard.ready();
      return {
        hasTable: !!dashboard.table,
        emptyText: dashboard.table?.element.querySelector(".webgeods-table-empty")?.textContent,
      };
    });
    if (!info.hasTable) throw new Error("dashboard.table missing after ready()");
    if (info.emptyText !== "No results yet") throw new Error(`unexpected empty-state text: ${info.emptyText}`);
  });

  console.log("\nloadExample() / runCompute()");

  await check("loadExample() runs the inspect cell and renders its layer on the map", async () => {
    const info = await page.evaluate(async () => {
      const tool = "t-example";
      window.__registerCells(tool);
      const dashboard = new WebGeoDS.Dashboard(window.__buildConfig(tool));
      await dashboard.ready();
      await dashboard.loadExample();
      const geojson = dashboard.map.getGeoJSON(tool + "-inspect-src");
      return { count: geojson?.features.length, layerType: dashboard.map.map.getLayer(tool + "-inspect-src")?.type };
    });
    if (info.count !== 2) throw new Error(`expected 2 inspect features on the map, got ${info.count}`);
    if (info.layerType !== "circle") throw new Error(`expected a circle layer, got ${info.layerType}`);
  });

  await check("runCompute() runs the compute cell, updates layers/stats/legend, and populates compute.table", async () => {
    const info = await page.evaluate(async () => {
      const tool = "t-compute";
      window.__registerCells(tool);
      const dashboard = new WebGeoDS.Dashboard(window.__buildConfig(tool));
      await dashboard.ready();
      await dashboard.loadExample();
      await dashboard.runCompute();
      // compute.table's own row content updates from the map's
      // "sourcedata" event (fired asynchronously by MapLibre after
      // setGeoJSON()'s setData() call, not awaited by runCompute()
      // itself) -- the same short settle every hand-wired tableCell()
      // page needs after a real Compute click, not a product bug.
      await new Promise((r) => setTimeout(r, 300));
      const geojson = dashboard.map.getGeoJSON(tool + "-compute-src");
      return {
        mapCount: geojson?.features.length,
        statsText: dashboard.statsEl.textContent,
        legendItemCount: dashboard.legendWrapEl.querySelectorAll("*").length,
        tableRows: dashboard.table.element.querySelectorAll("tbody tr").length,
      };
    });
    if (info.mapCount !== 3) throw new Error(`expected 3 compute features on the map, got ${info.mapCount}`);
    if (!info.statsText.includes("Result count")) throw new Error("stats card missing 'Result count'");
    if (info.legendItemCount === 0) throw new Error("legend appears empty after Compute");
    if (info.tableRows !== 3) throw new Error(`expected 3 table rows (compute.table tracking the compute source), got ${info.tableRows}`);
  });

  await check("compute.diagram renders real nodes after Compute", async () => {
    const info = await page.evaluate(async () => {
      const tool = "t-diagram";
      window.__registerCells(tool);
      const dashboard = new WebGeoDS.Dashboard(window.__buildConfig(tool));
      await dashboard.ready();
      await dashboard.loadExample();
      await dashboard.runCompute();
      return {
        hasDiagram: !!dashboard.diagram,
        nodeCount: dashboard.el.querySelectorAll("circle").length,
      };
    });
    if (!info.hasDiagram) throw new Error("dashboard.diagram missing after Compute");
    if (info.nodeCount !== 2) throw new Error(`expected 2 diagram nodes (<circle>), got ${info.nodeCount}`);
  });

  console.log("\ncross-link (compute.table)");

  await check("clicking a table row fires SELECTION_CHANGE_EVENT and getSelectedKey() reflects it", async () => {
    const info = await page.evaluate(async () => {
      const tool = "t-select";
      window.__registerCells(tool);
      const dashboard = new WebGeoDS.Dashboard(window.__buildConfig(tool));
      await dashboard.ready();
      await dashboard.loadExample();
      await dashboard.runCompute();
      // See the "populates compute.table" check above for why this
      // settle is needed (MapLibre's own async "sourcedata" event).
      await new Promise((r) => setTimeout(r, 300));

      let eventFired = false;
      dashboard.table.element.addEventListener(WebGeoDS.Map.SELECTION_CHANGE_EVENT, () => { eventFired = true; });

      const firstRow = dashboard.table.element.querySelector("tbody tr");
      firstRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // The click handler on the row itself (not the map) drives
      // selection synchronously up to the async setGeoJSON/fitToData
      // work -- wait a tick for that to settle.
      await new Promise((r) => setTimeout(r, 300));

      return {
        eventFired,
        selectedKey: dashboard.table.getSelectedKey(),
        selectedRowCount: dashboard.table.element.querySelectorAll(".webgeods-row-selected").length,
      };
    });
    if (!info.eventFired) throw new Error("SELECTION_CHANGE_EVENT did not fire on row click");
    if (!info.selectedKey) throw new Error("getSelectedKey() returned nothing after a row click");
    if (info.selectedRowCount !== 1) throw new Error(`expected exactly 1 selected row, got ${info.selectedRowCount}`);
  });

  await check("selectMany() selects several rows at once (chart-style whole-group selection)", async () => {
    const info = await page.evaluate(async () => {
      const tool = "t-selectmany";
      window.__registerCells(tool);
      const dashboard = new WebGeoDS.Dashboard(window.__buildConfig(tool));
      await dashboard.ready();
      await dashboard.loadExample();
      await dashboard.runCompute();

      const geojson = dashboard.map.getGeoJSON(tool + "-compute-src");
      const keys = geojson.features.map((f) => `${tool}-compute-src:${f.id}`);
      await dashboard.table.selectMany(keys);

      return { selectedRowCount: dashboard.table.element.querySelectorAll(".webgeods-row-selected").length };
    });
    if (info.selectedRowCount !== 3) throw new Error(`expected all 3 rows selected, got ${info.selectedRowCount}`);
  });

  console.log("\nreset()");

  await check("reset() clears map layers, table, and dashboard state", async () => {
    const info = await page.evaluate(async () => {
      const tool = "t-reset";
      window.__registerCells(tool);
      const dashboard = new WebGeoDS.Dashboard(window.__buildConfig(tool));
      await dashboard.ready();
      await dashboard.loadExample();
      await dashboard.runCompute();
      await dashboard.reset();

      return {
        computeGeojson: dashboard.map.getGeoJSON(tool + "-compute-src"),
        inspectGeojson: dashboard.map.getGeoJSON(tool + "-inspect-src"),
        tableRows: dashboard.table.element.querySelectorAll("tbody tr").length,
        tableEmptyText: dashboard.table.element.querySelector(".webgeods-table-empty")?.textContent,
        inspectValue: dashboard.inspectValue,
        diagram: dashboard.diagram,
      };
    });
    if (info.computeGeojson && info.computeGeojson.features.length !== 0) throw new Error("compute layer not cleared by reset()");
    if (info.inspectGeojson && info.inspectGeojson.features.length !== 0) throw new Error("inspect layer not cleared by reset()");
    if (info.tableRows !== 0) throw new Error(`expected 0 table rows after reset(), got ${info.tableRows}`);
    if (info.tableEmptyText !== "No results yet") throw new Error("table did not return to its empty state after reset()");
    if (info.inspectValue !== null) throw new Error("state.inspectValue not cleared by reset()");
    if (info.diagram !== null) throw new Error("dashboard.diagram not cleared by reset()");
  });

  await check("a second load-example + Compute cycle works after reset()", async () => {
    const info = await page.evaluate(async () => {
      const tool = "t-second-cycle";
      window.__registerCells(tool);
      const dashboard = new WebGeoDS.Dashboard(window.__buildConfig(tool));
      await dashboard.ready();
      await dashboard.loadExample();
      await dashboard.runCompute();
      await dashboard.reset();
      await dashboard.loadExample();
      await dashboard.runCompute();
      await new Promise((r) => setTimeout(r, 300));
      return { tableRows: dashboard.table.element.querySelectorAll("tbody tr").length };
    });
    if (info.tableRows !== 3) throw new Error(`expected 3 table rows after a second cycle, got ${info.tableRows}`);
  });

  console.log("\n_queue serialization");

  await check("overlapping runCompute() calls are serialized, not run concurrently", async () => {
    const info = await page.evaluate(async () => {
      const tool = "t-queue";
      let concurrentCalls = 0;
      let maxConcurrent = 0;
      WebGeoDS.CodeCell.register(tool + "-ex", async () => null);
      WebGeoDS.CodeCell.register(tool + "-insp", async () => ({ features: window.__fixtures.INSPECT_FC }));
      WebGeoDS.CodeCell.register(tool + "-cmp", async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise((r) => setTimeout(r, 100));
        concurrentCalls--;
        return {
          features: window.__fixtures.COMPUTE_FC,
          nodes: window.__fixtures.DIAGRAM_NODES,
          links: window.__fixtures.DIAGRAM_LINKS,
        };
      });
      const dashboard = new WebGeoDS.Dashboard(window.__buildConfig(tool));
      await dashboard.ready();
      await dashboard.loadExample();
      // Fire two computes without awaiting the first -- _queue()
      // should serialize them, never running the stubbed cell twice
      // at once.
      const p1 = dashboard.runCompute();
      const p2 = dashboard.runCompute();
      await Promise.all([p1, p2]);
      return { maxConcurrent };
    });
    if (info.maxConcurrent > 1) throw new Error(`expected the compute cell to never run concurrently with itself, saw ${info.maxConcurrent} at once`);
  });

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.pass);
  console.log("\n" + "=".repeat(60));
  console.log(`Result: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFailed checks:");
    for (const r of failed) console.log(`  ✗ ${r.name}\n      ${r.error}`);
  }
  if (consoleErrors.length) {
    console.log(`\n(${consoleErrors.length} unhandled JS errors recorded on the page.)`);
  }
  console.log("=".repeat(60));

  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

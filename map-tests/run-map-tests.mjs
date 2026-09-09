#!/usr/bin/env node
/**
 * Dedicated test suite for WebGeoDS.Map (shared/map.js) — separate
 * from smoke-test.mjs (which covers the whole test-architettura.qmd
 * page, R/Python included) so the map layer can be checked on its own,
 * fast, without a Quarto render or a webR/Pyodide cold-load.
 *

 * Self-contained: starts its own static file server (serving the
 * whole project root, so map-tests/map-test.html's `../shared/...`
 * paths resolve) and a headless browser — no external setup needed
 * beyond `npm install` at the project root (already done for the rest
 * of the project).
 *
 * Usage: node run-map-tests.mjs [--headed]
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
const baseUrl = `http://127.0.0.1:${port}/map-tests/map-test.html`;

// ============================================================
// Result collection — same shape/style as smoke-test.mjs
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

// Small GeoJSON fixtures, reused across checks.
const POINT = { type: "Feature", geometry: { type: "Point", coordinates: [12.4964, 41.9028] }, properties: {} };
const LINE = { type: "Feature", geometry: { type: "LineString", coordinates: [[12.4964, 41.9028], [9.19, 45.4642]] }, properties: {} };
const POLY = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[12, 41], [13, 41], [13, 42], [12, 42], [12, 41]]] }, properties: {} };

async function main() {
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.setDefaultTimeout(15000);

  console.log(`Opening ${baseUrl} ...\n`);
  await page.goto(baseUrl, { waitUntil: "load" });

  console.log("Constructor");

  await check("by id", async () => {
    const ok = await page.evaluate(() => {
      const m = new window.WebGeoDS.Map("container-a");
      return m.element.id === "container-a";
    });
    if (!ok) throw new Error("element.id mismatch");
  });

  await check("by HTMLElement", async () => {
    const ok = await page.evaluate(() => {
      const el = document.getElementById("container-b");
      const m = new window.WebGeoDS.Map(el);
      return m.element === el;
    });
    if (!ok) throw new Error("element mismatch");
  });

  await check("automatic container — gets its own id", async () => {
    const { hasId, inDom, hasClass } = await page.evaluate(() => {
      const m = new window.WebGeoDS.Map({ width: "200px", height: "150px" });
      document.body.appendChild(m.element);
      return {
        hasId: typeof m.element.id === "string" && m.element.id.length > 0,
        inDom: document.body.contains(m.element),
        hasClass: m.element.classList.contains("webgeods-map-container"),
      };
    });
    if (!hasId) throw new Error("no id auto-assigned");
    if (!inDom) throw new Error("container not in the DOM after manual append");
    if (!hasClass) throw new Error("missing the webgeods-map-container class");
  });

  console.log("\nfind()");

  await check("finds an instance by id (even auto-assigned)", async () => {
    const ok = await page.evaluate(() => {
      const m = new window.WebGeoDS.Map({});
      return window.WebGeoDS.Map.find(m.element.id) === m;
    });
    if (!ok) throw new Error("find() did not return the same instance");
  });

  await check("undefined for a nonexistent id", async () => {
    const ok = await page.evaluate(() => window.WebGeoDS.Map.find("non-esiste-di-sicuro") === undefined);
    if (!ok) throw new Error("find() should have returned undefined");
  });

  console.log("\nready()");

  await check("resolves with a valid style", async () => {
    await page.evaluate(async () => {
      const m = new window.WebGeoDS.Map({});
      await m.ready();
    });
  });

  await check("rejects (doesn't hang) with an unreachable style", async () => {
    const { rejected, elapsedMs } = await page.evaluate(async () => {
      const start = Date.now();
      try {
        const m = new window.WebGeoDS.Map({
          style: "https://127.0.0.1:1/non-esiste/style.json",
          readyTimeout: 3000,
        });
        await m.ready();
        return { rejected: false, elapsedMs: Date.now() - start };
      } catch {
        return { rejected: true, elapsedMs: Date.now() - start };
      }
    });
    if (!rejected) throw new Error("ready() resolved instead of rejecting");
    if (elapsedMs > 8000) throw new Error(`too slow to reject (${elapsedMs}ms) — still seems to hang`);
  });

  await check("after a failure, find() doesn't find a zombie instance", async () => {
    const ok = await page.evaluate(async () => {
      const m = new window.WebGeoDS.Map({
        style: "https://127.0.0.1:1/non-esiste/style.json",
        readyTimeout: 1500,
      });
      const id = m.element.id;
      try { await m.ready(); } catch {}
      return window.WebGeoDS.Map.find(id) === undefined;
    });
    if (!ok) throw new Error("find() still returned the failed instance");
  });

  console.log("\naddGeoJSON / updateGeoJSON / setGeoJSON / removeGeoJSON");

  await check("addGeoJSON — autodetect circle/line/fill", async () => {
    const result = await page.evaluate(async (fixtures) => {
      const m = new window.WebGeoDS.Map({});
      await m.ready();
      await m.addGeoJSON("pt", fixtures.point);
      await m.addGeoJSON("ln", fixtures.line);
      await m.addGeoJSON("pg", fixtures.poly);
      return {
        pt: m.map.getLayer("pt").type,
        ln: m.map.getLayer("ln").type,
        pg: m.map.getLayer("pg").type,
      };
    }, { point: POINT, line: LINE, poly: POLY });
    if (result.pt !== "circle") throw new Error(`Point -> ${result.pt}, expected circle`);
    if (result.ln !== "line") throw new Error(`LineString -> ${result.ln}, expected line`);
    if (result.pg !== "fill") throw new Error(`Polygon -> ${result.pg}, expected fill`);
  });

  await check("addGeoJSON — throws on duplicate source", async () => {
    const threw = await page.evaluate(async (point) => {
      const m = new window.WebGeoDS.Map({});
      await m.ready();
      await m.addGeoJSON("dup", point);
      try {
        await m.addGeoJSON("dup", point);
        return false;
      } catch {
        return true;
      }
    }, POINT);
    if (!threw) throw new Error("did not throw on duplicate source");
  });

  await check("updateGeoJSON — updates, throws if the source doesn't exist", async () => {
    const { updated, threw } = await page.evaluate(async (fixtures) => {
      const m = new window.WebGeoDS.Map({});
      await m.ready();
      await m.addGeoJSON("upd", fixtures.point);
      await m.updateGeoJSON("upd", fixtures.line);
      let threw = false;
      try { await m.updateGeoJSON("non-esiste", fixtures.point); } catch { threw = true; }
      return { updated: m.map.getSource("upd") !== undefined, threw };
    }, { point: POINT, line: LINE });
    if (!updated) throw new Error("source not found after the update");
    if (!threw) throw new Error("did not throw on nonexistent source");
  });

  await check("setGeoJSON — creates if absent, updates if present", async () => {
    const ok = await page.evaluate(async (point) => {
      const m = new window.WebGeoDS.Map({});
      await m.ready();
      await m.setGeoJSON("up", point); // create
      const createdOnce = m.map.getSource("up") !== undefined;
      await m.setGeoJSON("up", point); // update, must not throw like addGeoJSON would
      return createdOnce;
    }, POINT);
    if (!ok) throw new Error("setGeoJSON did not create the source");
  });

  await check("removeGeoJSON — removes layer and source", async () => {
    const ok = await page.evaluate(async (point) => {
      const m = new window.WebGeoDS.Map({});
      await m.ready();
      await m.addGeoJSON("rm", point);
      await m.removeGeoJSON("rm");
      return m.map.getLayer("rm") === undefined && m.map.getSource("rm") === undefined;
    }, POINT);
    if (!ok) throw new Error("layer or source still present after removeGeoJSON");
  });

  console.log("\ngetBounds / fitToData / destroy");

  await check("getBounds / fitToData don't throw on valid GeoJSON", async () => {
    await page.evaluate(async (point) => {
      const m = new window.WebGeoDS.Map({});
      await m.ready();
      const bounds = m.getBounds(point);
      if (bounds.isEmpty()) throw new Error("empty bounds for a valid point");
      await m.fitToData(point);
    }, POINT);
  });

  await check("destroy() — removes the map and deregisters from find()", async () => {
    const ok = await page.evaluate(async () => {
      const m = new window.WebGeoDS.Map({});
      await m.ready();
      const id = m.element.id;
      m.destroy();
      return m.map === null && window.WebGeoDS.Map.find(id) === undefined;
    });
    if (!ok) throw new Error("state not clean after destroy()");
  });

  // ------------------------------------------------------------
  // setGeoJSON() — recreates the layer when the geometry family
  // changes (e.g. topology-errors.qmd: same source reused for a
  // polygon example, then for the dangle example, made of lines). A
  // "fill" layer doesn't draw LineString features — this replaces
  // what the old ensure_layer() (Python/R, queue bridge) used to do
  // server-side; now it's a generic responsibility of map.js.
  // ------------------------------------------------------------

  await check("setGeoJSON() — recreates the layer when the geometry type changes (fill → line)", async () => {
    const info = await page.evaluate(async () => {
      const m = new window.WebGeoDS.Map({});
      await m.ready();

      await m.setGeoJSON("switching", {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } }],
      });
      const typeAfterPolygon = m.map.getLayer("switching").type;

      await m.setGeoJSON("switching", {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } }],
      });
      const typeAfterLine = m.map.getLayer("switching").type;

      return { typeAfterPolygon, typeAfterLine, hasSource: !!m.map.getSource("switching") };
    });
    if (info.typeAfterPolygon !== "fill") throw new Error(`expected layer "fill" for polygon data, got "${info.typeAfterPolygon}"`);
    if (info.typeAfterLine !== "line") throw new Error(`expected layer "line" after writing LineString data to the same source, got "${info.typeAfterLine}"`);
    if (!info.hasSource) throw new Error("source 'switching' missing after the type change");
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

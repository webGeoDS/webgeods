#!/usr/bin/env node
/**
 * Writes blog/examples/precomputed/<tool>.json: each tool's example, run
 * live (inspect, then compute with the default inputs), as Load example
 * shows it without starting the Python/R engine (hooks/useToolData.js).
 *
 *   node precompute-examples.mjs [tool page names...]      all tools by default
 *   node precompute-examples.mjs --check [names...]        which files are stale
 *
 * Serve the rendered site first (`node static-server.mjs blog/_site 4801`;
 * BASE overrides the address). Each file carries a fingerprint of the
 * cell code, the example file and the default inputs: a page whose cells,
 * example or defaults changed ignores its file and runs the example live
 * (slower, never wrong) until this script is run again and the site
 * re-rendered. Run it after changing a tool's cells, example or defaults.
 */

import { chromium } from "playwright";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:4801";
const OUT = "blog/examples/precomputed";
const args = process.argv.slice(2);
const check = args.includes("--check");
const names = args.filter((a) => !a.startsWith("--"));
const pages = names.length
  ? names
  : readdirSync("blog/tools").filter((f) => f.endsWith(".qmd") && f !== "index.qmd").map((f) => f.replace(/\.qmd$/, ""));

const STATUS = ".webgeods-dashboard .webgeods-panel-row:nth-child(2) .webgeods-panel-status";
const browser = await chromium.launch();
let failed = 0;
mkdirSync(OUT, { recursive: true });

for (const name of pages) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.setDefaultTimeout(400000);
  const warnings = [];
  page.on("console", (m) => { if (/out of date|not usable/.test(m.text())) warnings.push(m.text()); });
  try {
    await page.goto(`${BASE}/tools/${name}.html${check ? "" : "?live"}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.WebGeoDS?.Preact?.tools && Object.keys(window.WebGeoDS.Preact.tools).length);
    const { tool, hasExampleFile, hasCompute, computeLabel } = await page.evaluate(() => {
      const [tool, t] = Object.entries(window.WebGeoDS.Preact.tools)[0];
      return { tool, hasExampleFile: !!t.config.example && !t.config.cells.example, hasCompute: !!t.config.cells.compute, computeLabel: t.config.computeLabel ?? "▶ Compute" };
    });
    if (!hasExampleFile) { console.log(`– ${name}: no example file, skipped`); continue; }

    const started = Date.now();
    await page.getByRole("button", { name: /Load example/ }).click();
    await page.waitForFunction((sel) => {
      const text = document.querySelector(sel)?.textContent ?? "";
      return !text.includes("⌛") && /loaded|✓|failed|Error/.test(text);
    }, STATUS);

    if (check) {
      const text = await page.textContent(STATUS);
      const fresh = warnings.length === 0 && Date.now() - started < 5000;
      if (!fresh) failed++;
      console.log(`${fresh ? "✓" : "✗"} ${name}: ${fresh ? "precomputed example in use" : "stale or missing, " + (warnings[0] ?? text)}`);
      continue;
    }

    if (hasCompute) {
      await page.getByRole("button", { name: computeLabel }).click();
      await page.waitForFunction((sel) => /✓ Done|failed|Error/.test(document.querySelector(sel)?.textContent ?? ""), STATUS);
    }
    const status = await page.textContent(STATUS);
    if (/failed|Error/.test(status)) throw new Error(status);
    const snapshot = await page.evaluate((t) => window.WebGeoDS.Preact.tools[t].snapshot(), tool);
    const json = JSON.stringify(snapshot);
    writeFileSync(path.join(OUT, `${tool}.json`), json);
    console.log(`✓ ${name}: ${OUT}/${tool}.json (${(json.length / 1024).toFixed(0)} KB)`);
  } catch (error) {
    failed++;
    console.log(`✗ ${name}: ${String(error.message ?? error).split("\n")[0]}`);
  } finally {
    await page.close();
  }
}

await browser.close();
process.exit(failed ? 1 : 0);

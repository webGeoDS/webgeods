#!/usr/bin/env node
/**
 * Playwright smoke test for test-architettura.qmd
 * ================================================
 *
 * Opens the test page already rendered by Quarto, clicks the "▶ Run"
 * button of every section and verifies that the expected text/state
 * appears in the corresponding output block — the same path we've
 * followed by hand so far, clicking around in the browser (see the
 * "Manual-only test coverage" section in the project's critical
 * analysis).
 *
 * USAGE
 * -----
 *   Easiest: ../run-smoke-test.sh [project_dir] [page.html] handles
 *   render, preview, this script, and teardown in one command.
 *
 *   Manual:
 *   1. Render the site and start it:
 *        quarto preview
 *      (usually on http://localhost:4200 — the exact URL is printed
 *      to the console; pass it as the first argument if different)
 *
 *   2. In another terminal:
 *        node smoke-test.mjs http://localhost:4200/test-architettura.html
 *
 *   Options:
 *     --headed     opens a visible Chromium window instead of headless
 *     --timeout=N  default per-check timeout, in ms (default 45000)
 *
 * Cold-loading webR + the sf package can take up to a minute (the
 * page itself says so): the whole suite can take a few minutes. Each
 * check is independent — a failure doesn't block the following ones,
 * so the final report always shows the status of every section
 * instead of stopping at the first problem.
 *
 * No dependency beyond the `playwright` package (already present in
 * this project/environment). Direct import of the library, not
 * @playwright/test: it's a single small, targeted suite, no need for
 * a full test runner.
 */

import { chromium } from "playwright";

// ============================================================
// CLI arguments
// ============================================================

const args =
  process.argv.slice(2);

const url =
  args.find((a) => !a.startsWith("--"));

const headed =
  args.includes("--headed");

const timeoutArg =
  args.find((a) => a.startsWith("--timeout="));

const DEFAULT_TIMEOUT =
  timeoutArg ? Number(timeoutArg.split("=")[1]) : 45_000;

if (!url) {
  console.error(
    "Usage: node smoke-test.mjs <test-page-url> [--headed] [--timeout=45000]\n" +
    "Example: node smoke-test.mjs http://localhost:4200/test-architettura.html"
  );
  process.exit(2);
}


// ============================================================
// Result collection
// ============================================================

const results =
  [];

// §16 cases whose package availability isn't guaranteed (pandas/
// geopandas — see observePackageAvailability()): collected here and
// printed in the final report, in addition to still going through
// check()/pass-fail when the package is available (the shape is then
// verified against the assert, not just recorded).
const observedShapes =
  [];

async function check(name, fn) {

  const start =
    Date.now();

  try {

    await fn();

    results.push({
      name,
      pass: true,
      ms: Date.now() - start
    });

    console.log(`  ✓ ${name} (${Date.now() - start}ms)`);

  } catch (err) {

    results.push({
      name,
      pass: false,
      ms: Date.now() - start,
      error: err.message
    });

    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message.split("\n")[0]}`);

  }

}


// ============================================================
// Helper: normalize whitespace/newlines for layout-robust comparisons
// ============================================================

const norm = (text) =>
  text.replace(/\s+/g, " ").trim();


function assertIncludes(haystack, needles, label) {

  const normalized =
    norm(haystack);

  for (const needle of [].concat(needles)) {

    if (!normalized.includes(needle)) {

      throw new Error(
        `${label}: expected "${needle}" in text, found: "${normalized.slice(0, 300)}"`
      );

    }

  }

}


function assertNotIncludes(haystack, needle, label) {

  const normalized =
    norm(haystack);

  if (normalized.includes(needle)) {

    throw new Error(
      `${label}: must NOT contain "${needle}", found instead: "${normalized.slice(0, 300)}"`
    );

  }

}


// ============================================================
// Helper: runs a cell and waits for the final state (success/error)
// ============================================================

/**
 * @param page          Playwright Page
 * @param containerSel  the cell's container selector (the id passed to WebGeoDS.CodeCell)
 * @param opts.expect    "success" | "error" — expected class on the output's main span
 * @param opts.includes  string or array of strings that must appear in the output text
 * @param opts.excludes  string or array of strings that must NOT appear (for regression tests)
 * @param opts.timeout   ms
 */
async function runCell(page, containerSel, { expect = "success", includes = [], excludes = [], timeout = DEFAULT_TIMEOUT } = {}) {

  await page.click(`${containerSel} .webgeods-run-btn`);

  const outputSel =
    `${containerSel} .webgeods-output`;

  // Waits for the output to stop being in the "waiting" state —
  // WebGeoDSCodeCell.run() replaces the content with
  // .webgeods-log-error or .webgeods-log-success once onRun resolves
  // or throws.
  await page.waitForSelector(
    `${outputSel} .webgeods-log-success, ${outputSel} .webgeods-log-error`,
    { timeout }
  );

  const hasExpectedClass =
    await page.locator(`${outputSel} .webgeods-log-${expect}`).count() > 0;

  const fullText =
    await page.locator(outputSel).innerText();

  if (!hasExpectedClass) {

    throw new Error(
      `${containerSel}: expected state "${expect}", actual output: "${norm(fullText).slice(0, 300)}"`
    );

  }

  if (includes.length) {
    assertIncludes(fullText, includes, containerSel);
  }

  for (const needle of [].concat(excludes)) {
    assertNotIncludes(fullText, needle, containerSel);
  }

  return fullText;

}


// ============================================================
// Helper §16: runs a {.webgeods-python}/{.webgeods-r} cell generated by
// the Lua filter and reads the describeValue() box wired via
// getCellValue — see §16 of test-architettura.qmd.
// ============================================================

/**
 * Runs the `cellId` cell, waits for the `descId` div (the container
 * returned by describeValue(), given an id in §16 for automation
 * purposes) to show an updated preview, and returns its normalized
 * text.
 *
 * NOTE on the wait: describeValue() computes the "typeof=..." text
 * from the very first synchronous evaluation of Generators.observe()
 * (same reason #lua-py-status/#lua-r-status already exist before the
 * Run in §15) — so "the text contains typeof=" alone doesn't prove
 * the observed value comes from the Run just performed. For cases
 * with a concrete expected value distinguishable from "not run yet"
 * (e.g. 42, not undefined) this isn't an issue — we simply wait for
 * the expected preview to appear. The conv-py-none case is the
 * structural exception — see observeConversion and the callout at
 * the top of §16 in the .qmd.
 */
async function readConversionDesc(page, descId, { previewNeedle, timeout = DEFAULT_TIMEOUT } = {}) {

  if (previewNeedle) {

    // page.waitForFunction passes a SINGLE argument to the
    // pageFunction — it does not spread an array across multiple
    // parameters. Pass one object and destructure it inside, rather
    // than e.g. `[descId, previewNeedle]` with a two-parameter
    // function (which would silently receive the whole array as the
    // first parameter and `undefined` as the second).
    await page.waitForFunction(
      ({ id, needle }) => {
        const el = document.getElementById(id);
        return el && el.textContent.includes(needle);
      },
      { id: descId, needle: previewNeedle },
      { timeout }
    );

  } else {

    await page.waitForFunction(
      (id) => {
        const el = document.getElementById(id);
        return el && el.textContent.includes("typeof=");
      },
      descId,
      { timeout }
    );

  }

  return norm(await page.locator(`#${descId}`).innerText());

}

/**
 * §16 case with an expected, verifiable outcome: runs the cell,
 * waits for the describeValue() box to show the expected preview
 * (proof that the OJS bridge updated after THIS Run, not just on
 * page load), then checks typeof/Array.isArray/preview.
 */
async function checkConversion(page, { cellId, descId, expectType, expectArray, previewIncludes, timeout = DEFAULT_TIMEOUT }) {

  await runCell(page, `#${cellId}`, { expect: "success", timeout });

  const needle =
    [].concat(previewIncludes || [])[0];

  const text =
    await readConversionDesc(page, descId, { previewNeedle: needle, timeout });

  if (expectType !== undefined) {
    assertIncludes(text, `typeof=${expectType}`, `#${descId}`);
  }

  if (expectArray !== undefined) {
    assertIncludes(text, `Array.isArray=${expectArray}`, `#${descId}`);
  }

  if (previewIncludes) {
    assertIncludes(text, previewIncludes, `#${descId}`);
  }

  return text;

}

/**
 * §16 case whose package (e.g. geopandas) isn't guaranteed to be
 * available in every Pyodide environment — see the callout at the top
 * of §16 in the .qmd. Unlike checkConversion(), this does NOT assume
 * the cell succeeds: a package-load failure is recorded as a valid
 * observation instead of failing the check. If the cell does succeed
 * and expectType/previewIncludes are passed, they're still verified
 * like checkConversion() would — the tolerance is only for package
 * availability, not for the result's shape once the package is there.
 */
async function observePackageAvailability(page, { cellId, descId, note, expectType, previewIncludes, timeout = DEFAULT_TIMEOUT }) {

  await page.click(`#${cellId} .webgeods-run-btn`);

  const outputSel =
    `#${cellId} .webgeods-output`;

  await page.waitForSelector(
    `${outputSel} .webgeods-log-success, ${outputSel} .webgeods-log-error`,
    { timeout }
  );

  const succeeded =
    await page.locator(`${outputSel} .webgeods-log-success`).count() > 0;

  let text;

  if (succeeded) {

    // Same reason as the short waitForTimeout in observeConversion:
    // there's no expected preview to wait for with waitForFunction,
    // but Generators.observe() updates the box synchronously
    // relative to the "input" event already fired by the click
    // above.
    await page.waitForTimeout(300);

    text =
      norm(await page.locator(`#${descId}`).innerText());

    if (expectType !== undefined) {
      assertIncludes(text, `typeof=${expectType}`, `#${descId}`);
    }

    if (previewIncludes) {
      assertIncludes(text, previewIncludes, `#${descId}`);
    }

  } else {

    const cellText =
      norm(await page.locator(outputSel).innerText());

    text =
      `[cell failed — package probably unavailable] ${cellText.slice(0, 300)}`;

  }

  observedShapes.push({ descId, note, text });

  console.log(`      [observe and report] ${descId}: ${text}`);

}


// ============================================================
// Main
// ============================================================

async function main() {

  const browser =
    await chromium.launch({ headless: !headed });

  // Deliberately tall viewport, just to have more content visible
  // without scrolling during the checks below — Quarto/Observable
  // evaluate {ojs} cells regardless of scroll position or visibility,
  // not lazily via IntersectionObserver.
  const page =
    await browser.newPage({ viewport: { width: 1280, height: 4000 } });

  // Every alert()/confirm() on the page (e.g. the duplicate-source
  // error test in §10) must be explicitly accepted, otherwise it
  // blocks the page's JS execution waiting for a human click that
  // will never come. We keep track of the last message so the check
  // that generates it can verify it.
  let lastDialogMessage =
    null;

  page.on("dialog", async (dialog) => {
    lastDialogMessage = dialog.message();
    await dialog.accept();
  });

  const consoleErrors =
    [];

  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  page.setDefaultTimeout(DEFAULT_TIMEOUT);

  console.log(`Opening ${url} ...\n`);

  await page.goto(url, { waitUntil: "domcontentloaded" });


  // ------------------------------------------------------------
  // §1 — Runtime Manager
  // ------------------------------------------------------------

  console.log("§1 Runtime Manager");

  await check("§1 initial state idle/idle", async () => {

    const text =
      await page.locator("#runtime-status").innerText();

    assertIncludes(text, ["python: idle", "r: idle"], "#runtime-status");

  });

  await check("§1 Load Python → ready", async () => {

    await page.click("#btn-load-python");

    await page.waitForFunction(
      () => document.getElementById("runtime-status").textContent.includes("python: ready"),
      undefined,
      { timeout: 60_000 }
    );

  });

  await check("§1 Terminate Python → idle", async () => {

    await page.click("#btn-term-python");

    await page.waitForFunction(
      () => document.getElementById("runtime-status").textContent.includes("python: idle"),
      undefined,
      { timeout: DEFAULT_TIMEOUT }
    );

  });

  await check("§1 Load R → ready", async () => {

    await page.click("#btn-load-r");

    await page.waitForFunction(
      () => document.getElementById("runtime-status").textContent.includes("r: ready"),
      undefined,
      { timeout: 60_000 }
    );

  });

  await check("§1 Terminate R → idle", async () => {

    await page.click("#btn-term-r");

    await page.waitForFunction(
      () => document.getElementById("runtime-status").textContent.includes("r: idle"),
      undefined,
      { timeout: DEFAULT_TIMEOUT }
    );

  });


  // ------------------------------------------------------------
  // §2-4 — Python
  // ------------------------------------------------------------

  console.log("\n§2-4 Python");

  await check("§2 Python — basic execution", async () => {

    const text =
      await runCell(page, "#cell-py-base", {
        expect: "success",
        includes: ["Python 3.", "Output: 42"],
        timeout: 60_000 // reloads the worker after §1's terminatePython()
      });

    void text;

  });

  await check("§3 Python — numpy package + PyProxy", async () => {

    await runCell(page, "#cell-py-numpy", {
      expect: "success",
      includes: [
        "Mean: 3",
        "Standard deviation: 1.41",
        "Output:",
        "1,", "2,", "3,", "4,", "5"
      ],
      // Regression: an unconverted ndarray produces "{}" instead of
      // the array — see toTransferable() in runtime.js.
      excludes: ["Output: {}"],
      timeout: 60_000
    });

  });

  await check("§4 Python — error handling", async () => {

    await runCell(page, "#cell-py-error", {
      expect: "error",
      includes: ["ZeroDivisionError", "division by zero"]
    });

  });


  // ------------------------------------------------------------
  // §5-8 — R
  // ------------------------------------------------------------

  console.log("\n§5-8 R");

  await check("§5 R — basic execution", async () => {

    await runCell(page, "#cell-r-base", {
      expect: "success",
      includes: ["Hello from R!", "1 2 3 4 5"],
      timeout: 60_000
    });

  });

  await check("§6 R — sf package, no duplicate format", async () => {

    await runCell(page, "#cell-r-sf", {
      expect: "success",
      includes: ["Simple feature collection", "Rome", "Milan", "Naples"],
      // The 24/08/2026 regression: the value was also shown as a raw
      // JSON dump in a separate "Output: ..." line.
      excludes: ["Output:"],
      timeout: 90_000 // sf package installation, "up to a minute" per the page
    });

  });

  await check("§7 R — invisible(), fallback Output:", async () => {

    await runCell(page, "#cell-r-invisible", {
      expect: "success",
      includes: ["Output: 42"]
    });

  });

  await check("§8 R — error handling", async () => {

    await runCell(page, "#cell-r-error", {
      expect: "error",
      includes: ["intentional test error"]
    });

  });


  // ------------------------------------------------------------
  // §9 — CellOutput, manual methods
  // ------------------------------------------------------------

  console.log("\n§9 CellOutput manual");

  await check("§9 waiting/success/append", async () => {

    // The two "waiting" steps are intentionally brief (500ms each):
    // we check the final state, after both success() and append()
    // have been called, instead of chasing the intermediate states —
    // more robust, less prone to timing flakiness.
    await runCell(page, "#cell-output-methods", {
      expect: "success",
      includes: [
        "Step 3/3",
        "success() with detail",
        "This line comes from the",
        "DOM node added via output.append()"
      ]
    });

  });


  // ------------------------------------------------------------
  // §10 — Map
  // ------------------------------------------------------------

  console.log("\n§10 Map");

  await check("§10 the map initializes (canvas present)", async () => {

    await page.waitForSelector("#map-test canvas", { timeout: 30_000 });

  });

  await check("§10 three sources present with 3 initial points", async () => {

    const count =
      await page.evaluate(
        () => window.__webgeodsTestMap.map.getSource("citta")._data.features.length
      );

    if (count !== 3) {
      throw new Error(`expected 3 initial points, found ${count}`);
    }

  });

  await check("§10 Add Turin (setGeoJSON)", async () => {

    await page.click("#btn-map-update");

    await page.waitForFunction(
      () => window.__webgeodsTestMap.map.getSource("citta")._data.features.length === 4,
      undefined,
      { timeout: 10_000 }
    );

    const lastName =
      await page.evaluate(() => {
        const features = window.__webgeodsTestMap.map.getSource("citta")._data.features;
        return features[features.length - 1].properties.name;
      });

    if (lastName !== "Turin") {
      throw new Error(`expected "Turin" as the last point, found "${lastName}"`);
    }

  });

  await check("§10 Remove link (removeGeoJSON)", async () => {

    await page.click("#btn-map-remove");

    await page.waitForFunction(
      () => !window.__webgeodsTestMap.map.getLayer("collegamento") &&
            !window.__webgeodsTestMap.map.getSource("collegamento"),
      undefined,
      { timeout: 10_000 }
    );

  });

  await check("§10 Shrink/expand + resize()", async () => {

    await page.click("#btn-map-resize");

    await page.waitForSelector(
      "#map-resize-status .webgeods-log-success",
      { timeout: 10_000 }
    );

    const text =
      await page.locator("#map-resize-status").innerText();

    assertIncludes(text, "resize() executed without errors", "#map-resize-status");

  });

  await check("§10 expected error on duplicate source", async () => {

    lastDialogMessage = null;

    await page.click("#btn-map-duplicate");

    // Playwright's "dialog" event arrives with a small delay after
    // the click: a brief wait is more robust than an immediate check
    // on the last captured message.
    await page.waitForTimeout(500);

    if (!lastDialogMessage) {
      throw new Error("no dialog intercepted after clicking 'Test error'");
    }

    if (!lastDialogMessage.startsWith("OK, expected error")) {
      throw new Error(`expected a dialog "OK, expected error: ...", received "${lastDialogMessage}"`);
    }

  });


  // ------------------------------------------------------------
  // §11 — Map, custom style
  // ------------------------------------------------------------

  console.log("\n§11 Map — custom style");

  await check("§11 the second map uses the Alidade Smooth style", async () => {

    await page.waitForSelector("#map-test-style canvas", { timeout: 30_000 });

    const styleName =
      await page.evaluate(
        () => window.__webgeodsTestMapStyle.map.getStyle().name
      );

    if (styleName !== "Alidade Smooth") {
      throw new Error(`expected style "Alidade Smooth", found "${styleName}"`);
    }

  });


  // ------------------------------------------------------------
  // §12 — Python in a Web Worker
  // ------------------------------------------------------------

  console.log("\n§12 Python — Web Worker");

  await check("§12 the UI stays responsive during a heavy computation", async () => {

    const readHeartbeat = () =>
      page.locator("#heartbeat-counter").innerText().then(Number);

    const before =
      await readHeartbeat();

    await page.click("#cell-py-heavy .webgeods-run-btn");

    // Give the heavy loop time to be definitely running, then verify
    // the page's counter (a separate setInterval, on the main
    // thread) still kept incrementing anyway — direct proof that
    // Pyodide is no longer blocking the UI.
    await page.waitForTimeout(2000);

    const during =
      await readHeartbeat();

    if (during - before < 3) {
      throw new Error(
        `the counter advanced only by ${during - before} in 2s: the UI seems blocked (regression — Pyodide back on the main thread?)`
      );
    }

  });

  await check("§12 terminatePython() cleanly interrupts execution", async () => {

    await page.click("#btn-terminate-python");

    await page.waitForSelector(
      "#cell-py-heavy .webgeods-output .webgeods-log-error",
      { timeout: 10_000 }
    );

    const runBtnDisabled =
      await page.locator("#cell-py-heavy .webgeods-run-btn").isDisabled();

    if (runBtnDisabled) {
      throw new Error("the Run button remained disabled after termination");
    }

  });

  await check("§12 the Python worker recreates transparently", async () => {

    // Any cell run after the termination must work again without
    // manual intervention — Runtime.python() must recreate a new
    // worker on the next request.
    await runCell(page, "#cell-py-base", {
      expect: "success",
      includes: ["Output: 42"],
      timeout: 60_000
    });

  });


  // ------------------------------------------------------------
  // §13 — R: stdout vs stderr, automatic skipValueIfPrinted
  // ------------------------------------------------------------

  console.log("\n§13 R — stdout vs stderr");

  await check("§13 stdout and stderr distinct, no explicit flag required", async () => {

    await runCell(page, "#cell-r-stderr", {
      expect: "success",
      includes: [
        "Line on stdout via cat()",
        "⚠ stderr:",
        "Line on stderr via message()",
        "final value"
      ],
      // This cell does NOT pass { skipValueIfPrinted: true } — if an
      // "Output:" line showed up anyway, it would mean the automatic
      // default for R cells broke.
      excludes: ["Output:"]
    });

  });


  // ------------------------------------------------------------
  // §14 — R: explicit stop (terminateR(), not an in-place interrupt)
  // ------------------------------------------------------------

  console.log("\n§14 R — Explicit stop");

  await check("§14 terminateR() cleanly interrupts execution", async () => {

    await page.click("#cell-r-heavy .webgeods-run-btn");

    // Unlike §12 there's no heartbeat counter to wait on: webR
    // already always runs in its own worker (see the comment in the
    // qmd), so we just need to give the execution time to be
    // definitely underway before terminating it.
    await page.waitForTimeout(1000);

    await page.click("#btn-terminate-r");

    await page.waitForSelector(
      "#cell-r-heavy .webgeods-output .webgeods-log-error",
      { timeout: 10_000 }
    );

    const runBtnDisabled =
      await page.locator("#cell-r-heavy .webgeods-run-btn").isDisabled();

    if (runBtnDisabled) {
      throw new Error("the Run button remained disabled after termination");
    }

  });

  await check("§14 the R worker recreates transparently", async () => {

    // Same pattern as §12: any R cell after termination must work
    // again without manual intervention.
    await runCell(page, "#cell-r-base", {
      expect: "success",
      includes: ["Hello from R!", "1 2 3 4 5"],
      timeout: 60_000 // reloads webR after termination
    });

  });


  // ------------------------------------------------------------
  // §15 — Lua filter webgeods-cells.lua, {.webgeods-python}/{.webgeods-r} cells
  // ------------------------------------------------------------

  console.log("\n§15 Lua filter — {.webgeods-python}/{.webgeods-r} cells");

  await check("§15 Python — status box already exists before Run", async () => {

    const text =
      await page.locator("#lua-py-status").innerText();

    assertIncludes(text, "no execution yet", "#lua-py-status");

  });

  await check("§15 R — status box already exists before Run", async () => {

    const text =
      await page.locator("#lua-r-status").innerText();

    assertIncludes(text, "no execution yet", "#lua-r-status");

  });

  await check("§15 Python — cell generated by the filter, Run + getCellValue reactivity", async () => {

    await runCell(page, "#lua-py", {
      expect: "success",
      includes: ["Output: 42"]
    });

    await page.waitForFunction(
      () => document.getElementById("lua-py-status").textContent.includes("42"),
      undefined,
      { timeout: 10_000 }
    );

  });

  await check("§15 R — cell generated by the filter, Run + getCellValue reactivity", async () => {

    // Unlike the twin Python cell above: R auto-prints "6 * 7" as
    // "[1] 42" (same reason as §5/§6), so no "Output: ..." line
    // appears once stdout is non-empty — only "42" is asserted here,
    // not "Output: 42".
    await runCell(page, "#lua-r", {
      expect: "success",
      includes: ["42"]
    });

    await page.waitForFunction(
      () => document.getElementById("lua-r-status").textContent.includes("42"),
      undefined,
      { timeout: 10_000 }
    );

  });


  // ------------------------------------------------------------
  // §16 — Python/R → JS value conversion (getCellValue)
  // ------------------------------------------------------------

  console.log("\n§16 Python/R → JS conversion");

  // --- Python: cases with an expected, verifiable outcome -----------

  await check("§16 Python — int", async () => {
    await checkConversion(page, {
      cellId: "conv-py-int",
      descId: "conv-py-int-desc",
      expectType: "number",
      expectArray: "false",
      previewIncludes: "42"
    });
  });

  await check("§16 Python — float", async () => {
    await checkConversion(page, {
      cellId: "conv-py-float",
      descId: "conv-py-float-desc",
      expectType: "number",
      previewIncludes: "3.14159"
    });
  });

  await check("§16 Python — str", async () => {
    await checkConversion(page, {
      cellId: "conv-py-str",
      descId: "conv-py-str-desc",
      expectType: "string",
      previewIncludes: "hello from the conversion test"
    });
  });

  await check("§16 Python — bool", async () => {
    await checkConversion(page, {
      cellId: "conv-py-bool",
      descId: "conv-py-bool-desc",
      expectType: "boolean",
      previewIncludes: "true"
    });
  });

  await check("§16 Python — None → undefined (known ambiguity, see callout in §16)", async () => {

    // We can't use the "normal" checkConversion: the box shows
    // typeof=undefined identically before and after the Run (it's
    // exactly the ambiguity documented in §16's callout), so there's
    // no new preview to wait for. Instead we separately verify the
    // two things we CAN check: (a) the cell itself succeeded (the
    // Python execution actually happened), (b) the OJS box still
    // shows typeof=undefined — the direct confirmation of the
    // None → undefined conversion already read in the source.
    await runCell(page, "#conv-py-none", { expect: "success" });

    const text =
      await readConversionDesc(page, "conv-py-none-desc", { timeout: 10_000 });

    assertIncludes(text, "typeof=undefined", "#conv-py-none-desc");

  });

  await check("§16 Python — list", async () => {
    await checkConversion(page, {
      cellId: "conv-py-list",
      descId: "conv-py-list-desc",
      expectType: "object",
      expectArray: "true",
      previewIncludes: ["1,2,3", "four"]
    });
  });

  await check("§16 Python — dict", async () => {
    await checkConversion(page, {
      cellId: "conv-py-dict",
      descId: "conv-py-dict-desc",
      expectType: "object",
      expectArray: "false",
      previewIncludes: ["\"name\":\"Rome\"", "2873000"]
    });
  });

  await check("§16 Python — nested dict, GeoJSON-style", async () => {
    await checkConversion(page, {
      cellId: "conv-py-geojson",
      descId: "conv-py-geojson-desc",
      expectType: "object",
      expectArray: "false",
      previewIncludes: ["\"type\":\"Feature\"", "12.4964", "41.9028"]
    });
  });

  await check("§16 Python — numpy.ndarray", async () => {
    await checkConversion(page, {
      cellId: "conv-py-numpy",
      descId: "conv-py-numpy-desc",
      expectType: "object",
      expectArray: "true",
      previewIncludes: "1,2,3",
      timeout: 60_000 // first load of numpy on this page
    });
  });

  // --- Python: packages whose availability isn't guaranteed ---------
  // in EVERY Pyodide environment (geopandas in particular). Shape
  // asserted here: toTransferable() in runtime.js recognizes
  // pandas.DataFrame/geopandas.GeoDataFrame by duck-typing before the
  // string fallback — .to_dict("records") for pandas (array of row
  // objects), .to_json() + JSON.parse for geopandas (real GeoJSON,
  // numeric coordinates). A cell failing due to a missing package is
  // a valid observation, not a test failure — see
  // observePackageAvailability().

  await check("§16 Python — pandas.DataFrame", async () => {
    await observePackageAvailability(page, {
      cellId: "conv-py-pandas",
      descId: "conv-py-pandas-desc",
      note: "Python pandas.DataFrame → JS ?",
      expectType: "object",
      previewIncludes: ["\"name\":\"Rome\"", "\"population\":2873000", "Milan", "1372000"],
      timeout: 60_000 // first load of pandas on this page
    });
  });

  await check("§16 Python — geopandas.GeoDataFrame", async () => {
    await observePackageAvailability(page, {
      cellId: "conv-py-geopandas",
      descId: "conv-py-geopandas-desc",
      note: "Python geopandas.GeoDataFrame → JS ?",
      expectType: "object",
      previewIncludes: ["\"type\":\"FeatureCollection\"", "\"type\":\"Point\"", "12.4964", "41.9028"],
      timeout: 90_000 // geopandas has a longer dependency chain (shapely, pyproj, ...)
    });
  });

  // --- R: cases with an expected, verifiable outcome -----------------

  await check("§16 R — numeric", async () => {
    await checkConversion(page, {
      cellId: "conv-r-num",
      descId: "conv-r-num-desc",
      expectType: "number",
      previewIncludes: "42"
    });
  });

  await check("§16 R — character", async () => {
    await checkConversion(page, {
      cellId: "conv-r-str",
      descId: "conv-r-str-desc",
      expectType: "string",
      previewIncludes: "hello from the conversion test"
    });
  });

  await check("§16 R — logical", async () => {
    await checkConversion(page, {
      cellId: "conv-r-bool",
      descId: "conv-r-bool-desc",
      expectType: "boolean",
      previewIncludes: "true"
    });
  });

  await check("§16 R — numeric vector (rObjectToNativeJs, no unwrap because len>1)", async () => {
    await checkConversion(page, {
      cellId: "conv-r-vec-num",
      descId: "conv-r-vec-num-desc",
      expectType: "object",
      expectArray: "true",
      previewIncludes: "1,2,3,4,5"
    });
  });

  await check("§16 R — string vector", async () => {
    await checkConversion(page, {
      cellId: "conv-r-vec-str",
      descId: "conv-r-vec-str-desc",
      expectType: "object",
      expectArray: "true",
      previewIncludes: ["\"a\"", "\"b\"", "\"c\""]
    });
  });

  // --- R: NULL/list/data.frame/sf, converted by convertRawRValue()
  // in r.js: NULL -> real JS null; list/data.frame/sf with names
  // become a flat JS object with the original keys (columnar for
  // data.frame/sf, since both are internally lists of columns in R)
  // — see the callout at the top of §16 in the .qmd for detail.

  await check("§16 R — NULL", async () => {
    await checkConversion(page, {
      cellId: "conv-r-null",
      descId: "conv-r-null-desc",
      expectType: "null",
      expectArray: "false",
      previewIncludes: "null"
    });
  });

  await check("§16 R — named list", async () => {
    await checkConversion(page, {
      cellId: "conv-r-list",
      descId: "conv-r-list-desc",
      expectType: "object",
      expectArray: "false",
      previewIncludes: [
        "\"name\":\"Rome\"", "\"population\":2873000"
      ]
    });
  });

  await check("§16 R — data.frame", async () => {
    await checkConversion(page, {
      cellId: "conv-r-df",
      descId: "conv-r-df-desc",
      expectType: "object",
      expectArray: "false",
      previewIncludes: [
        "\"name\":[\"Rome\",\"Milan\"]", "\"population\":[2873000,1372000]"
      ]
    });
  });

  await check("§16 R — sf", async () => {
    // Declares its own `#| package: sf` rather than relying on an
    // earlier section: §14 (R — explicit stop) sits in between and
    // recreates the R worker, so a package loaded before it is gone
    // by here. Normal columns get a readable key, but the geometry
    // column stays raw coordinates with no type/CRS — see
    // conv-r-sf-geojson below for the recommended pattern when clean
    // GeoJSON is needed.
    await checkConversion(page, {
      cellId: "conv-r-sf",
      descId: "conv-r-sf-desc",
      expectType: "object",
      expectArray: "false",
      previewIncludes: [
        "\"name\":\"Rome\"", "\"geometry\":[[12.4964,41.9028]]"
      ],
      timeout: 30_000
    });
  });

  await check("§16 R — sf explicitly converted to GeoJSON (geojsonsf)", async () => {
    // Demonstrates the recommended pattern for clean GeoJSON from an
    // sf object: geojsonsf::sf_geojson() after an explicit
    // sf::st_transform(x, 4326) — sf_geojson() doesn't reproject on
    // its own, so without the transform a non-WGS84 sf object would
    // produce syntactically valid but geographically wrong GeoJSON.
    // Uses observePackageAvailability() rather than checkConversion():
    // geojsonsf isn't guaranteed to be available as a webR/WASM
    // binary in every environment, and a missing-package failure
    // should count as a valid observation, not a test failure.
    // sf_geojson() wraps a single-row sf in a FeatureCollection with
    // one Feature, not a bare Feature.
    await observePackageAvailability(page, {
      cellId: "conv-r-sf-geojson",
      descId: "conv-r-sf-geojson-desc",
      note: "R sf → GeoJSON (geojsonsf) → JS ?",
      expectType: "object",
      previewIncludes: [
        "\"type\":\"FeatureCollection\"", "\"type\":\"Feature\"", "\"type\":\"Point\"", "12.4964", "41.9028"
      ],
      timeout: 30_000
    });
  });


  // ------------------------------------------------------------
  // Final report
  // ------------------------------------------------------------

  await browser.close();

  const failed =
    results.filter((r) => !r.pass);

  console.log("\n" + "=".repeat(60));
  console.log(`Result: ${results.length - failed.length}/${results.length} checks passed`);

  if (failed.length) {
    console.log("\nFailed checks:");
    for (const r of failed) {
      console.log(`  ✗ ${r.name}\n      ${r.error}`);
    }
  }

  if (consoleErrors.length) {
    console.log(
      `\n(${consoleErrors.length} unhandled JS errors recorded on the page — ` +
      "normal for §4/§8 (intentional error cells), only worth checking if unexpected elsewhere.)"
    );
  }

  if (observedShapes.length) {
    console.log("\n§16 — packages with uncertain availability, summary:");
    for (const o of observedShapes) {
      console.log(`  • ${o.note}\n      ${o.text}`);
    }
    console.log(
      "\n  Each line above has already gone through a pass/fail check when the\n" +
      "  package was available (the shape is verified, not just observed) —\n" +
      "  this summary only serves to make the \"missing package\" outcome\n" +
      "  visible too, which would otherwise leave no trace in the report."
    );
  }

  console.log("=".repeat(60));

  process.exit(failed.length ? 1 : 0);

}

main().catch((err) => {
  console.error("Fatal error in the test script:", err);
  process.exit(1);
});
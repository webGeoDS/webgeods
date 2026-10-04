// Serves the freshly-built bundle locally and mounts the "self-test" page
// in a real browser: checks that state updates on click, that an effect
// ran, that a portal rendered into an element outside the mount point
// and follows the same state, and that unmounting cleans up. Not just
// "the global exists". Used by build.sh.
import { chromium } from "playwright";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const bundlePath = process.argv[2];
if (!bundlePath) {
  console.error("Usage: node verify-bundle.mjs <path-to-bundle.js>");
  process.exit(2);
}
const bundleDir = path.dirname(path.resolve(bundlePath));
const bundleName = path.basename(bundlePath);

const html = `<!doctype html><html><body>
<div id="root"></div>
<p>between paragraphs</p>
<div id="slot"></div>
<script src="/${bundleName}"></script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
    return;
  }
  try {
    const data = await readFile(path.join(bundleDir, decodeURIComponent(req.url)));
    res.writeHead(200, { "content-type": "application/javascript" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let pageError = null;
page.on("pageerror", (err) => { pageError = err.message; });

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 30000 });

const failures = [];
const exposed = await page.evaluate(() => window.WebGeoDS?.Preact?.pages ?? null);
if (!exposed) {
  failures.push("window.WebGeoDS.Preact not defined after loading the bundle.");
} else {
  await page.evaluate(() => { window.__unmount = window.WebGeoDS.Preact.mount("self-test", "#root", { portalTarget: "#slot" }); });
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => ({
    button: document.querySelector("#root button")?.textContent,
    effect: document.querySelector("#root [data-effect]")?.textContent,
    portal: document.querySelector("#slot [data-portal]")?.textContent
  }));
  await page.click("#root button");
  await page.click("#root button");
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({
    button: document.querySelector("#root button")?.textContent,
    portal: document.querySelector("#slot [data-portal]")?.textContent
  }));
  await page.evaluate(() => window.__unmount());
  const unmounted = await page.evaluate(() => ({
    root: document.querySelector("#root").childElementCount,
    slot: document.querySelector("#slot").childElementCount
  }));
  let unknownPageError = null;
  try {
    await page.evaluate(() => window.WebGeoDS.Preact.mount("no-such-page", "#root"));
  } catch (e) {
    unknownPageError = String(e.message);
  }

  if (before.button !== "clicked 0") failures.push(`initial render: ${before.button}`);
  if (before.effect !== "effect ran") failures.push(`effect: ${before.effect}`);
  if (before.portal !== "in portal, count 0") failures.push(`portal initial: ${before.portal}`);
  if (after.button !== "clicked 2") failures.push(`state update: ${after.button}`);
  if (after.portal !== "in portal, count 2") failures.push(`portal follows state: ${after.portal}`);
  if (unmounted.root !== 0 || unmounted.slot !== 0) failures.push(`unmount left nodes: ${JSON.stringify(unmounted)}`);
  if (!unknownPageError || !/unknown page/.test(unknownPageError)) failures.push(`unknown page not reported clearly: ${unknownPageError}`);
}

await browser.close();
server.close();

if (pageError) failures.push(`page error: ${pageError}`);
if (failures.length) {
  console.error("✗ Bundle verification failed:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
console.log("✓ Bundle mounts, updates state, runs effects, renders portals, unmounts cleanly.");

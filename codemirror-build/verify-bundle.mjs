// Serves the freshly-built bundle locally and actually instantiates a
// Python and an R CodeMirror editor in a real browser — not just
// checking that the expected export names exist. Used by build.sh.
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

const html = `<!doctype html><html><body><script src="/${bundleName}"></script></body></html>`;

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

const result = await page.evaluate(() => {
  const cm = window.WebGeoDSCodeMirror;
  if (!cm) return { found: false };
  const expected = ["EditorView", "basicSetup", "EditorState", "python", "r", "oneDark", "autocompletion"];
  const missing = expected.filter((k) => !(k in cm));
  if (missing.length) return { found: true, missing };

  const el = document.createElement("div");
  document.body.appendChild(el);
  try {
    const pyState = cm.EditorState.create({ doc: "print(1)", extensions: [cm.basicSetup, cm.python(), cm.autocompletion()] });
    new cm.EditorView({ state: pyState, parent: el }).destroy();
    const rState = cm.EditorState.create({ doc: "1:5", extensions: [cm.basicSetup, cm.r()] });
    new cm.EditorView({ state: rState, parent: el }).destroy();
  } catch (e) {
    return { found: true, error: e.message };
  }
  return { found: true, ok: true };
});

await browser.close();
server.close();

if (pageError) {
  console.error("✗ Page error while loading bundle:", pageError);
  process.exit(1);
}
if (!result.found) {
  console.error("✗ window.WebGeoDSCodeMirror not defined after loading the bundle.");
  process.exit(1);
}
if (result.missing) {
  console.error("✗ Missing exports:", result.missing.join(", "));
  process.exit(1);
}
if (result.error) {
  console.error("✗ Failed to instantiate a real editor:", result.error);
  process.exit(1);
}
console.log("✓ All exports present, Python and R editors instantiated successfully.");

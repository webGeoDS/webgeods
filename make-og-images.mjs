// Builds the Open Graph preview images (1200x630) that LinkedIn, Slack and
// other link previews show for webgeods.com pages:
//   blog/og-image.png       generic card, used by every page without its own
//   blog/og/<tool>.png      per-tool cards with the tool's real example result
// Per-tool cards screenshot the LIVE tool after "Load example" (and its
// compute button, if the example doesn't compute on its own), so re-run
// after deploying a change that alters what a tool's example looks like.
// A page opts in with `og-image: og/<tool>.png` in its front matter
// (read by blog/seo-meta.lua).
//
// Usage: node make-og-images.mjs            (all cards)
//        node make-og-images.mjs generic    (only blog/og-image.png)
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(".");
const OUT_DIR = resolve(ROOT, "blog/og");
// Inlined as data URLs: a page built with setContent() can't load file:// fonts.
const font = (name) =>
  "data:font/woff2;base64," + readFileSync(resolve(ROOT, "shared/fonts", name)).toString("base64");

const TOOLS = [
  {
    slug: "network-from-lines",
    title: "Network from Lines",
    blurb: "Turn a road or cable layer into a network graph and check its connectivity.",
    compute: /build graph/i,
    // the map's lines are too thin to read at thumbnail size; the graph panel isn't
    shot: "diagram",
  },
  {
    slug: "geojson-shapefile-validator",
    title: "GeoJSON & Shapefile Validator",
    blurb: "Find every invalid geometry, with the reason for each error and an automatic repair.",
    compute: null,
    shot: "map",
  },
  {
    slug: "kriging-interpolator",
    title: "Kriging Interpolator",
    blurb: "From scattered point samples to a continuous surface, with a fitted variogram.",
    compute: /interpolate/i,
    shot: "map",
  },
];

const css = `
@font-face { font-family: "Serif"; src: url("${font("source-serif-4-variable.woff2")}"); font-weight: 200 900; }
@font-face { font-family: "Sans"; src: url("${font("source-sans-3-variable.woff2")}"); font-weight: 200 900; }
@font-face { font-family: "Mono"; src: url("${font("ibm-plex-mono-400.woff2")}"); font-weight: 400; }
* { margin: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; overflow: hidden; background: #f3ede1; color: #2a2117; }
.wordmark { font-family: "Serif"; font-weight: 700; letter-spacing: -0.01em; }
.wordmark .geo { color: #ab502b; }
.mono { font-family: "Mono"; color: #5a4f3e; }
`;

const wordmark = '<span class="wordmark">web<span class="geo">Geo</span>DS</span>';

function genericHtml() {
  return `<html><head><style>${css}
    .lines { position: absolute; inset: 0; }
    .text { position: absolute; left: 90px; top: 190px; width: 760px; }
    .text .wordmark { font-size: 64px; display: block; margin-bottom: 36px; }
    .tag { font-family: "Sans"; font-size: 29px; line-height: 1.38; margin-bottom: 38px; }
    .mono { font-size: 19px; }
  </style></head><body>
    <svg class="lines" width="1200" height="630">
      <polyline points="872,0 812,279 1200,360" fill="none" stroke="#ddd1b8" stroke-width="2"/>
      <polyline points="935,0 886,232 1200,298" fill="none" stroke="#ddd1b8" stroke-width="2"/>
    </svg>
    <div class="text">${wordmark}
      <div class="tag">Spatial Data Science, directly in your browser: interactive articles and free tools for Python and R.</div>
      <div class="mono">webgeods.com · no install · nothing uploaded</div>
    </div>
  </body></html>`;
}

function toolHtml(tool, imgDataUrl) {
  return `<html><head><style>${css}
    .left { position: absolute; left: 0; top: 0; width: 470px; height: 630px; padding: 64px 48px 56px 64px;
            display: flex; flex-direction: column; }
    .left .wordmark { font-size: 30px; }
    h1 { font-family: "Serif"; font-weight: 700; font-size: 50px; line-height: 1.08; margin: auto 0 22px; }
    .blurb { font-family: "Sans"; font-size: 25px; line-height: 1.38; color: #2a2117; margin-bottom: auto; }
    .mono { font-size: 17px; margin-top: 28px; }
    .right { position: absolute; left: 470px; top: 0; width: 730px; height: 630px; background: #eee5d2;
             border-left: 1px solid #ddd1b8; overflow: hidden; }
    .right img { width: 100%; height: 100%; display: block; }
    .right.map img { object-fit: cover; }
    .right.diagram img { object-fit: contain; padding: 36px; }
    .attrib { position: absolute; right: 0; bottom: 0; padding: 3px 8px; font-family: "Sans"; font-size: 13px;
              color: #2a2117; background: rgba(255,255,255,0.8); }
  </style></head><body>
    <div class="left">${wordmark}
      <h1>${tool.title}</h1>
      <div class="blurb">${tool.blurb}</div>
      <div class="mono">webgeods.com · free · no install</div>
    </div>
    <div class="right ${tool.shot}"><img src="${imgDataUrl}">
      ${tool.shot === "map" ? '<div class="attrib">© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap</div>' : ""}
    </div>
  </body></html>`;
}

async function renderCard(browser, html, outPath) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outPath });
  await page.close();
  console.log("wrote", outPath);
}

async function captureTool(browser, tool) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(`https://webgeods.com/tools/${tool.slug}.html`, { waitUntil: "load", timeout: 60000 });
  await page.getByRole("button", { name: /load example/i }).first().click();
  await page.waitForTimeout(5000);
  if (tool.compute) {
    await page.locator("button:visible", { hasText: tool.compute }).first().click();
    await page.waitForTimeout(12000);
  }
  const map = page.locator(".maplibregl-map").first();
  await map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000); // basemap tiles
  // the card draws its own attribution line, the cropped original may be cut off
  await page.addStyleTag({ content: ".maplibregl-ctrl-attrib { display: none !important; }" });
  // the layer on/off checkbox overlay would be cut in half by the card's crop
  await page.evaluate(() => {
    const map = document.querySelector(".maplibregl-map");
    const scope = map.parentElement;
    for (const cb of scope.querySelectorAll('input[type="checkbox"]')) {
      let el = cb;
      while (el.parentElement && el.parentElement !== scope && !el.parentElement.contains(map)) el = el.parentElement;
      el.style.display = "none";
    }
  });
  let box = await map.boundingBox();
  if (tool.shot === "diagram") {
    // the graph panel: the element just right of the map, same top
    box = await page.evaluate(({ x, y }) => {
      let el = document.elementFromPoint(x, y);
      while (el && el.getBoundingClientRect().width < 300) el = el.parentElement;
      const r = el.getBoundingClientRect();
      return { x: r.x + 1, y: r.y + 1, width: r.width - 2, height: r.height - 2 };
    }, { x: box.x + box.width + 40, y: box.y + 40 });
  } else {
    box = { x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 2 };
  }
  const buf = await page.screenshot({ clip: box });
  await page.close();
  return "data:image/png;base64," + buf.toString("base64");
}

const only = process.argv[2];
const browser = await chromium.launch();
await renderCard(browser, genericHtml(), resolve(ROOT, "blog/og-image.png"));
if (only !== "generic") {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const tool of TOOLS) {
    const img = await captureTool(browser, tool);
    await renderCard(browser, toolHtml(tool, img), resolve(OUT_DIR, `${tool.slug}.png`));
  }
}
await browser.close();

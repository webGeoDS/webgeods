#!/usr/bin/env node
// Fast edit loop for tool and article pages: `npm run dev`, then reload
// the page in the browser after saving.
//
// - Rebuilds the bundle on every save of src/ (esbuild watch, not
//   minified, inline source map) straight into ../blog/_site/, the
//   already-rendered site. No quarto render needed for a component or
//   config change.
// - Copies a saved shared/ file (styles.css, map.js...) into
//   ../blog/_site/ when the site serves one by that name.
// - Serves ../blog/_site/ on http://127.0.0.1:4801 (static-server.mjs).
//
// Only the rendered site is touched: the committed bundle
// (shared/webgeods-preact.js, minified) still comes from ./build.sh, and
// the blog/ copies from ../sync-shared-assets.sh. A change
// to a .qmd page still needs `quarto render` of that page.
import * as esbuild from "esbuild";
import { copyFileSync, existsSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SITE = path.join(ROOT, "blog", "_site");
const SHARED = path.join(ROOT, "shared");
const PORT = 4801;

if (!existsSync(SITE)) {
  console.error("No blog/_site yet: run `quarto render` in blog/ once first.");
  process.exit(1);
}

const time = () => new Date().toTimeString().slice(0, 8);

const context = await esbuild.context({
  entryPoints: [path.join(HERE, "src", "index.js")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  jsxImportSource: "preact",
  loader: { ".js": "jsx" },
  target: "es2020",
  sourcemap: "inline",
  outfile: path.join(SITE, "webgeods-preact.js"),
  logLevel: "warning",
  plugins: [{
    name: "report",
    setup(build) {
      build.onEnd((result) => {
        if (!result.errors.length) console.log(`${time()}  bundle rebuilt`);
      });
    }
  }]
});
await context.watch();

// The bundle is built above from src/; the committed copy in shared/ is
// left to build.sh.
watch(SHARED, (event, file) => {
  if (!file || file === "webgeods-preact.js") return;
  const target = path.join(SITE, file);
  if (!existsSync(target)) return;
  try {
    copyFileSync(path.join(SHARED, file), target);
    console.log(`${time()}  ${file} copied`);
  } catch (err) {
    console.error(`${time()}  ${file}: ${err.message}`);
  }
});

// In this same process, not a child one: on Windows a child server
// outlived a stopped `npm run dev` and kept the port busy.
process.argv = [process.argv[0], "static-server.mjs", SITE, String(PORT)];
await import(new URL("../static-server.mjs", import.meta.url));

console.log(`Serving blog/_site on http://127.0.0.1:${PORT} — save, then reload the page. Ctrl+C to stop.`);

# dashboard-tests

Dedicated automated test suite for `shared/dashboard.js` +
`shared/dashboard-dom.js` (`WebGeoDS.Dashboard`) — separate from
`smoke-test.mjs` (the whole page, R/Python included) and from
`map-tests/` (`WebGeoDS.Map` on its own). Runs against
`dashboard-test.html`, a minimal static fixture that loads the full
JS stack `Dashboard` needs (`map.js`/`map-raster.js`/`map-table.js`,
`table.js`, `d3.min.js`/`graph-diagram.js`, `upload.js`, `download.js`,
`ui.js`, `dashboard.js`/`dashboard-dom.js`) but STUBS
`WebGeoDS.CodeCell` — no Quarto render, no webR/Pyodide cold-load, so
it verifies Dashboard's own orchestration (config → DOM →
`_cell().run()` → layers/stats/legend/table/diagram → reset), not
Python/R execution, and stays fast.

Each check registers its own canned cells via
`window.__registerCells(tool, overrides)` and builds a config via
`window.__buildConfig(tool)` (both set up once, in
`run-dashboard-tests.mjs`, before the checks run) — a tool never
needs Python/R, only a `run()` that returns whatever shape the
config's own `layers[].from`/`stats`/`table.sources`/`diagram` expect.

Real file upload (`shared/upload.js`'s own `Upload.load()`) is a
separate concern, not covered here — every check drives the
`loadExample()` path instead, which is enough to exercise
`Dashboard`'s own compute lifecycle.

## Usage

```
node run-dashboard-tests.mjs [--headed]
```

or, for the same leftover-process hygiene `map-tests/
run-map-tests.sh` has:

```
./run-dashboard-tests.sh [--headed]
```

Uses the project's existing Playwright install (no separate
`node_modules` here) — run from anywhere, paths are resolved relative
to the script itself.

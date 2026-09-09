# map-tests

Dedicated automated test suite for `shared/map.js` (`WebGeoDS.Map`) —
separate from `smoke-test.mjs`, which covers the whole
`test-architettura.qmd` page including R/Python. This suite runs
against `map-test.html`, a minimal static fixture that loads only
`map.js` + the vendored MapLibre bundle — no Quarto render, no
webR/Pyodide cold-load, so it stays fast.

Also the intended home for tests of the future R/Python
mapping-library bridge (`mapgl`/`py-maplibregl` driven, see the
conversation this was built from) — add new `check()` blocks to
`run-map-tests.mjs` as that lands, rather than starting a new file.

## Usage

```
node run-map-tests.mjs [--headed]
```

Uses the project's existing Playwright install (no separate
`node_modules` here) — run from anywhere, paths are resolved relative
to the script itself.

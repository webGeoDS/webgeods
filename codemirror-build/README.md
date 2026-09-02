# codemirror-build

Reproducible build for `../shared/codemirror-bundle.js` — the vendored
replacement for the 6 separate `esm.sh` ESM imports CodeMirror used to
load from at runtime (see the "Vendored locally..." comment in
`../shared/code-cell.js`).

Not part of the published site itself — a dev-only tool, same role for
CodeMirror that `vendor-maplibre.sh`/`vendor-pyodide.sh`/`vendor-webr.sh`
play for the other vendored engines.

## Usage

```
./build.sh
```

Installs the exact pinned versions in `package.json`, bundles `entry.js`
with esbuild into `../shared/codemirror-bundle.js`, then verifies the
result in a real headless browser (loads the bundle, instantiates an
actual Python and R editor — not just checks the exports exist).

## Bumping a version

Edit the version in `package.json` **and** the matching comment in
`../shared/code-cell.js` (nothing enforces these staying in sync
automatically). Delete `package-lock.json` first if you want npm to
re-resolve transitive dependencies instead of reusing the locked ones.
Then run `./build.sh` and verify with `../run-smoke-test.sh` against a
real render before committing.

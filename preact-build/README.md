# preact-build

Reproducible build for `../shared/webgeods-preact.js`: the Preact
components behind the interactive parts of pages that no longer use OJS
cells. Same role as `../codemirror-build/` for CodeMirror: a dev-only
tool, not part of the published site. The built bundle is committed, so
the deploy workflow needs no Node build step.

## Usage

```
./build.sh
../sync-shared-assets.sh
```

`build.sh` installs the exact pinned versions in `package.json`, bundles
`src/index.js` with esbuild (JSX through Preact's automatic runtime) and
verifies the result in a real headless browser: mounts the `self-test`
page, clicks, checks state, effects, a portal and unmounting.

## Layout

- `src/index.js`: exposes `window.WebGeoDS.Preact.mount(name, target, props)`
  and the registry of page components.
- `src/pages/`: one component per migrated page (plus `SelfTest.js`).
- `src/components/`, `src/hooks/`: building blocks shared between pages.

Components use the existing site JavaScript (`WebGeoDS.Map`,
`WebGeoDS.CodeCell`, `WebGeoDS.Upload`, `WebGeoDS.Table`,
`WebGeoDS.renderVegaChart`...) through `window.WebGeoDS` at runtime; none
of it is bundled here.

## Using it on a page

The bundle is loaded only by the pages that use it (like the Vega
scripts), not site-wide:

```html
<div id="sc-root"></div>
<script src="/webgeods-preact.js"></script>
<script>
document.addEventListener("DOMContentLoaded", () =>
  WebGeoDS.Preact.mount("spatial-classifier-tool", "#sc-root"));
</script>
```

A page using it must have no `{ojs}` cells left: a single one makes
Quarto load its whole OJS runtime (~210 KB gz).

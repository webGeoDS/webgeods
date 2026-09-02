/**
 * WebGeoDS.Table
 *
 * Thin wrapper over Grid.js (vendored locally, gridjs.umd.js/
 * gridjs-mermaid.min.css — zero runtime dependencies, single UMD
 * build, same vendoring approach as maplibre-gl.js in map.js) for
 * rendering a reactive table from an OJS cell without every page
 * having to repeat the lazy-load/instance-tracking boilerplate.
 *
 * Exposes:
 *
 *   window.WebGeoDS.Table.render(containerOrId, { columns, data })
 *
 * `containerOrId` accepts either an existing element's id (string —
 * looked up via getElementById, throws if missing, the original
 * behavior) or an actual Element (used directly, no lookup) — the
 * latter is what WebGeoDS.Map.tableCell() passes when it auto-creates
 * its own container instead of requiring a hand-written `<div>` in
 * the page, mirroring WebGeoDS.Map's own auto-container constructor.
 *
 * Creates a new Grid.js table on first call for a given container;
 * subsequent calls (e.g. a reactive OJS cell re-running after new
 * data arrives) update the existing instance in place instead of
 * tearing it down and rebuilding it — same "create if missing, else
 * update" shape as WebGeoDS.Map.setGeoJSON().
 *
 * No ES module syntax is used so the file can be included directly
 * by Quarto in the generated HTML.
 */

(() => {

  "use strict";


  // ============================================================
  // Namespace
  // ============================================================

  window.WebGeoDS =
    window.WebGeoDS || {};


  // ============================================================
  // Configuration
  // ============================================================

  // Same `window.WEBGEODS_ASSET_BASE` convention as map.js's
  // MAPLIBRE_JS_URL/MAPLIBRE_CSS_URL — see the comment there for why
  // a bare relative path breaks on a page that isn't at the project
  // root (e.g. a nested blog post).
  const ASSET_BASE = window.WEBGEODS_ASSET_BASE || "";
  const GRIDJS_JS_URL = ASSET_BASE + "gridjs.umd.js";
  const GRIDJS_CSS_URL = ASSET_BASE + "gridjs-mermaid.min.css";


  // ============================================================
  // Instance registry — keyed by whatever render() was called with
  // (a container id string, or the Element itself), mirrors map.js's
  // _instances so repeated render() calls on the same container
  // update in place instead of creating a duplicate table. A real Map
  // (not a plain object) so an Element key works fine alongside
  // string keys.
  // ============================================================

  const _instances = new Map();


  // ============================================================
  // Lazy loader — loaded once per page, only when a table is
  // actually rendered, not on every page that merely includes this
  // script (same reasoning as loadMapLibreScript()/
  // loadCodeMirrorBundle()).
  // ============================================================

  let gridJsPromise = null;

  function loadGridJs() {

    if (window.gridjs) {
      return Promise.resolve(window.gridjs);
    }

    if (!gridJsPromise) {

      if (
        !document.querySelector(
          'link[data-webgeods-gridjs="true"]'
        )
      ) {

        const link =
          document.createElement("link");

        link.rel =
          "stylesheet";

        link.href =
          GRIDJS_CSS_URL;

        link.dataset.webgeodsGridjs =
          "true";

        document.head.appendChild(link);

      }

      gridJsPromise =
        new Promise((resolve, reject) => {

          const script =
            document.createElement("script");

          script.src =
            GRIDJS_JS_URL;

          script.onload =
            () => resolve(window.gridjs);

          script.onerror =
            () => reject(
              new Error(`WebGeoDS.Table: failed to load ${GRIDJS_JS_URL}.`)
            );

          document.head.appendChild(script);

        });

    }

    return gridJsPromise;

  }


  // ============================================================
  // render(containerOrId, { columns, data })
  // ============================================================

  async function render(
    containerOrId,
    { columns, data, ...options } = {}
  ) {

    const gridjs =
      await loadGridJs();

    const existing =
      _instances.get(containerOrId);

    if (existing) {

      // `columns` included here too, not just `data`: WebGeoDS.Map.table()
      // can call render() the first time with ZERO features (no source
      // data yet) — an empty `columns` array, since columns are the
      // union of properties keys seen — then again later once real
      // data (and real columns) exist. Only updating `data` here would
      // leave the FIRST call's empty columns frozen forever (verified
      // empirically: Grid.js's updateConfig({columns, data}) correctly
      // replaces the column set on an existing instance, not just a
      // constructor-time option).
      existing.updateConfig({ columns, data }).forceRender();

      return existing;

    }

    const container =
      containerOrId instanceof Element ?
        containerOrId :
        document.getElementById(containerOrId);

    if (!container) {

      throw new Error(
        `WebGeoDS.Table: element "${containerOrId}" not found.`
      );

    }

    // Quarto's own markdown rendering leaves whitespace text nodes
    // inside an otherwise-empty `<div>` — Grid.js refuses to render
    // into a container it doesn't consider genuinely empty. Harmless
    // (a no-op) for a freshly created, genuinely empty Element too.
    container.innerHTML =
      "";

    const grid =
      new gridjs.Grid({ columns, data, ...options });

    grid.render(container);

    _instances.set(containerOrId, grid);

    return grid;

  }


  // ============================================================
  // Public WebGeoDS API
  // ============================================================

  window.WebGeoDS.Table = {
    render,
    // Re-exported for anything that needs Grid.js's own helpers
    // directly (e.g. gridjs.html() for a formatted cell) without a
    // separate load step — resolves once loadGridJs() has already
    // run (i.e. after at least one render() call on the page).
    get gridjs() {
      return window.gridjs;
    }
  };


})();

/**
 * WebGeoDS.renderVegaChart
 *
 * A small, self-contained Vega-Lite chart wrapper for cross-linking a
 * chart to a map/table the same way shared/graph-diagram.js's
 * renderForceGraph() already does for a force-directed diagram --
 * `setSelected(key)` drives the chart FROM outside, an `onSelect`
 * callback drives outside code FROM a click on the chart.
 *
 * Built directly on vega-embed's own View API (vega.min.js +
 * vega-lite.min.js + vega-embed.min.js, loaded as separate UMD
 * bundles -- vega-embed's own build expects window.vega/window.vegaLite
 * as globals, confirmed by reading its UMD wrapper before vendoring),
 * not a React/framework wrapper: same reasoning as graph-diagram.js's
 * own choice of plain d3-force over a pre-built diagram library --
 * cross-linking needs direct control over the chart's live state, and
 * a thin wrapper library would just add a layer of indirection to
 * reach the same View API this file already uses straight.
 *
 * THE TWO-PARAM PATTERN THIS RELIES ON (required, not inferred --
 * same "explicit over guessed" reasoning as Dashboard's own
 * `layers[].type`): reading/writing Vega-Lite's OWN compiled
 * selection store directly turned out to be fragile, undocumented
 * internal machinery (`view.data(paramName + "_store")` changesets
 * silently no-op -- confirmed empirically, not assumed, before
 * settling on this design). Instead, every spec passed to this module
 * must declare TWO params:
 *
 *   "params": [
 *     { "name": "yourSelectParam", "select": { "type": "point", "fields": ["yourKeyField"] } },
 *     { "name": "yourExternalParam", "value": null }
 *   ]
 *
 * -- one real Vega-Lite point-selection param (drives the chart's own
 * click interaction and whatever encoding conditions on it, e.g.
 * `"condition": {"param": "yourSelectParam", ...}`), and one plain
 * signal param with no `select` binding, used as the single shared
 * "current selection" value BOTH directions read and write. A click
 * copies the point-selection's value into the plain param (internal
 * to this module); `setSelected()` writes the plain param directly.
 * The chart's own encoding should condition on the PLAIN param (e.g.
 * `"test": "datum.yourKeyField === yourExternalParam"`), not the
 * point-selection param, so both directions repaint it identically.
 *
 * Usage:
 *
 *   const chart = WebGeoDS.renderVegaChart("#my-chart", spec, {
 *     selectParam: "yourSelectParam",
 *     externalParam: "yourExternalParam",
 *     keyField: "yourKeyField",     // which field of the selection tuple is "the" key
 *     onSelect: (key) => { ... }    // cross-link hook: highlight this key on the map/table
 *   });
 *
 *   chart.setSelected(key);   // called FROM the map/table side, to
 *                             // highlight the matching bar/point here
 *   chart.destroy();
 *
 * No ES module syntax so this can be included directly by Quarto.
 */

(() => {

  "use strict";


  window.WebGeoDS =
    window.WebGeoDS || {};


  async function renderVegaChart(container, spec, opts = {}) {

    const el =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!el) {

      throw new Error(
        `WebGeoDS.renderVegaChart: container "${container}" not found.`
      );

    }

    const {
      selectParam,
      externalParam,
      keyField,
      onSelect
    } = opts;

    if (!selectParam || !externalParam || !keyField) {

      throw new Error(
        "WebGeoDS.renderVegaChart: opts.selectParam, opts.externalParam, " +
        "and opts.keyField are all required -- see this file's own doc " +
        "comment for the two-param spec pattern they refer to."
      );

    }

    el.replaceChildren();

    const result =
      await vegaEmbed(el, spec, { actions: false, renderer: "svg" });

    const view =
      result.view;

    let selectedKey =
      null;

    // The click -> outside direction: a real click populates
    // Vega-Lite's own compiled point-selection normally (native
    // interaction, unaffected by anything below) -- this listener
    // just also copies that same value into the plain external param,
    // so setSelected() and a click end up driving the exact same
    // signal, and calls the cross-link hook the same way a map
    // layer's onClick/a diagram's onNodeClick already do.
    //
    // .runAsync() (not the more obvious .run()), and no `await` here:
    // this listener fires WHILE Vega's own dataflow run (the one the
    // click itself triggered) is still in progress -- a synchronous
    // .run() re-enters it and throws "Dataflow already running"
    // (confirmed empirically). .runAsync() queues instead.
    view.addSignalListener(selectParam, (name, value) => {

      const key =
        value?.[keyField]?.[0] ?? null;

      if (key === selectedKey) {

        return;

      }

      selectedKey =
        key;

      view.signal(externalParam, key).runAsync();

      onSelect?.(key);

    });

    function setSelected(key) {

      selectedKey =
        key ?? null;

      view.signal(externalParam, selectedKey);
      view.runAsync();

    }

    function destroy() {

      result.finalize();
      el.replaceChildren();

    }

    return { setSelected, destroy, view };

  }


  // ============================================================
  // Public WebGeoDS API
  // ============================================================

  window.WebGeoDS.renderVegaChart =
    renderVegaChart;


})();

/**
 * WebGeoDS.statCard / .legend / .matchPaint / .resetButton /
 * .downloadButton / .controlPanelRow
 *
 * Small, tool-agnostic UI primitives, promoted here once the third
 * tool built in this family (Spatial Classifier) turned out to have a
 * near-byte-identical copy of what the first two (Spatial Clustering
 * Explorer, Buffer & Proximity) already had — same reasoning
 * shared/download.js's own doc comment gives for downloadBlob(): the
 * point to share code is once a second (here, third) tool duplicates
 * it, not before.
 *
 * Top-level on window.WebGeoDS, not namespaced under any sub-object
 * (e.g. not `.UI.statCard`) — same convention as createSlider() in
 * shared/upload.js: these aren't upload-specific or map-specific
 * concerns, just generic DOM builders that needed a home.
 *
 * Deliberately NOT included here: the upload-control wiring (mutable
 * uploadStatus/uploadBusy/uploadedFiles, the onChange handler,
 * uploadStatusEl) is also duplicated across tools, but OJS's
 * `mutable` declarations have to live as the document's own top-level
 * cells for Quarto's reactivity graph to see them — a plain JS
 * function called from inside a cell can't create new reactive
 * bindings on the caller's behalf. That duplication is a candidate
 * for a Lua filter (expanding a shortcode into the necessary `mutable`
 * cells at render time, which *can* do this), not for a runtime
 * helper — left alone here on purpose, not missed.
 *
 * No ES module syntax so this can be included directly by Quarto.
 */

(() => {

  "use strict";


  window.WebGeoDS =
    window.WebGeoDS || {};


  // ============================================================
  // statCard(rows) -- rows: [[label, value], ...], already built by
  // the caller (conditional rows are included/omitted before calling
  // this, not inside it -- keeps this function itself trivial and
  // free of any particular tool's business logic).
  // ============================================================

  function statCard(rows) {

    const box =
      document.createElement("div");

    box.className =
      "webgeods-stat-grid";

    for (const [label, value] of rows) {

      const dt =
        document.createElement("div");

      dt.className =
        "webgeods-stat-label";

      dt.textContent =
        label;

      const dd =
        document.createElement("div");

      dd.className =
        "webgeods-stat-value";

      dd.textContent =
        value;

      box.append(dt, dd);

    }

    return box;

  }


  // ============================================================
  // legend(items, opts) -- items: [{color, label}, ...]. A falsy/empty
  // items hides the wrapper (hidden = true) rather than rendering an
  // empty legend -- same "nothing computed yet" behavior every tool
  // built with this pattern already had. opts.swatchWidth defaults to
  // 24 (px) -- Buffer & Proximity's own legend used 32px swatches
  // (wider, to read well as an opacity gradient across rings) before
  // this helper existed, so that's an override, not a new behavior.
  // ============================================================

  function legend(items, opts = {}) {

    const swatchWidth =
      opts.swatchWidth ?? 24;

    const wrap =
      document.createElement("div");

    wrap.className =
      "webgeods-legend";

    if (!items || items.length === 0) {
      wrap.hidden = true;
      return wrap;
    }

    wrap.style.flexWrap =
      "wrap";

    wrap.style.rowGap =
      "8px";

    for (const { color, label } of items) {

      const swatch =
        document.createElement("div");

      swatch.className =
        "webgeods-legend-bar";

      swatch.style.flex =
        `0 0 ${swatchWidth}px`;

      swatch.style.background =
        color;

      const labelEl =
        document.createElement("span");

      labelEl.className =
        "webgeods-legend-label";

      labelEl.textContent =
        label;

      wrap.append(swatch, labelEl);

    }

    return wrap;

  }


  // ============================================================
  // matchPaint(labels, field, opts) -- builds a MapLibre "match"
  // paint expression keyed on a feature property (`field`), one color
  // per label in `labels`, cycling through the palette if there are
  // more labels than colors. Generalizes this project's own
  // clusterPaint()/classPaint() (previously hand-duplicated per tool,
  // one keyed on an integer cluster id, one on a string class label --
  // the match expression itself doesn't care which).
  //
  // Handles labels.length === 0 by returning a FLAT color instead of
  // a "match" expression with zero (value, output) pairs -- a real
  // bug found building the Spatial Classifier tool: MapLibre rejects
  // a match expression with no pairs before its fallback ("Expected
  // at least 4 arguments, but found only 2"), which a sparse/all-noise
  // real-world dataset can trigger legitimately, not just in theory.
  // ============================================================

  const DEFAULT_PALETTE =
    ["#ab502b", "#42583c", "#3d5a73", "#c48a2e", "#8b2f24"];

  const DEFAULT_FALLBACK_COLOR =
    "#766851";

  function matchPaint(labels, field, opts = {}) {

    const palette =
      opts.palette || DEFAULT_PALETTE;

    const fallback =
      opts.fallback ?? DEFAULT_FALLBACK_COLOR;

    const colorExpr =
      (!labels || labels.length === 0)
        ? fallback
        : (() => {
            const expr = ["match", ["get", field]];
            labels.forEach((label, i) => {
              expr.push(label, palette[i % palette.length]);
            });
            expr.push(fallback);
            return expr;
          })();

    if (opts.fill) {
      return {
        "fill-color": colorExpr,
        "fill-opacity": opts.fillOpacity ?? 0.45,
        "fill-outline-color": opts.fillOutline ?? "rgba(0,0,0,0)"
      };
    }

    return {
      "circle-color": colorExpr,
      "circle-radius": opts.radius ?? 6,
      "circle-stroke-width": opts.strokeWidth ?? 1,
      "circle-stroke-color": opts.strokeColor ?? "#2a2117"
    };

  }


  // ============================================================
  // toOutlineFeatures(featureCollection) -- extracts every Polygon/
  // MultiPolygon feature's ring(s) as LineString/MultiLineString
  // features, properties preserved. Promoted here (built for
  // geometry-validity.qmd, then found needed again by
  // geospatial-file-inspection.qmd and its standalone tool -- the
  // usual "third use" threshold this project promotes shared code at)
  // because a self-intersecting polygon (a bowtie, a hand-authored
  // "invalid geometry" example) can tessellate to a ZERO-area fill in
  // MapLibre -- verified empirically, not theoretical: even a flat
  // fill-color and fill-outline-color rendered nothing for one. A
  // LINE layer tracing the same ring has no such dependency -- it
  // draws the ring's vertices directly, so it renders correctly
  // regardless of self-intersection. Draw this ALONGSIDE the normal
  // fill layer, not instead of it -- free for every geometry whose
  // fill already renders fine (just a crisper boundary), and the only
  // thing that makes a self-intersecting one visible at all.
  // ============================================================

  function toOutlineFeatures(featureCollection) {

    const features = [];

    for (const feature of featureCollection?.features ?? []) {

      const geom = feature.geometry;

      const rings =
        geom?.type === "Polygon" ? geom.coordinates :
        geom?.type === "MultiPolygon" ? geom.coordinates.flat() :
        [];

      for (const ring of rings) {

        features.push({
          type: "Feature",
          properties: feature.properties,
          geometry: { type: "LineString", coordinates: ring }
        });

      }

    }

    return { type: "FeatureCollection", features };

  }


  // ============================================================
  // uploadStatusEl(status, busy) -- the status <span> next to the
  // upload control. Only reads its two arguments (never assigns a
  // `mutable` binding), so unlike the rest of the upload wiring this
  // one has no OJS reactivity constraint stopping it from moving here
  // -- see roadmap-acquisizione.md's "shared/ui.js" entries for why
  // the mutable declarations/uploadControl/onChange handler stay in
  // each tool's own .qmd instead.
  // ============================================================

  function uploadStatusEl(status, busy) {

    const span =
      document.createElement("span");

    span.className =
      "webgeods-panel-status" + (busy ? " webgeods-btn-loading" : "");

    span.textContent =
      status;

    return span;

  }


  // ============================================================
  // resetButton(onClick, label) -- the "🔄 Reset" outline button every
  // tool built so far has, byte-identical except for which reset
  // function it calls. `label` defaults to "🔄 Reset" (every tool's
  // own text) but is overridable -- a bilingual article resetting both
  // a map AND a table wants "🔄 Reset map and table" instead, still
  // the same button otherwise.
  // ============================================================

  function resetButton(onClick, label = "🔄 Reset") {

    const button =
      document.createElement("button");

    button.className =
      "webgeods-panel-btn";

    button.dataset.variant =
      "outline";

    button.textContent =
      label;

    button.onclick =
      () => onClick();

    return button;

  }


  // ============================================================
  // downloadButton(options) -- the "⬇ Download" outline button.
  // options: { getFeatures, filenameSuffix, enabled, tool,
  // defaultFilename, mimeType, getBaseName }. `enabled` and
  // `getFeatures`/`getBaseName` are read once at creation time, same
  // as every tool's own version already did (the button is rebuilt by
  // its OJS cell whenever the underlying state it closes over
  // changes, so this matches existing behavior exactly, not a
  // regression to "static").
  // ============================================================

  function downloadButton({
    getFeatures,
    getBaseName,
    filenameSuffix,
    defaultFilename,
    enabled,
    tool,
    mimeType = "application/geo+json"
  }) {

    const button =
      document.createElement("button");

    button.className =
      "webgeods-panel-btn";

    button.dataset.variant =
      "outline";

    button.textContent =
      "⬇ Download";

    button.disabled =
      !enabled;

    button.onclick =
      async () => {
        const features = getFeatures();
        if (!features) return;
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "⌛ Preparing...";
        try {
          const base = getBaseName ? getBaseName() : null;
          window.WebGeoDS.downloadBlob(
            JSON.stringify(features, null, 2),
            base ? `${base}${filenameSuffix}` : defaultFilename,
            mimeType,
            { tool }
          );
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      };

    return button;

  }


  // ============================================================
  // rasterDownloadButton(options) -- the "⬇ Download ..." button for
  // tools that export a raster (GeoTIFF) rather than GeoJSON. Kept as
  // its own function rather than a branch of downloadButton() above:
  // the payload doesn't just serialize in-memory data, it comes from
  // running a hidden export CodeCell and reading back a base64 value,
  // which needs a distinct sequence (prepare -> run cell -> read ->
  // decode -> download). Splitting it out means downloadButton()'s
  // existing GeoJSON callers are untouched by this addition, same
  // reasoning as keeping buffer-proximity's ringPaint separate from
  // matchPaint().
  //
  // options: { label, enabled, prepare, cellId, decode, getBaseName,
  // getFilename, tool, mimeType }.
  //
  // `prepare` is the one tool-specific step: a function that sets the
  // `window.*` globals the export cell reads via `#| inject:`, and
  // doubles as the live readiness check -- returning `false` aborts
  // before anything else runs (same as each tool's own
  // `if (!resultSummary) return;` guard did, checked live at click
  // time against the tool's own reactive state, not a value closed
  // over once at button-creation time). `decode` is the caller's own
  // base64-to-bytes function (already needed locally in every raster
  // tool to render the live preview overlay, so not worth a second
  // copy in here). `getFilename(base)` returns the final filename;
  // `enabled` only drives the initial disabled/enabled look, same
  // caveat as downloadButton() above.
  // ============================================================

  function rasterDownloadButton({
    label = "⬇ Download",
    enabled,
    prepare,
    cellId,
    decode,
    getBaseName,
    getFilename,
    tool,
    mimeType = "image/tiff"
  }) {

    const button =
      document.createElement("button");

    button.className =
      "webgeods-panel-btn";

    button.dataset.variant =
      "outline";

    button.textContent =
      label;

    button.disabled =
      !enabled;

    button.onclick =
      async () => {
        if (prepare() === false) return;
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "⌛ Preparing...";
        try {
          await window.WebGeoDS.CodeCell.find(cellId).run();
          const b64 = document.getElementById(cellId).value;
          const bytes = decode(b64);
          const base = getBaseName ? getBaseName() : null;
          window.WebGeoDS.downloadBlob(
            bytes,
            getFilename(base),
            mimeType,
            { tool }
          );
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      };

    return button;

  }


  // ============================================================
  // createSharedMap({ tool, center, zoom, height }) -- the
  // WebGeoDS.Map instantiate-and-ready sequence, byte-identical
  // across every tool except the tracked `tool` name. Not blocked by
  // any `mutable`/reactivity constraint (it's a plain async factory,
  // no `mutable` assignment inside it) -- it just hadn't been checked
  // for duplication yet. Kept top-level here rather than moved into
  // map.js: this is boilerplate a *caller* of WebGeoDS.Map repeats,
  // not a change to the Map class itself, and map.js stays untouched
  // until the Vega-Lite cross-link spec exists (see
  // roadmap-acquisizione.md).
  // ============================================================

  async function createSharedMap({ tool, center = [12.45, 41.9], zoom = 4, height = "480px" }) {

    const map =
      new window.WebGeoDS.Map({ center, zoom, height });

    await map.ready();

    window.WebGeoDS.track?.("tool_loaded", { tool });

    return map;

  }


  // ============================================================
  // controlPanelRow(children) -- the row wrapping upload/example/
  // download/reset controls, identical across every tool.
  // ============================================================

  function controlPanelRow(children) {

    const row =
      document.createElement("div");

    row.className =
      "webgeods-panel-row";

    row.append(...children);

    return row;

  }


  // ============================================================
  // Public WebGeoDS API -- top-level, see the doc comment above for
  // why these aren't namespaced under a sub-object.
  // ============================================================

  window.WebGeoDS.statCard = statCard;
  window.WebGeoDS.legend = legend;
  window.WebGeoDS.matchPaint = matchPaint;
  window.WebGeoDS.toOutlineFeatures = toOutlineFeatures;
  window.WebGeoDS.uploadStatusEl = uploadStatusEl;
  window.WebGeoDS.resetButton = resetButton;
  window.WebGeoDS.downloadButton = downloadButton;
  window.WebGeoDS.rasterDownloadButton = rasterDownloadButton;
  window.WebGeoDS.createSharedMap = createSharedMap;
  window.WebGeoDS.controlPanelRow = controlPanelRow;


})();

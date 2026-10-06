/**
 * WebGeoDS.matchPaint / .DEFAULT_PALETTE / .toOutlineFeatures /
 * .createSharedMap
 *
 * Small helpers shared by the tool and article components
 * (preact-build/src/): map paint for categories, the site's category
 * palette, polygon outlines, and the map setup sequence. The interface
 * itself (stat card, legend, buttons, tables) is built by those
 * components, not here.
 *
 * No ES module syntax so this can be included directly by Quarto.
 */

(() => {

  "use strict";


  window.WebGeoDS =
    window.WebGeoDS || {};


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

  // Also exported directly (WebGeoDS.DEFAULT_PALETTE, see bottom of
  // this file): matchPaint() uses it as its own default, but a
  // caller building a legend or a second view (e.g. a force diagram,
  // graph-diagram.js) needs the SAME colors to stay visually
  // consistent with the map -- CLUSTER_PALETTE/CLASS_PALETTE
  // (spatial-clustering-explorer.qmd/spatial-classifier.qmd) had
  // already hand-duplicated this exact array once each before a third
  // tool (network-from-lines.qmd) needed it too.
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

    if (opts.line) {
      return {
        "line-color": colorExpr,
        "line-width": opts.lineWidth ?? 2
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
  // createSharedMap({ tool, center, zoom, height }) -- the
  // WebGeoDS.Map instantiate-and-ready sequence (MapView uses it).
  // Here rather than in map.js: it's what a *caller* of
  // WebGeoDS.Map does, not part of the class.
  // ============================================================

  async function createSharedMap({ tool, center = [12.45, 41.9], zoom = 4, height = "480px" }) {

    const map =
      new window.WebGeoDS.Map({ center, zoom, height });

    await map.ready();

    window.WebGeoDS.track?.("tool_loaded", { tool });

    return map;

  }


  // ============================================================
  // Public WebGeoDS API -- top-level, see the doc comment above for
  // why these aren't namespaced under a sub-object.
  // ============================================================

  window.WebGeoDS.matchPaint = matchPaint;
  window.WebGeoDS.DEFAULT_PALETTE = DEFAULT_PALETTE;
  window.WebGeoDS.toOutlineFeatures = toOutlineFeatures;
  window.WebGeoDS.createSharedMap = createSharedMap;


})();

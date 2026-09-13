/**
 * WebGeoDS.renderForceGraph
 *
 * A small, self-contained node-link diagram for showing a graph's
 * TOPOLOGY next to a map that already shows its real geography — the
 * two views answer different questions (where is it vs. how is it
 * connected), so this deliberately doesn't try to replace the map.
 *
 * Built on d3-force (part of the single vendored d3.js — no extra
 * weight beyond that one file), not d3-graphviz: tried d3-graphviz
 * first, since Graphviz's own layout engines are the more traditional
 * choice for this kind of diagram, but its Graphviz-in-WASM core runs
 * in a Web Worker loaded through a fragile mechanism (a
 * `<script type="javascript/worker">` tag d3-graphviz scans for, with
 * several incompatible `@hpcc-js/wasm` bundle variants published) —
 * verified failing in practice (a silent, unrecoverable render
 * timeout) before switching, not just assumed risky. A spring-model
 * force layout is conceptually the same idea Graphviz's own
 * neato/fdp engines use anyway, and d3-force needs none of that
 * WASM/worker machinery — plain, reliable, and already exactly the
 * D3 selection/data-join substrate the rest of this project's future
 * cross-linking (map, table, Vega-Lite) will want to speak.
 *
 * Deliberately kept separate from WebGeoDS.Dashboard (dashboard.js):
 * Dashboard owns the map/stats/legend/download/reset skeleton every
 * tool needs, but a diagram panel is optional and tool-specific — a
 * tool wires the two together itself via Dashboard's
 * `compute.onResult` hook, not by Dashboard knowing anything about
 * diagrams.
 *
 * Usage:
 *
 *   const diagram = WebGeoDS.renderForceGraph("#my-diagram", {
 *     nodes: [{ id: "1" }, { id: "2" }, ...],   // GeoJSON Point features
 *     links: [{ source: "1", target: "2" }]     // GeoJSON LineString features
 *   }, {
 *     nodeId: (f) => f.properties.node,          // defaults to f.properties.id ?? f.id
 *     linkSource: (f) => f.properties.source,    // defaults to f.properties.source
 *     linkTarget: (f) => f.properties.target,    // defaults to f.properties.target
 *     nodeColor: (f) => "#3d5a73",
 *     onNodeClick: (id, feature) => { ... }       // cross-link hook: highlight
 *                                                  // this id on the map/table
 *   });
 *
 *   diagram.setSelected(id);   // called FROM the map/table side, to
 *                              // highlight the matching node here
 *   diagram.destroy();
 *
 * `nodes`/`links` are read as GeoJSON FeatureCollections OR plain
 * arrays of features/objects — whichever a compute cell's own return
 * shape already is, so a caller doesn't need to reshape its data just
 * for this. Geometry (if any) is ignored entirely: this is a topology
 * diagram, not a second map.
 *
 * No ES module syntax so this can be included directly by Quarto.
 */

(() => {

  "use strict";


  window.WebGeoDS =
    window.WebGeoDS || {};


  function asFeatureArray(value) {

    if (!value) {

      return [];

    }

    return Array.isArray(value) ? value : (value.features || []);

  }


  function renderForceGraph(container, { nodes, links }, opts = {}) {

    const el =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!el) {

      throw new Error(
        `WebGeoDS.renderForceGraph: container "${container}" not found.`
      );

    }

    const {
      nodeId = (f) => f.properties?.node ?? f.id,
      linkSource = (f) => f.properties?.source,
      linkTarget = (f) => f.properties?.target,
      nodeColor = () => "#3d5a73",
      linkColor = () => "#a89a80",
      nodeRadius = 6,
      // Matches shared/styles.css's --dataviz-selection (map.js's own
      // highlight() yellow) by default -- a selection should look the
      // same regardless of which view (map or diagram) it started
      // from.
      selectedColor = "#ffeb3b",
      onNodeClick,
      width = el.clientWidth || 400,
      height = el.clientHeight || 300
    } = opts;

    // d3-force mutates its inputs (adds x/y/vx/vy, and replaces a
    // link's string source/target with a direct node-object
    // reference) -- copied here so the caller's own data (typically a
    // Dashboard compute value, read elsewhere for stats/download) is
    // never touched.
    const nodeData =
      asFeatureArray(nodes).map((f) => ({ __id: String(nodeId(f)), __feature: f }));

    const linkData =
      asFeatureArray(links).map((f) => ({
        source: String(linkSource(f)),
        target: String(linkTarget(f)),
        __feature: f
      }));

    el.replaceChildren();

    const svg =
      d3.select(el)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height]);

    // Everything pan/zoom moves lives under this one group -- zoom()
    // below only ever touches ITS transform, never the individual
    // node/link positions the simulation's own tick handler writes.
    const zoomLayer =
      svg.append("g")
        .attr("class", "webgeods-graph-zoom-layer");

    const linkSel =
      zoomLayer.append("g")
        .attr("stroke-width", 1.5)
        .selectAll("line")
        .data(linkData)
        .join("line")
        .attr("stroke", (d) => linkColor(d.__feature));

    const nodeSel =
      zoomLayer.append("g")
        .attr("stroke", "#2a2117")
        .attr("stroke-width", 1)
        .selectAll("circle")
        .data(nodeData, (d) => d.__id)
        .join("circle")
        .attr("r", nodeRadius)
        .attr("fill", (d) => nodeColor(d.__feature))
        .style("cursor", onNodeClick ? "pointer" : null);

    if (onNodeClick) {

      nodeSel.on("click", (event, d) => {

        // Zooming/panning is implemented by dragging the background,
        // same gesture surface as a node -- stopPropagation keeps a
        // node click from also starting a pan.
        event.stopPropagation();
        onNodeClick(d.__id, d.__feature);

      });

    }

    svg.call(
      d3.zoom()
        .scaleExtent([0.2, 8])
        .on("zoom", (event) => zoomLayer.attr("transform", event.transform))
    );

    const simulation =
      d3.forceSimulation(nodeData)
        .force("link", d3.forceLink(linkData).id((d) => d.__id).distance(40))
        .force("charge", d3.forceManyBody().strength(-120))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(nodeRadius * 1.5))
        .on("tick", () => {

          linkSel
            .attr("x1", (d) => d.source.x)
            .attr("y1", (d) => d.source.y)
            .attr("x2", (d) => d.target.x)
            .attr("y2", (d) => d.target.y);

          nodeSel
            .attr("cx", (d) => d.x)
            .attr("cy", (d) => d.y);

        });

    let selectedId =
      null;

    function setSelected(id) {

      selectedId =
        id === null || id === undefined ? null : String(id);

      nodeSel
        .attr("fill", (d) =>
          d.__id === selectedId ? selectedColor : nodeColor(d.__feature)
        )
        .attr("r", (d) =>
          d.__id === selectedId ? nodeRadius * 1.4 : nodeRadius
        );

    }

    function destroy() {

      simulation.stop();

      el.replaceChildren();

    }

    return { setSelected, destroy, simulation };

  }


  // ============================================================
  // Public WebGeoDS API
  // ============================================================

  window.WebGeoDS.renderForceGraph =
    renderForceGraph;


})();

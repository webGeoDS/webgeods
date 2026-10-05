// Network from Lines tool (blog/tools/network-from-lines.qmd): the
// interactive layer around the page's hidden Python cells, which build a
// graph from a line layer (nodes at the snapped endpoints, one edge per
// line). A ToolDashboard config; the cells, prose and URL are unchanged.
//
// Selection: a node ({ node }) from the map or the diagram, or a whole
// component ({ component }) from its bar. A node lights up on map and
// diagram and its component's bar lights up in the chart.
import { ToolDashboard } from "../components/ToolDashboard.js";

const paletteColor = (i) => window.WebGeoDS.DEFAULT_PALETTE[i % window.WebGeoDS.DEFAULT_PALETTE.length];
const componentColor = (feature) => paletteColor(feature.properties.component ?? 0);

const CONFIG = {
  tool: "network-from-lines",
  // A closed block (4 edges, one connected piece), a separate cluster
  // elsewhere on the map, and a "spur" whose first endpoint sits about
  // 4 m from the block's corner, not exactly on it. At snap tolerance 0
  // that gap makes 3 components; past ~4 m the spur joins the block,
  // leaving 2. That gap is the lesson: a network is only as connected
  // as its noding.
  example: "/examples/network-lines.geojson",
  cells: {
    inspect: "network-inspect-py",
    compute: "network-build-py"
  },
  exampleStatus: "✓ example data loaded — try Build Graph, then raise the snap tolerance.",
  inputs: [
    { kind: "slider", name: "snapTolerance", label: "Snap tolerance (m)", min: 0, max: 20, step: 1, value: 0 }
  ],
  computeLabel: "▶ Build graph",
  busyLabel: "⌛ Building...",
  map: { center: [12.46, 41.906], zoom: 14 },
  fit: { inspect: (v) => v.features, result: (v) => v.edges },

  selectable: { id: "network-nodes-py", from: ({ result }) => result?.nodes ?? null, layer: "network-selection" },

  layers: ({ inspect, result }) => [
    { id: "network-input-py", label: "Input lines", type: "line", data: inspect?.features ?? null },
    ...(result ? [
      {
        id: "network-edges-py", label: "Edges", type: "line", data: result.edges,
        paint: window.WebGeoDS.matchPaint(result.componentIds, "component", { line: true, lineWidth: 3 })
      },
      {
        id: "network-nodes-py", label: "Nodes", type: "circle", data: result.nodes,
        paint: window.WebGeoDS.matchPaint(result.componentIds, "component", { radius: 5 }),
        selectBy: (feature) => ({ node: Number(feature.properties.node) })
      }
    ] : [])
  ],

  side: {
    id: "nfl-diagram",
    panels: [
      // The topology takes the free height, the chart sits under it.
      {
        kind: "diagram", idField: "node", color: componentColor,
        nodes: ({ result }) => result?.nodes, links: ({ result }) => result?.edges
      },
      {
        kind: "chart", height: 160,
        spec: ({ result }) => (result ? componentChartSpec(result.componentSizes) : null),
        selectParams: ["componentSelect"], externalParam: "componentExternal", keyField: "component",
        toKey: (selection, nodes) => (nodes.length ? String(nodes[0].properties.component) : null),
        fromKey: (key) => ({ component: Number(key) })
      }
    ]
  },

  stats: {
    empty: [["—", "Upload a file or load the example above"]],
    inspect: inspectStats,
    result: (result) => graphStats(result.summary)
  },
  legend: ({ result }) => result?.componentIds.map((id, i) => ({ color: paletteColor(i), label: `Component ${id + 1}` })),

  download: {
    // Nodes and edges in one file, tagged so they're one filter apart
    // in QGIS or similar.
    getFeatures: (result) => ({
      type: "FeatureCollection",
      features: [
        ...result.nodes.features.map((f) => ({ ...f, properties: { ...f.properties, kind: "node" } })),
        ...result.edges.features.map((f) => ({ ...f, properties: { ...f.properties, kind: "edge" } }))
      ]
    }),
    filenameSuffix: "-graph.geojson",
    defaultFilename: "network-graph.geojson"
  }
};

export const NetworkFromLinesTool = () => <ToolDashboard config={CONFIG} />;

function inspectStats(value) {
  const s = value.summary;
  const rows = [["Lines", s ? s.count.toLocaleString() : "—"]];
  if (s && s.dropped > 0) rows.push(["Non-line features skipped", s.dropped]);
  if (value.crsWarning) rows.push(["CRS", value.crsWarning]);
  return rows;
}

function graphStats(s) {
  return [
    ["Nodes", s.nodes.toLocaleString()],
    ["Edges", s.edges.toLocaleString()],
    ["Connected components", s.components],
    ["Largest component (nodes)", s.largestComponentNodes],
    ["Dead ends (degree 1)", s.deadEnds],
    ["Intersections (degree ≥ 3)", s.intersections],
    ["Mean degree", s.meanDegree],
    ["Total length", `${s.totalLengthKm} km`],
    ["Snap tolerance", `${s.snapTolerance} m`],
    ["Calculation CRS", s.calculationCrs]
  ];
}

// "Nodes per component", one bar per component in size order, clickable.
// Component values stay strings ("0", "1"...) in the chart: the field is
// nominal; the axis labels convert to a number before adding 1
// ("0" + 1 would read "#01").
function componentChartSpec(componentSizes) {
  const rows = componentSizes.map((size, rank) => ({ component: String(rank), size }));
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: "Nodes per component",
    width: "container",
    height: "container",
    autosize: { type: "fit", contains: "padding" },
    data: { values: rows },
    params: [
      { name: "componentSelect", select: { type: "point", fields: ["component"] } },
      { name: "componentExternal", value: null }
    ],
    mark: "bar",
    encoding: {
      x: { field: "component", type: "nominal", title: "Component", sort: null,
        axis: { labelExpr: "'#' + (toNumber(datum.value) + 1)" } },
      y: { field: "size", type: "quantitative", title: "Nodes" },
      color: {
        condition: { test: "datum.component === componentExternal", value: "#ffeb3b" },
        field: "component", type: "nominal", legend: null,
        scale: { domain: rows.map((r) => r.component), range: rows.map((_, i) => paletteColor(i)) }
      }
    }
  };
}

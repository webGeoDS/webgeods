// Network from Lines tool (blog/tools/network-from-lines.qmd): the
// interactive layer around the page's hidden Python cells, which build a
// graph from a line layer (nodes at the snapped endpoints, one edge per
// line). A ToolDashboard config; the cells, prose and URL are unchanged.
//
// Selection: a node ({ node }) from the map or the diagram, or a whole
// component ({ component }) from its bar. A node lights up on map and
// diagram and its component's bar lights up in the chart.
import { ToolDashboard } from "../components/ToolDashboard.js";

/** @type {import("../components/ToolDashboard.js").ToolConfig} */
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

  // Components are numbered by size, largest first (0, 1, 2...).
  categories: {
    field: "component",
    values: ({ result }) => result?.componentIds,
    label: (id) => `Component ${id + 1}`
  },

  layers: ({ inspect, result }, { categories }) => [
    { id: "network-input-py", label: "Input lines", type: "line", data: inspect?.features ?? null },
    ...(result ? [
      {
        id: "network-edges-py", label: "Edges", type: "line", data: result.edges,
        paint: categories.paint("component", { line: true, lineWidth: 3 })
      },
      {
        id: "network-nodes-py", label: "Nodes", type: "circle", data: result.nodes,
        paint: categories.paint("component", { radius: 5 }),
        selectBy: (feature) => ({ node: Number(feature.properties.node) })
      }
    ] : [])
  ],

  side: {
    id: "nfl-diagram",
    panels: [
      // The topology takes the free height, the chart sits under it.
      {
        kind: "diagram", idField: "node", color: "categories",
        nodes: ({ result }) => result?.nodes, links: ({ result }) => result?.edges
      },
      {
        kind: "bars", title: "Nodes per component", height: 160,
        counts: ({ result }) => result?.componentSizes,
        tick: (id) => `#${id + 1}`,
        axis: { x: "Component", y: "Nodes" }
      }
    ]
  },

  stats: {
    empty: [["—", "Upload a file or load the example above"]],
    inspect: [
      ["Lines", "summary.count"],
      (v) => (v.summary?.dropped > 0 ? ["Non-line features skipped", v.summary.dropped] : null),
      (v) => (v.crsWarning ? ["CRS", v.crsWarning] : null)
    ],
    result: [
      ["Nodes", "summary.nodes"],
      ["Edges", "summary.edges"],
      ["Connected components", "summary.components"],
      ["Largest component (nodes)", "summary.largestComponentNodes"],
      ["Dead ends (degree 1)", "summary.deadEnds"],
      ["Intersections (degree ≥ 3)", "summary.intersections"],
      ["Mean degree", "summary.meanDegree"],
      ["Total length", "summary.totalLengthKm", "km"],
      ["Snap tolerance", "summary.snapTolerance", "m"],
      ["Calculation CRS", "summary.calculationCrs"]
    ]
  },

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

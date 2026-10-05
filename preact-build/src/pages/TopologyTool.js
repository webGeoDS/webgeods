// Topology Checker (blog/tools/topology-checker.qmd): the interactive
// layer around the page's hidden Python cells, which look for overlaps,
// slivers and gaps between the uploaded features. A ToolDashboard config:
// the check runs by itself after every load, and again on ▶ Check with
// new thresholds.
import { ToolDashboard } from "../components/ToolDashboard.js";
import { ERROR, OK, GAP, GAP_PAINT, featuresStyle, errorRowClass } from "./topologyStyle.js";

/** @type {import("../components/ToolDashboard.js").ToolConfig} */
const CONFIG = {
  tool: "topology-checker",
  // Two squares that overlap.
  example: "/examples/topology-overlap.geojson",
  cells: { compute: "topology-diagnose-py", exportShp: "topology-export-shp-py" },
  autoCompute: true,
  exampleStatus: "✓ example data loaded and checked — adjust the thresholds and Check again to compare.",
  inputs: [
    { kind: "slider", name: "sliverThreshold", label: "Sliver threshold", min: 0.01, max: 0.9, step: 0.01, value: 0.15 },
    { kind: "slider", name: "gapProximity", label: "Gap search distance", min: 0.01, max: 0.5, step: 0.01, value: 0.06 }
  ],
  computeLabel: "▶ Check",
  busyLabel: "⌛ Checking...",
  map: { center: [12.5, 41.9], zoom: 4, height: "480px" },
  fit: { result: (r) => r.features },

  layers: ({ result }) => [
    { id: "topology-py", label: "Features", data: result?.features ?? null, ...featuresStyle(result?.features), selectBy: "feature" },
    // Off until switched on, as it was hidden until its own tab was open.
    { id: "topology-gaps-py", label: "Gaps", type: "fill", data: result?.gaps ?? null,
      paint: GAP_PAINT, startHidden: true }
  ],

  // A feature's table row, or the feature on the map, selects it in both.
  selectable: { id: "topology-py", from: ({ result }) => result?.features ?? null, layer: "topology-selection", fit: true },

  tables: [
    { label: "Original geometries", id: "topology-py", from: ({ result }) => result?.features,
      rowClassName: errorRowClass, emptyMessage: "No results yet" },
    { label: "Gaps", id: "topology-gaps-py", from: ({ result }) => result?.gaps, emptyMessage: "No gaps found" }
  ],

  stats: {
    empty: [["Features", "0"], ["—", "Upload a polygon/line file or load the example above"]],
    result: (r) => {
      const features = r.features?.features ?? [];
      return [
        ["Features", features.length.toLocaleString()],
        ["With an error", features.filter((f) => f.properties?.has_error === true).length.toLocaleString()],
        ["Gaps", (r.gaps?.features?.length ?? 0).toLocaleString()],
        ...(r.crsWarning ? [["CRS", `⚠️ ${r.crsWarning}`]] : [])
      ];
    }
  },
  legend: ({ result }) => (result
    ? [{ color: ERROR, label: "With an error" }, { color: OK, label: "No error" }, { color: GAP, label: "Gap" }]
    : null),

  download: {
    getFeatures: (result) => result.originalCrsFeatures,
    filenameSuffix: "-topology-report.geojson",
    defaultFilename: "topology-report.geojson",
    shapefile: { filenameSuffix: "-topology-report.zip", defaultFilename: "topology-report-shapefile.zip" }
  }
};

export const TopologyTool = () => <ToolDashboard config={CONFIG} />;

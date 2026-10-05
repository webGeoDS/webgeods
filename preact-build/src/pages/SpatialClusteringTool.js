// Spatial Clustering Explorer (blog/tools/spatial-clustering-explorer.qmd):
// the interactive layer around the page's hidden Python cells, which run
// DBSCAN on the uploaded points. A ToolDashboard config; the cells, prose
// and URL are unchanged.
import { ToolDashboard } from "../components/ToolDashboard.js";

const SOURCE = "spatial-clustering-py";

// WebGeoDS.Map's default circle style: uploaded, not yet clustered.
const UPLOADED_POINT_PAINT = {
  "circle-radius": 6,
  "circle-color": "#b0522c",
  "circle-stroke-width": 1,
  "circle-stroke-color": "#f3ede1"
};

/** @type {import("../components/ToolDashboard.js").ToolConfig} */
const CONFIG = {
  tool: "spatial-clustering-explorer",
  // Three tight groups (~40-90 m across) a couple of kilometers apart
  // near Rome, plus six scattered points out of any group's reach: the
  // default ε/min points recover 3 clusters + 6 noise points.
  example: "/examples/clustering-points.geojson",
  cells: {
    inspect: "spatial-clustering-inspect-py",
    compute: "spatial-clustering-compute-py",
    exportShp: "spatial-clustering-export-shp-py"
  },
  exampleStatus: "✓ example data loaded — set ε/min points and Compute below.",
  inputs: [
    { kind: "number", name: "epsMeters", label: "ε (eps, meters):", step: 10, width: "70px", value: 100 },
    { kind: "number", name: "minPts", label: "min points:", step: 1, width: "50px", value: 5 }
  ],
  busyLabel: "⌛ Clustering...",
  fit: { inspect: (v) => v.features },

  // Noise (cluster -1) isn't a category: it falls back to the muted
  // neutral, never a cluster hue.
  categories: { field: "cluster", values: ({ result }) => result?.summary.clusterIds, label: (id) => `Cluster ${id}` },
  legendExtra: ({ result }) => (result.summary.noiseCount > 0 ? [{ color: "#766851", label: "Noise" }] : []),

  // One layer: the uploaded points, then the same points by cluster.
  layers: ({ inspect, result }, { categories }) => [{
    id: SOURCE, label: "Points", type: "circle",
    data: result?.features ?? inspect?.features ?? null,
    paint: result ? categories.paint("cluster") : UPLOADED_POINT_PAINT,
    selectBy: "feature"
  }],

  // A point's table row, or the point on the map, selects it in both.
  selectable: { id: SOURCE, from: ({ inspect, result }) => result?.features ?? inspect?.features ?? null, layer: "spatial-clustering-selection", fit: true },

  tables: [{ label: "Points", id: SOURCE, from: ({ inspect, result }) => result?.features ?? inspect?.features, emptyMessage: "No results yet" }],

  stats: {
    empty: [["Points", "—"], ["—", "Upload a point GeoJSON/Shapefile or load the example above"]],
    inspect: (v) => inspectRows(v.summary),
    result: (r, { inspect, resultInputs }) => {
      const s = r.summary;
      return [
        ...inspectRows(inspect.summary),
        ["Calculation CRS", s.calculationCrs],
        ...(s.excludedCount > 0 ? [["Excluded from clustering", `${s.excludedCount} (too far from the calculation UTM zone to project)`]] : []),
        ["ε (eps)", `${resultInputs.epsMeters} m`],
        ["Min points", resultInputs.minPts],
        ["Clusters found", s.clusterCount],
        ["Noise points", s.noiseCount]
      ];
    }
  },

  download: {
    getFeatures: (result) => result.originalCrsFeatures,
    filenameSuffix: "-clustered.geojson",
    defaultFilename: "clustered.geojson",
    shapefile: { filenameSuffix: "-clustered.zip", defaultFilename: "clustered-shapefile.zip" }
  }
};

function inspectRows(s) {
  return [
    ["Points", s.count.toLocaleString()],
    ["Original CRS", s.crs === "None" || !s.crs ? "Unknown" : s.crs]
  ];
}

export const SpatialClusteringTool = () => <ToolDashboard config={CONFIG} />;

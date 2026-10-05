// Buffer & Proximity tool (blog/tools/buffer-proximity.qmd): the
// interactive layer around the page's hidden Python cells, which buffer
// every uploaded feature at a distance, optionally split into
// concentric rings and dissolved. A ToolDashboard config; the cells,
// prose and URL are unchanged.
import { ToolDashboard } from "../components/ToolDashboard.js";

const BUFFER_GREEN = [66, 88, 60];

// Rings fade from 0.6 (closest) to 0.15 (farthest): ordered distance
// bands, so opacity rather than hue. One ring is the single 0.35 zone.
const ringOpacity = (ring, ringCount) =>
  ringCount === 1 ? 0.35 : Number((0.6 - (ring - 1) * (0.45 / (ringCount - 1))).toFixed(2));

function ringPaint(ringCount) {
  const opacity = ["match", ["get", "ring"]];
  for (let ring = 1; ring <= ringCount; ring++) opacity.push(ring, ringOpacity(ring, ringCount));
  opacity.push(0.35);
  return { "fill-color": "#42583c", "fill-opacity": opacity, "fill-outline-color": "#2a2117" };
}

/** @type {import("../components/ToolDashboard.js").ToolConfig} */
const CONFIG = {
  tool: "buffer-proximity",
  // Five store locations near Rome.
  example: "/examples/buffer-stores.geojson",
  cells: {
    inspect: "buffer-inspect-py",
    compute: "buffer-compute-py",
    exportShp: "buffer-export-shp-py"
  },
  exampleStatus: "✓ example data loaded — set a distance and Compute below.",
  inputs: [
    { kind: "slider", name: "bufferDistance", label: "Buffer distance (m)", min: 10, max: 2000, step: 10, value: 100 },
    { kind: "slider", name: "ringCount", label: "Rings", min: 1, max: 5, step: 1, value: 1 },
    { kind: "checkbox", name: "dissolveBuffers", label: "Dissolve overlapping buffers", value: false }
  ],
  busyLabel: "⌛ Computing...",
  fit: { inspect: (v) => v.features, result: (v) => v.features },

  layers: ({ inspect, result }) => [
    // The uploaded features in the map's default style, the buffer on top.
    { id: "buffer-original-py", label: "Features", data: inspect?.features ?? null },
    { id: "buffer-result-py", label: "Buffer", type: "fill", data: result?.features ?? null,
      paint: result ? ringPaint(result.summary.ringCount) : undefined, selectBy: "feature" }
  ],

  // A buffer row in the table, or a buffer on the map, selects it in both.
  selectable: { id: "buffer-result-py", from: ({ result }) => result?.features ?? null, layer: "buffer-selection", fit: true },

  tables: [{ label: "Buffers", id: "buffer-result-py", from: ({ result }) => result?.features, emptyMessage: "No results yet" }],

  stats: {
    empty: [["Features", "—"], ["—", "Upload a point/line/polygon file or load the example above"]],
    inspect: (v) => inspectRows(v.summary),
    result: (r, { inspect }) => {
      const s = r.summary;
      return [
        ...inspectRows(inspect.summary),
        ["Calculation CRS", s.calculationCrs],
        ...(s.excludedCount > 0 ? [["Excluded from buffering", `${s.excludedCount} (too far from the calculation UTM zone to project)`]] : []),
        ["Buffer distance", `${s.bufferDistance} m`],
        ["Rings", s.ringCount === 1 ? "1 (no ring split)" : `${s.ringCount} (at ${s.ringDistances.join(", ")} m)`],
        ["Dissolved", s.dissolved ? "Yes" : "No"],
        ["Buffer features", s.bufferCount]
      ];
    }
  },

  legend: ({ result }) => {
    if (!result) return null;
    const s = result.summary;
    const swatch = (opacity) => `rgba(${BUFFER_GREEN.join(",")},${opacity})`;
    const items = s.ringCount === 1
      ? [{ color: swatch(0.6), label: `Buffer (${s.bufferDistance} m)` }]
      : s.ringDistances.map((distance, i) => ({
        color: swatch((0.6 - i * (0.45 / (s.ringCount - 1))).toFixed(2)),
        label: `${i === 0 ? 0 : s.ringDistances[i - 1]}–${distance} m`
      }));
    return { items, options: { swatchWidth: 32 } };
  },

  download: {
    getFeatures: (result) => result.originalCrsFeatures,
    filenameSuffix: "-buffered.geojson",
    defaultFilename: "buffered.geojson",
    shapefile: { filenameSuffix: "-buffered.zip", defaultFilename: "buffered-shapefile.zip" }
  }
};

function inspectRows(s) {
  return [
    ["Features", s.count.toLocaleString()],
    ["Geometry", s.geometryTypes.join(", ")],
    ["Original CRS", s.crs === "None" || !s.crs ? "Unknown" : s.crs]
  ];
}

export const BufferProximityTool = () => <ToolDashboard config={CONFIG} />;

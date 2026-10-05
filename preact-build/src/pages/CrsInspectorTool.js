// CRS Inspector & Converter (blog/tools/crs-inspector.qmd): the
// interactive layer around the page's hidden Python cells, which read a
// file's declared CRS, check it against its own coordinates, and
// reproject it on request. A ToolDashboard config with no compute step:
// inspecting is the check, converting is a download.
import { ToolDashboard } from "../components/ToolDashboard.js";
import { base64ToBytes } from "../hooks/useToolData.js";

/** @type {import("../components/ToolDashboard.js").ToolConfig} */
const CONFIG = {
  tool: "crs-inspector",
  // One polygon in Web Mercator-sized meters, declared as WGS84: the
  // mismatch this tool exists to catch, landing far off the start view.
  example: "/examples/crs-mismatched.geojson",
  cells: { inspect: "crs-inspect-py" },
  exampleStatus: "✓ example data loaded — pick a target CRS to convert and download.",
  map: { center: [12.5, 41.9], zoom: 4, height: "480px" },
  fit: { inspect: (v) => v.mapFeatures },

  inputs: [
    { kind: "text", name: "targetCrs", label: "Convert to CRS:", placeholder: "EPSG code, e.g. 4326", size: 10, value: "4326" }
  ],

  layers: ({ inspect }) => [{ id: "crs-py", data: inspect?.mapFeatures ?? null }],

  stats: {
    empty: [["Features", "0"], ["—", "Upload a file or load the example above"]],
    inspect: ({ summary: s }) => (s.total === 0
      ? [["Features", "0"], ["—", "Upload a file or load the example above"]]
      : [
        ["Features", s.total.toLocaleString()],
        ["CRS", s.crsWarning ? `${s.crs} ⚠️ ${s.crsWarning}` : (s.crs ?? "Unknown")],
        ["Type", s.isGeographic ? "Geographic (degrees)" : "Projected (usually meters)"],
        ["Bounds", s.bounds ? s.bounds.join(", ") : "—"],
        s.mismatchWarning ? ["⚠️ Mismatch", s.mismatchWarning] : ["Mismatch check", "✓ CRS and coordinates agree"]
      ])
  },

  // The file comes back the way it went in: a shapefile upload as a
  // zipped shapefile (base64), anything else as GeoJSON.
  download: {
    cell: "crs-convert-py",
    label: "⇄ Convert & Download",
    withInputs: true,
    enabled: ({ inspect }) => inspect?.summary?.total > 0,
    inputs: (data, inputs, { uploadKind }) => ({
      uploadKindPy: uploadKind === "zip" || uploadKind === "shapefile" ? "shapefile" : "geojson"
    }),
    file: (value, base, inputs) => {
      const epsg = String(inputs.targetCrs).replace(/[^0-9]/g, "") || "converted";
      const name = `${base ?? "converted"}-epsg${epsg}`;
      return value.kind === "shapefile"
        ? { content: base64ToBytes(value.data), filename: `${name}.zip`, mimeType: "application/zip" }
        : { content: JSON.stringify(value.data, null, 2), filename: `${name}.geojson`, mimeType: "application/geo+json" };
    }
  }
};

export const CrsInspectorTool = () => <ToolDashboard config={CONFIG} />;

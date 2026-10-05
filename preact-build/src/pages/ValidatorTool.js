// GeoJSON & Shapefile Validator (blog/tools/geojson-shapefile-validator.qmd):
// the interactive layer around the page's hidden Python cells. The check
// runs by itself on every upload (the inspect cell); 🔧 Fix repairs the
// invalid geometries (the compute cell). A ToolDashboard config.
import { ToolDashboard } from "../components/ToolDashboard.js";

const VALID = "#2ea44f";
const INVALID = "#e05252";
const byValidity = ["case", ["==", ["get", "valid"], false], INVALID, VALID];

/** @type {import("../components/ToolDashboard.js").ToolConfig} */
const CONFIG = {
  tool: "geojson-shapefile-validator",
  // A self-intersecting "bowtie" polygon.
  example: "/examples/validator-bowtie.geojson",
  cells: {
    inspect: "geometry-diagnose-py",
    compute: "geometry-repair-py",
    exportShp: "geometry-export-shp-py"
  },
  exampleStatus: "✓ example bowtie loaded and checked — click Fix to repair it.",
  computeLabel: "🔧 Fix",
  busyLabel: "⌛ Fixing...",
  map: { center: [12.5, 41.9], zoom: 4, height: "480px" },
  fit: { inspect: (v) => v.features },

  // The checked features, then the repaired ones once Fix has run. A
  // self-intersecting polygon fills to zero area: the outline shows it.
  layers: ({ inspect, result }) => {
    const features = result?.features ?? inspect?.features ?? null;
    return [
      { id: "geometry-py", label: "Features", type: "fill", data: features,
        paint: { "fill-color": byValidity, "fill-opacity": 0.55 } },
      { id: "geometry-py-outline", type: "line", data: features && window.WebGeoDS.toOutlineFeatures(features),
        paint: { "line-color": byValidity, "line-width": 2.5 } }
    ];
  },

  tables: [{ label: "Features", id: "geometry-py", from: ({ inspect, result }) => result?.features ?? inspect?.features,
    iconColumns: ["valid"], emptyMessage: "No results yet" }],

  stats: {
    empty: [["Features", "0"], ["—", "Upload a GeoJSON/Shapefile or load the example above"]],
    inspect: (v) => validityRows(v.features, v.crsWarning),
    result: (r, { inspect }) => validityRows(r.features, inspect.crsWarning)
  },
  legend: ({ inspect }) => (inspect ? [{ color: VALID, label: "Valid" }, { color: INVALID, label: "Invalid" }] : null),

  // What was checked (or repaired), back in the CRS it was uploaded in.
  download: {
    after: "inspect",
    getFeatures: (value) => value.originalCrsFeatures,
    filenameSuffix: "-validated.geojson",
    defaultFilename: "validated-geojson.geojson",
    shapefile: { filenameSuffix: "-validated.zip", defaultFilename: "validated-shapefile.zip" }
  }
};

function validityRows(collection, crsWarning) {
  const features = collection?.features ?? [];
  const invalid = features.filter((f) => f.properties?.valid === false).length;
  return [
    ["Features", features.length.toLocaleString()],
    ["Valid", (features.length - invalid).toLocaleString()],
    ["Invalid", invalid.toLocaleString()],
    ...(crsWarning ? [["CRS", `⚠️ ${crsWarning}`]] : [])
  ];
}

export const ValidatorTool = () => <ToolDashboard config={CONFIG} />;

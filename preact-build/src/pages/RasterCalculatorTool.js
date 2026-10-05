// Raster Calculator (blog/tools/raster-calculator.qmd): the interactive
// layer around the page's hidden Python cells, which combine two bands of
// an uploaded GeoTIFF (band math) and export the result as a GeoTIFF. A
// ToolDashboard config.
import { ToolDashboard } from "../components/ToolDashboard.js";
import { base64ToFloat32 } from "../hooks/useToolData.js";

const OPERATORS = {
  add: { label: "A + B", describe: (a, b) => `Band ${a} + Band ${b}` },
  subtract: { label: "A − B", describe: (a, b) => `Band ${a} − Band ${b}` },
  multiply: { label: "A × B", describe: (a, b) => `Band ${a} × Band ${b}` },
  divide: { label: "A ÷ B", describe: (a, b) => `Band ${a} ÷ Band ${b}` },
  normalized_difference: { label: "Normalized Difference (A−B)/(A+B)", describe: (a, b) => `Normalized Difference: (Band ${a} − Band ${b}) / (Band ${a} + Band ${b})` }
};
const EMPTY_STATS = [["Dimensions", "—"], ["—", "Upload a .tif/.tiff file or load the example above"]];

const bandCount = (inspect) => inspect?.summary?.bandCount ?? 0;
const enoughBands = (inputs, { inspect }) => bandCount(inspect) >= 2;
const bandSelect = (name, label) => ({
  kind: "select", name, label, number: true, value: 1, visible: enoughBands,
  options: ({ inspect }) => Array.from({ length: bandCount(inspect) }, (_, i) => ({ value: i + 1, label: `Band ${i + 1}` }))
});

/** @type {import("../components/ToolDashboard.js").ToolConfig} */
const CONFIG = {
  tool: "raster-calculator",
  example: "/examples/raster-calculator-bands.tif",
  uploadKind: "raster",
  cells: { inspect: "raster-calc-inspect-py", compute: "raster-calc-py" },
  exampleStatus: "✓ example data loaded — pick two bands and Compute below.",
  inputs: [
    { kind: "note", text: ({ inspect }) => {
      if (!inspect?.summary) return "Upload a file or load the example to pick bands.";
      const n = bandCount(inspect);
      return n < 2 ? `This file has only ${n} band — Band Math needs at least 2.` : null;
    } },
    bandSelect("bandA", "A:"),
    bandSelect("bandB", "B:"),
    { kind: "select", name: "operator", label: "", value: "add", visible: enoughBands,
      options: Object.entries(OPERATORS).map(([value, o]) => ({ value, label: o.label })) }
  ],
  inputsFromInspect: (value, inputs) => ({ ...inputs, bandA: 1, bandB: Math.min(2, value?.summary?.bandCount ?? 1) }),
  busyLabel: "⌛ Computing...",
  fit: { inspect: (v) => v.footprint },

  layers: ({ inspect, result }) => [
    { id: "raster-calc-footprint", label: "Footprint", type: "fill", data: inspect?.summary ? inspect.footprint : null,
      paint: { "fill-color": "#42583c", "fill-opacity": 0.35, "fill-outline-color": "#2a2117" } },
    { id: "raster-calc-result", label: "Result", type: "raster",
      raster: result && { bounds: result.bounds, width: result.width, height: result.height,
        values: base64ToFloat32(result.data), min: result.min ?? 0, max: result.max ?? 1 } }
  ],

  stats: {
    empty: EMPTY_STATS,
    inspect: (v) => (v.summary ? inspectRows(v.summary) : EMPTY_STATS),
    result: (r, { inspect, resultInputs: i }) => [
      ...inspectRows(inspect.summary),
      ["Operation", OPERATORS[i.operator].describe(i.bandA, i.bandB)],
      ["Output range", r.min !== null ? `${r.min} to ${r.max} (mean ${r.mean})` : "all NoData"],
      ["NoData pixels", `${r.nodataCount.toLocaleString()} / ${r.totalPixels.toLocaleString()}`]
    ]
  },
  legend: ({ result }) => (result && result.min !== null
    ? { gradient: window.WebGeoDS.Map.DEFAULT_RASTER_RAMP, minLabel: String(result.min), maxLabel: String(result.max) }
    : null),

  // The computed band as a GeoTIFF, from the inputs it was computed with.
  download: {
    cell: "raster-calc-export-py",
    label: "⬇ Download result",
    inputs: ({ resultInputs: i }) => ({ bandA: i.bandA, bandB: i.bandB, operator: i.operator }),
    filename: (base, inputs) => (base ? `${base}-${inputs.operator}.tif` : `band-math-${inputs.operator}.tif`),
    mimeType: "image/tiff"
  }
};

function inspectRows(s) {
  return [
    ["Dimensions", `${s.width} × ${s.height} px`],
    ["Bands", String(s.bandCount)],
    ["CRS", s.crs == null ? `Unknown ⚠️ ${s.crsWarning}` : s.crs],
    ...(s.displayCrsAssumption ? [["Display assumption", `${s.displayCrsAssumption} — map only, not a fact about the file`]] : []),
    ["Bounds", s.bounds.join(", ")]
  ];
}

export const RasterCalculatorTool = () => <ToolDashboard config={CONFIG} />;

// NDVI Calculator (blog/tools/ndvi-calculator.qmd): the interactive
// layer around the page's hidden Python cells, which compute NDVI from a
// Red and a NIR band of an uploaded GeoTIFF and export it as a GeoTIFF.
// A ToolDashboard config.
import { ToolDashboard } from "../components/ToolDashboard.js";
import { base64ToFloat32 } from "../hooks/useToolData.js";

// Brown (bare soil, water) to deep green (dense vegetation), on a fixed
// -1..1 scale so two files' maps compare directly.
const NDVI_RAMP = [[0.00, 140, 90, 45], [0.30, 210, 190, 130], [0.50, 230, 220, 140], [0.75, 130, 190, 80], [1.00, 20, 90, 30]];

// Commonly documented band numbers: a starting guess, not something the
// file itself declares. Only the ones this file has enough bands for.
const PRESETS = {
  landsat: { red: 4, nir: 5, label: "Landsat 8/9 (Red=B4, NIR=B5)" },
  sentinel2: { red: 4, nir: 8, label: "Sentinel-2 (Red=B4, NIR=B8)" }
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
  tool: "ndvi-calculator",
  example: "/examples/ndvi-red-nir.tif",
  uploadKind: "raster",
  cells: { inspect: "ndvi-inspect-py", compute: "ndvi-py" },
  exampleStatus: "✓ example data loaded — pick Red/NIR and Compute below.",
  inputs: [
    { kind: "note", text: ({ inspect }) => {
      if (!inspect?.summary) return "Upload a file or load the example to pick bands.";
      const n = bandCount(inspect);
      return n < 2 ? `This file has only ${n} band — NDVI needs at least 2 (a Red and a NIR band).` : null;
    } },
    { kind: "select", name: "preset", label: "Common sensor (starting guess):", value: "custom", visible: enoughBands,
      options: ({ inspect }) => [
        { value: "custom", label: "Custom / manual" },
        ...Object.entries(PRESETS).filter(([, p]) => Math.max(p.red, p.nir) <= bandCount(inspect)).map(([value, p]) => ({ value, label: p.label }))
      ],
      onPick: (value, inputs) => (PRESETS[value] ? { ...inputs, redBand: PRESETS[value].red, nirBand: PRESETS[value].nir } : inputs) },
    bandSelect("redBand", "Red:"),
    bandSelect("nirBand", "NIR:")
  ],
  inputsFromInspect: (value, inputs) => ({ ...inputs, preset: "custom", redBand: 1, nirBand: Math.min(2, value?.summary?.bandCount ?? 1) }),
  busyLabel: "⌛ Computing...",
  fit: { inspect: (v) => v.footprint },

  layers: ({ inspect, result }) => [
    { id: "ndvi-footprint", label: "Footprint", type: "fill", data: inspect?.summary ? inspect.footprint : null,
      paint: { "fill-color": "#42583c", "fill-opacity": 0.35, "fill-outline-color": "#2a2117" } },
    { id: "ndvi-result", label: "NDVI", type: "raster",
      raster: result && { bounds: result.bounds, width: result.width, height: result.height,
        values: base64ToFloat32(result.data), min: -1, max: 1, colorRamp: NDVI_RAMP } }
  ],

  stats: {
    empty: EMPTY_STATS,
    inspect: (v) => (v.summary ? inspectRows(v.summary) : EMPTY_STATS),
    result: (r, { inspect, resultInputs: i }) => [
      ...inspectRows(inspect.summary),
      ["Formula", `(Band ${i.nirBand} − Band ${i.redBand}) / (Band ${i.nirBand} + Band ${i.redBand})`],
      ["NDVI range (this file)", r.min !== null ? `${r.min} to ${r.max} (mean ${r.mean})` : "all NoData"],
      ["NoData pixels", `${r.nodataCount.toLocaleString()} / ${r.totalPixels.toLocaleString()}`]
    ]
  },
  legend: ({ result }) => (result ? { gradient: NDVI_RAMP, minLabel: "−1 (bare soil / water)", maxLabel: "1 (dense vegetation)" } : null),

  // The NDVI band as a GeoTIFF, from the bands it was computed with.
  download: {
    cell: "ndvi-export-py",
    label: "⬇ Download NDVI",
    inputs: ({ resultInputs: i }) => ({ nirBand: i.nirBand, redBand: i.redBand }),
    filename: (base) => (base ? `${base}-ndvi.tif` : "ndvi.tif"),
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

export const NdviCalculatorTool = () => <ToolDashboard config={CONFIG} />;

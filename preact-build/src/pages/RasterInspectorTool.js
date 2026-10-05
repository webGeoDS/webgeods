// Raster Inspector & Statistics (blog/tools/raster-inspector.qmd): the
// interactive layer around the page's hidden Python cells, which
// summarize an uploaded GeoTIFF and render a preview of one band (or an
// RGB composite of three). A ToolDashboard config: a file with two or
// more bands is previewed as RGB right after loading.
import { ToolDashboard } from "../components/ToolDashboard.js";
import { base64ToFloat32 } from "../hooks/useToolData.js";

const RAMPS = {
  Viridis: [[0.00, 68, 1, 84], [0.25, 59, 82, 139], [0.50, 33, 144, 140], [0.75, 94, 201, 98], [1.00, 253, 231, 37]],
  Grayscale: [[0.00, 20, 20, 20], [1.00, 240, 240, 240]],
  Spectral: [[0.00, 50, 90, 180], [0.25, 120, 180, 220], [0.50, 240, 240, 220], [0.75, 240, 160, 80], [1.00, 180, 40, 40]]
};
const RGB = "RGB composite";
const HISTOGRAM_PLACEHOLDER = "Pick a band and a color ramp, then Preview, to see its value histogram here.";
const EMPTY_STATS = [["Dimensions", "—"], ["—", "Upload a .tif/.tiff file or load the example above"]];

const truncateLabel = (text, max = 12) => {
  const str = String(text);
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};
const bandCount = (inspect) => inspect?.summary?.bandCount ?? 0;
const bandOptions = ({ inspect }) => Array.from({ length: bandCount(inspect) }, (_, i) => String(i + 1));
const isRgb = (inputs) => inputs.bandIndex === RGB;
const plottable = (inspect) => (inspect?.summary?.bandStats ?? []).filter((b) => b.min !== null);

/** @type {import("../components/ToolDashboard.js").ToolConfig} */
const CONFIG = {
  tool: "raster-inspector",
  // Two bands: a Gaussian hill with one NoData corner pixel, and a
  // diagonal gradient, so switching bands visibly changes the preview.
  example: "/examples/raster-two-bands.tif",
  uploadKind: "raster",
  cells: { inspect: "raster-inspect-py", compute: "raster-preview-py" },
  exampleStatus: "✓ example raster loaded — pick a band and a color ramp, then Preview.",
  inputs: [
    { kind: "select", name: "bandIndex", label: "Band:", value: "1",
      options: (data) => (bandCount(data.inspect) ? [...bandOptions(data), RGB] : []) },
    { kind: "select", name: "colorRamp", label: "Color ramp:", value: "Viridis", options: Object.keys(RAMPS),
      visible: (inputs) => !isRgb(inputs) },
    ...["redBand", "greenBand", "blueBand"].map((name, i) => ({
      kind: "select", name, label: `${["Red", "Green", "Blue"][i]}:`, value: "1", options: bandOptions,
      visible: isRgb
    }))
  ],
  // Several bands: start on the RGB composite, previewed right away.
  inputsFromInspect: (value, inputs) => {
    const n = value?.summary?.bandCount ?? 0;
    return { ...inputs, bandIndex: n >= 2 ? RGB : "1", redBand: "1", greenBand: n >= 2 ? "2" : "1", blueBand: n >= 3 ? "3" : "1" };
  },
  autoCompute: (value) => (value?.summary?.bandCount ?? 0) >= 2,
  computeLabel: "👁 Preview",
  busyLabel: "⌛ Rendering...",
  fit: { inspect: (v) => v.footprint },

  layers: ({ inspect, result, resultInputs }) => [
    { id: "raster-inspect-py", label: "Footprint", type: "fill", data: inspect?.footprint ?? null,
      paint: { "fill-color": "#42583c", "fill-opacity": 0.35, "fill-outline-color": "#2a2117" } },
    { id: "raster-preview-py", label: "Preview", type: "raster", ...previewRaster(result, resultInputs) }
  ],

  side: {
    id: "ri-histogram",
    placeholder: HISTOGRAM_PLACEHOLDER,
    panels: [
      { kind: "chart", spec: ({ inspect }) => boxplotSpec(inspect) },
      { kind: "note", text: ({ inspect }) => (inspect?.summary && plottable(inspect).length === 0 ? "No band has any valid (non-NoData) pixels to compare." : null) },
      { kind: "chart", spec: ({ result }) => (result && result.mode !== "rgb" ? histogramSpec(result) : null) },
      { kind: "note", text: ({ inspect, result }) => {
        if (result?.mode === "rgb") return `RGB composite (bands ${result.bands.join(", ")}) — no single-band histogram to show. Pick a single band from the Band menu to see its value distribution instead.`;
        return inspect?.summary && !result ? HISTOGRAM_PLACEHOLDER : null;
      } }
    ]
  },

  stats: { empty: EMPTY_STATS, inspect: (v) => (v.summary ? inspectRows(v.summary) : EMPTY_STATS) },
  legend: ({ result, resultInputs }) => (result && result.mode !== "rgb"
    ? { gradient: RAMPS[resultInputs.colorRamp] ?? RAMPS.Viridis, minLabel: `${result.raster.min}`, maxLabel: `${result.raster.max}` }
    : null),

  // The summary itself, as JSON.
  download: {
    after: "inspect",
    enabled: ({ inspect }) => !!inspect?.summary,
    getFeatures: (_, { inspect }) => inspect.summary,
    filenameSuffix: "-stats.json",
    defaultFilename: "raster-stats.json",
    mimeType: "application/json"
  }
};

function previewRaster(result, inputs) {
  if (!result) return { raster: null };
  const r = result.raster;
  const base = { bounds: r.wgs84Bounds, width: r.width, height: r.height };
  if (result.mode === "rgb") {
    const channel = (c) => ({ values: base64ToFloat32(c.data), min: c.min, max: c.max });
    return { render: "rgb", raster: { ...base, red: channel(r.red), green: channel(r.green), blue: channel(r.blue) } };
  }
  return { render: "ramp", raster: { ...base, values: base64ToFloat32(r.data), min: r.min, max: r.max, colorRamp: RAMPS[inputs.colorRamp] ?? RAMPS.Viridis } };
}

function inspectRows(s) {
  const MAX_BANDS_SHOWN = 6;
  const bandLines = s.bandStats.slice(0, MAX_BANDS_SHOWN).map((b) =>
    (b.min === null ? `Band ${b.band}: all NoData` : `Band ${b.band}: ${b.min} to ${b.max} (mean ${b.mean})`));
  if (s.bandStats.length > MAX_BANDS_SHOWN) bandLines.push(`… and ${s.bandStats.length - MAX_BANDS_SHOWN} more band(s)`);
  return [
    ["Dimensions", `${s.width} × ${s.height} px`],
    ["Bands", String(s.bandCount)],
    ["CRS", s.crs == null ? `Unknown ⚠️ ${s.crsWarning}` : s.crs],
    ...(s.displayCrsAssumption ? [["Display assumption", `${s.displayCrsAssumption} — map only, not a fact about the file`]] : []),
    ["Resolution", s.resolution.join(" × ")],
    ["Data type", s.dtype],
    ["NoData", s.nodata == null ? "None declared" : String(s.nodata)],
    ["Bounds", s.bounds.join(", ")],
    ["Value range", bandLines.join(" · ")]
  ];
}

// Every band's spread side by side: min–max rule, Q1–Q3 box, median tick.
function boxplotSpec(inspect) {
  const rows = plottable(inspect).map((b) => ({ band: `Band ${b.band}`, order: b.band, min: b.min, q1: b.q1, median: b.median, q3: b.q3, max: b.max }));
  if (rows.length === 0) return null;
  const y = { field: "band", type: "nominal", sort: { field: "order" } };
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: "All bands compared",
    width: "container",
    height: Math.max(50, rows.length * 26),
    autosize: { type: "fit-x", contains: "padding" },
    data: { values: rows },
    layer: [
      { mark: { type: "rule", color: "#8a8378" }, encoding: { y: { ...y, title: null }, x: { field: "min", type: "quantitative", title: "Value" }, x2: { field: "max" } } },
      { mark: { type: "bar", color: "#42583c", height: 10 }, encoding: { y, x: { field: "q1", type: "quantitative" }, x2: { field: "q3" },
        tooltip: [{ field: "band" }, { field: "min" }, { field: "q1", title: "Q1" }, { field: "median" }, { field: "q3", title: "Q3" }, { field: "max" }] } },
      { mark: { type: "tick", color: "#ffffff", thickness: 2, height: 10 }, encoding: { y, x: { field: "median", type: "quantitative" } } }
    ]
  };
}

function histogramSpec(result) {
  const { counts, binEdges } = result.histogram;
  const rows = counts.map((count, j) => {
    const [lo, hi] = [binEdges[j], binEdges[j + 1]];
    const whole = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return { bin: truncateLabel(`${whole(lo)}–${whole(hi)}`, 10), binFull: `${lo.toLocaleString()}–${hi.toLocaleString()}`, count, order: j };
  });
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: `Band ${result.band} value distribution`,
    width: "container",
    height: Math.max(90, rows.length * 22),
    autosize: { type: "fit-x", contains: "padding" },
    data: { values: rows },
    mark: { type: "bar", color: "#42583c" },
    encoding: {
      y: { field: "bin", type: "nominal", sort: { field: "order" }, title: null, axis: { labelFontSize: 9 } },
      x: { field: "count", type: "quantitative", title: "Pixel count", axis: { tickMinStep: 1, format: "d" } },
      tooltip: [{ field: "binFull", title: "Value" }, { field: "count" }]
    }
  };
}

export const RasterInspectorTool = () => <ToolDashboard config={CONFIG} />;

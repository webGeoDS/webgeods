// Viewshed Calculator (blog/tools/viewshed-calculator.qmd): the
// interactive layer around the page's hidden R cells, which compute what
// an observer standing on an uploaded DEM can see. A ToolDashboard
// config; the observer is typed in or picked by clicking the map.
import { ToolDashboard } from "../components/ToolDashboard.js";
import { base64ToFloat32 } from "../hooks/useToolData.js";

const VISIBLE = [255, 213, 79];
// Visible pixels in one flat color (invisible ones are NoData).
const VIEWSHED_RAMP = [[0.00, ...VISIBLE], [1.00, ...VISIBLE]];
const EMPTY_STATS = [["Dimensions", "—"], ["—", "Upload a .tif/.tiff DEM or load the example above"]];

/** @type {import("../components/ToolDashboard.js").ToolConfig} */
const CONFIG = {
  tool: "viewshed-calculator",
  // A 20×20 Gaussian hill near Rome.
  example: "/examples/viewshed-hill-dem.tif",
  uploadKind: "raster",
  languages: ["r"],
  cells: { inspect: "viewshed-inspect-r", compute: "viewshed-r" },
  exampleStatus: "✓ example DEM loaded — click the map or enter coordinates, then Compute.",
  inputs: [
    { kind: "number", name: "obsLon", label: "Observer lon:", step: 0.0001, width: "95px", value: 12.45 },
    { kind: "number", name: "obsLat", label: "lat:", step: 0.0001, width: "95px", value: 41.90 },
    { kind: "number", name: "obsHeight", label: "height (m):", step: 0.1, width: "60px", value: 1.8 },
    { kind: "note", text: () => "— or click the map" }
  ],
  map: {
    center: [12.45, 41.9], zoom: 4, height: "480px",
    onClick: (lngLat) => ({ obsLon: Number(lngLat.lng.toFixed(6)), obsLat: Number(lngLat.lat.toFixed(6)) })
  },
  busyLabel: "⌛ Computing...",
  fit: { inspect: (v) => v.footprint },

  layers: ({ inspect, result }) => {
    const s = result?.summary;
    return [
      { id: "viewshed-footprint", label: "DEM footprint", type: "fill", data: inspect?.summary ? inspect.footprint : null,
        paint: { "fill-color": "#42583c", "fill-opacity": 0.35, "fill-outline-color": "#2a2117" } },
      { id: "viewshed-result", label: "Visible", type: "raster",
        raster: s && { bounds: s.wgs84Bounds, width: s.width, height: s.height, values: base64ToFloat32(s.data), min: 0, max: 1, colorRamp: VIEWSHED_RAMP } }
    ];
  },

  stats: {
    empty: EMPTY_STATS,
    inspect: (v) => (v.summary ? inspectRows(v.summary) : EMPTY_STATS),
    result: ({ summary: r }, { inspect }) => [
      ...inspectRows(inspect.summary),
      ["Calculation CRS", r.calculationCrs],
      ["Observer height", `${r.observerHeight} m`],
      ["Visible pixels", r.visiblePixels.toLocaleString()],
      ["Total pixels", r.totalPixels.toLocaleString()],
      ["Visible %", `${r.visiblePercent}%`]
    ]
  },
  legend: ({ result }) => (result ? { items: [{ color: `rgb(${VISIBLE.join(",")})`, label: "Visible from observer" }], options: { swatchWidth: 32 } } : null),

  // The viewshed as a GeoTIFF, for the observer it was computed for.
  download: {
    cell: "viewshed-export-r",
    label: "⬇ Download (calculation CRS)",
    inputs: ({ result, resultInputs: i }) => ({ obsLon: i.obsLon, obsLat: i.obsLat, obsHeight: result.summary.observerHeight }),
    filename: (base) => (base ? `${base}-viewshed.tif` : "viewshed.tif"),
    mimeType: "image/tiff"
  }
};

function inspectRows(s) {
  return [
    ["Dimensions", `${s.width} × ${s.height} px`],
    ["Original CRS", s.crs == null ? "Unknown ⚠️ viewshed needs a real-world location" : s.crs],
    ["Bounds", s.bounds.join(", ")]
  ];
}

export const ViewshedCalculatorTool = () => <ToolDashboard config={CONFIG} />;

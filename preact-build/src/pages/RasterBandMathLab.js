// Interactive parts of the article blog/posts/raster-band-math.qmd,
// around its Python and R cells (which the reader runs). An ArticleLab
// config with the upload, map, stat card and reset slots, plus
// #lab-legend; the "Load a no-CRS example" button is a
// ::: {.webgeods-example} block in the article itself.
//
// Each language draws its own footprint and result: each is colored on
// its own min/max, which is what the legend says.
import { ArticleLab } from "../components/ArticleLab.js";
import { base64ToFloat32 } from "../hooks/useToolData.js";

const FOOTPRINT_PAINT = { "fill-color": "#42583c", "fill-opacity": 0.35, "fill-outline-color": "#2a2117" };

const CONFIG = {
  cells: { py: "bandmath-py", r: "bandmath-r" },
  uploadKind: "raster",
  resetLabel: "🔄 Reset map and result",
  map: {
    center: [12.5, 41.9], zoom: 4, height: "480px", mode: "both",
    layers: (value, lang) => {
      const s = value.summary;
      if (!s) return [];
      return [
        { id: `bandmath-${lang}-footprint`, type: "fill", data: value.footprint, paint: FOOTPRINT_PAINT },
        { id: `bandmath-${lang}-result`, type: "raster",
          raster: s.min === null ? null : { bounds: s.wgs84Bounds, width: s.width, height: s.height, values: base64ToFloat32(s.data), min: s.min, max: s.max } }
      ];
    },
    fit: (value) => (value.summary ? value.footprint : null)
  },
  stats: (value) => {
    const s = value?.summary;
    if (!s) return [["Result", "—"]];
    return [
      ["Dimensions", `${s.width} × ${s.height} px`],
      ["CRS", s.crs == null ? `Unknown ⚠️ ${s.crsWarning}` : s.crs],
      ...(s.displayCrsAssumption ? [["Display assumption", `${s.displayCrsAssumption} — map only, not a fact about the file`]] : []),
      ["Output range", s.min !== null ? `${s.min} to ${s.max} (mean ${s.mean})` : "all NoData"],
      ["NoData pixels", `${s.nodataCount.toLocaleString()} / ${s.totalPixels.toLocaleString()}`]
    ];
  },
  slots: {
    "#lab-legend": ({ py, r }) => {
      const any = [py, r].some((v) => v?.summary && v.summary.min !== null);
      const stops = window.WebGeoDS.Map.DEFAULT_RASTER_RAMP.map(([t, red, green, blue]) => `rgb(${red},${green},${blue}) ${t * 100}%`).join(", ");
      return (
        <div class="webgeods-legend" hidden={!any}>
          <span class="webgeods-legend-label">low → high (each language's own min/max)</span>
          <div class="webgeods-legend-bar" style={{ background: `linear-gradient(to right, ${stops})` }} />
        </div>
      );
    }
  }
};

export const RasterBandMathLab = () => <ArticleLab config={CONFIG} />;

// Interactive parts of the article blog/posts/raster-viewshed.qmd, around
// its R cell (the reader runs it; Python is shown as reference only). An
// ArticleLab config for one language: upload, map, a result card,
// legend and reset; the "Load a no-CRS example" button is a
// ::: {.webgeods-example} block in the article itself.
import { ArticleLab } from "../components/ArticleLab.js";
import { StatCard } from "../components/Layout.js";
import { base64ToFloat32 } from "../hooks/useToolData.js";

const VISIBLE = [255, 213, 79];
const VIEWSHED_RAMP = [[0.00, ...VISIBLE], [1.00, ...VISIBLE]];
const FOOTPRINT_PAINT = { "fill-color": "#42583c", "fill-opacity": 0.35, "fill-outline-color": "#2a2117" };

const CONFIG = {
  cells: { r: "viewshed-r" },
  upload: { languages: ["r"] },
  uploadKind: "raster",
  resetLabel: "🔄 Reset map and result",
  map: {
    center: [12.45, 41.9], zoom: 4, height: "480px", mode: "r",
    layers: (value) => {
      const s = value.summary;
      if (!s) return [];
      return [
        { id: "viewshed-r-footprint", type: "fill", data: value.footprint, paint: FOOTPRINT_PAINT },
        { id: "viewshed-r-result", type: "raster",
          raster: { bounds: s.wgs84Bounds, width: s.width, height: s.height, values: base64ToFloat32(s.data), min: 0, max: 1, colorRamp: VIEWSHED_RAMP } }
      ];
    },
    fit: (value) => (value.summary ? value.footprint : null)
  },
  slots: {
    "#lab-result": ({ r }) => {
      const s = r?.summary;
      return <StatCard rows={s
        ? [
          ["Dimensions", `${s.width} × ${s.height} px`],
          ["Original CRS", s.originalCrs ?? "—"],
          ["Calculation CRS", s.calculationCrs],
          ["Observer height", `${s.observerHeight} m`],
          ["Visible pixels", s.visiblePixels.toLocaleString()],
          ["Total pixels", s.totalPixels.toLocaleString()],
          ["Visible %", `${s.visiblePercent}%`]
        ]
        : [["Result", "—"]]} />;
    },
    "#lab-legend": ({ r }) => (
      <div class="webgeods-legend" hidden={!r?.summary}>
        <div class="webgeods-legend-bar" style={{ flex: "0 0 32px", background: `rgb(${VISIBLE.join(",")})` }} />
        <span class="webgeods-legend-label">Visible from observer</span>
      </div>
    )
  }
};

export const RasterViewshedLab = () => <ArticleLab config={CONFIG} />;

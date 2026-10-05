// Interactive parts of the article blog/posts/raster-file-inspection.qmd,
// around its Python and R cells (which the reader runs). An ArticleLab
// config with the upload, map, stat card and reset slots; the "Load a
// no-CRS example" button is a ::: {.webgeods-example} block in the
// article itself.
import { ArticleLab } from "../components/ArticleLab.js";

const FOOTPRINT_PAINT = { "fill-color": "#42583c", "fill-opacity": 0.35, "fill-outline-color": "#2a2117" };

const CONFIG = {
  cells: { py: "raster-inspect-py", r: "raster-inspect-r" },
  uploadKind: "raster",
  resetLabel: "🔄 Reset map and summary",
  map: {
    center: [12.5, 41.9], zoom: 4, height: "480px", mode: "both",
    // Each language draws the file's footprint (the summary, not pixels).
    layers: (value, lang) => (value.summary ? [{ id: `raster-inspect-${lang}`, type: "fill", data: value.footprint, paint: FOOTPRINT_PAINT }] : []),
    fit: (value) => (value.summary ? value.footprint : null)
  },
  stats: (value) => {
    const s = value?.summary;
    if (!s) return [["Dimensions", "—"]];
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
      ["Data type", s.dtype || "—"],
      ["NoData", s.nodata == null ? "None declared" : String(s.nodata)],
      ["Bounds", s.bounds.join(", ")],
      ["Value range", bandLines.join(" · ")]
    ];
  }
};

export const RasterFileInspectionLab = () => <ArticleLab config={CONFIG} />;

// Interactive parts of the article
// blog/posts/geospatial-file-inspection.qmd, around its Python and R
// cells (which the reader runs). An ArticleLab config with the upload,
// map, stat card and reset slots; the "Load a CRS-mismatch example"
// button is a ::: {.webgeods-example} block in the article itself.
import { ArticleLab } from "../components/ArticleLab.js";

const byValidity = ["case", ["==", ["get", "valid"], true], "#2ea44f", "#e05252"];

const CONFIG = {
  cells: { py: "inspect-py", r: "inspect-r" },
  resetLabel: "🔄 Reset map and summary",
  map: {
    center: [12.5, 41.9], zoom: 4, height: "480px", mode: "both",
    // The fill, plus an outline: a self-intersecting polygon fills to
    // zero area, its outline still shows. A result without mapFeatures
    // (an older example) is already in WGS84.
    layers: (value, lang) => {
      const features = value.mapFeatures ?? value.features;
      return [
        { id: `inspect-${lang}`, type: "fill", data: features, paint: { "fill-color": byValidity, "fill-opacity": 0.55 } },
        { id: `inspect-${lang}-outline`, type: "line", data: window.WebGeoDS.toOutlineFeatures(features), paint: { "line-color": byValidity, "line-width": 2.5 } }
      ];
    },
    fit: (value) => value.mapFeatures ?? value.features
  },
  stats: (value) => {
    const s = value?.summary;
    if (!s || s.total === 0) return [["Features", "0"]];
    const geometry = s.geometryTypes.length > 1 ? `Mixed (${s.geometryTypes.join(", ")})` : (s.geometryTypes[0] ?? "—");
    return [
      ["Features", s.total.toLocaleString()],
      ["Geometry", geometry],
      ["CRS", s.crsWarning ? `${s.crs} ⚠️ ${s.crsWarning}` : (s.crs ?? "Unknown")],
      ["Bounds", s.bounds ? s.bounds.join(", ") : "—"],
      ["Attributes", `${s.attributeNames.length}${s.attributeNames.length > 0 ? ` (${s.attributeNames.join(", ")})` : ""}`],
      ["Invalid", String(s.invalid)],
      ["Empty", String(s.empty)],
      ["Duplicates", String(s.duplicates)]
    ];
  }
};

export const FileInspectionLab = () => <ArticleLab config={CONFIG} />;

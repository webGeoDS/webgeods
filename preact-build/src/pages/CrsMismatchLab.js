// Interactive parts of the article blog/posts/crs-mismatch.qmd, around
// its Python and R cells (which the reader runs). An ArticleLab config
// with the upload, map, stat card and reset slots.
//
// Each language draws its own copy of the file on the map: where the two
// land is part of the diagnosis.
import { ArticleLab } from "../components/ArticleLab.js";

const CONFIG = {
  cells: { py: "crs-diagnose-py", r: "crs-diagnose-r" },
  map: {
    center: [12.5, 41.9], zoom: 4, height: "480px", mode: "both",
    layers: (value, lang) => [{ id: `crs-${lang}`, data: value.features }],
    fit: (value) => value.features
  },
  stats: (value) => {
    const s = value?.summary;
    if (!s) return [["CRS", "—"]];
    return [
      ["CRS", s.crsWarning ? `${s.crs} ⚠️ ${s.crsWarning}` : s.crs],
      ["Type", s.isGeographic ? "Geographic (degrees)" : "Projected (usually meters)"],
      ["Bounds", s.bounds.join(", ")],
      [s.mismatchWarning ? "⚠️ Mismatch" : "Mismatch check", s.mismatchWarning ?? "✓ CRS and coordinates agree"],
      ...(s.mapCrsNote ? [["On the map", s.mapCrsNote]] : [])
    ];
  }
};

export const CrsMismatchLab = () => <ArticleLab config={CONFIG} />;

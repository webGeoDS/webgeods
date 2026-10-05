// Interactive parts of the article blog/posts/geometry-validity.qmd,
// around its diagnose and repair cells in Python and R (which the reader
// runs). An ArticleLab config: upload, the shared map, one feature table
// per language (in the article's own Python/R tabs), a stat card of the
// last run, reset and download side by side. The six "Load this example"
// buttons are ::: {.webgeods-example} blocks in the article itself.
//
// Each language draws its own layers: running one never clears the
// other's, so both stay visible for comparison. A language's layer shows
// whichever of its two cells ran last, the diagnosis or the repair.
import { useEffect } from "preact/hooks";
import { ArticleLab } from "../components/ArticleLab.js";
import { StatCard } from "../components/Layout.js";
import { DomNode } from "../components/DomNode.js";

const VALID = "#2ea44f";
const INVALID = "#e05252";
// Valid, or repaired into validity.
const byValidity = ["case", ["any", ["==", ["get", "valid"], true], ["==", ["get", "valid_after"], true]], VALID, INVALID];

// Values arrive as strings in the table ("false").
const rowClassName = (row) => {
  if (row.valid_after === "false") return "webgeods-row-invalid";
  if (row.valid_before === "false") return "webgeods-row-fixed";
  if (row.valid === "false") return "webgeods-row-invalid";
  return "";
};

const table = (lang) => ({
  lang, id: `geometry-${lang}`, from: (value) => value.features,
  rowClassName, iconColumns: ["valid", "valid_before", "valid_after"]
});

// The repair cells refuse to run after a reset (the map no longer shows
// what they would repair) until that language's diagnosis runs again:
// they read these flags through `#| inject:`.
const DIAGNOSE = { "geometry-diagnose-py": "pyWasReset", "geometry-diagnose-r": "rWasReset" };

const CONFIG = {
  cells: {
    py: ["geometry-diagnose-py", "geometry-repair-py"],
    r: ["geometry-diagnose-r", "geometry-repair-r"]
  },
  onRun: (cellId) => { if (DIAGNOSE[cellId]) window[DIAGNOSE[cellId]] = false; },
  onReset: () => { window.pyWasReset = true; window.rWasReset = true; },

  map: {
    center: [12.5, 41.9], zoom: 4, height: "480px", mode: "both",
    // A self-intersecting polygon fills to zero area: the outline shows it.
    layers: (value, lang) => [
      { id: `geometry-${lang}`, type: "fill", data: value.features, paint: { "fill-color": byValidity, "fill-opacity": 0.55 } },
      { id: `geometry-${lang}-outline`, type: "line", data: window.WebGeoDS.toOutlineFeatures(value.features),
        paint: { "line-color": byValidity, "line-width": 2.5 } }
    ],
    fit: (value) => value.features
  },

  tables: { "#lab-table-py": table("py"), "#lab-table-r": table("r") },

  slots: {
    // The last run, whichever language and cell it was.
    "#lab-validity": ({ latest, byCell }) => {
      const features = latest?.features?.features ?? [];
      const invalid = features.filter((f) => {
        const p = f.properties ?? {};
        return "valid_after" in p ? p.valid_after === false : p.valid === false;
      }).length;
      // CRS warnings come with the diagnoses (a repair keeps the data's CRS).
      const warnings = [...new Set(["geometry-diagnose-py", "geometry-diagnose-r"].map((id) => byCell[id]?.crsWarning).filter(Boolean))];
      return <StatCard rows={[
        ["Features", features.length.toLocaleString()],
        ["Valid", features.length - invalid],
        ["Invalid", invalid],
        ...(warnings.length ? [["CRS", warnings.join(" ")]] : [])
      ]} />;
    },
    "#lab-controls": ({ latest, files, reset }) => {
      const exportFeatures = latest?.originalCrsFeatures;
      return (
        <DomNode
          build={() => window.WebGeoDS.controlPanelRow([
            window.WebGeoDS.resetButton(reset, "🔄 Reset map and table"),
            window.WebGeoDS.downloadButton({
              getFeatures: () => (exportFeatures?.features?.length ? exportFeatures : null),
              getBaseName: () => window.WebGeoDS.Upload.baseName(files),
              filenameSuffix: "-validated.geojson",
              defaultFilename: "validated-geojson.geojson",
              enabled: (exportFeatures?.features?.length ?? 0) > 0,
              tool: "geometry-validity-article"
            })
          ])}
          deps={[exportFeatures, files]} />
      );
    }
  }
};

export function GeometryValidityLab() {
  useEffect(() => {
    window.pyWasReset = false;
    window.rWasReset = false;
  }, []);
  return <ArticleLab config={CONFIG} />;
}

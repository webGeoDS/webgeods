// Interactive parts of the article blog/posts/topology-errors.qmd,
// around its Python and R cells (which the reader runs). An ArticleLab
// config: upload, the shared map, a features table and a gaps table per
// language (in the article's own nested tabs), a one-line summary of the
// last check, reset and download. The five "Load the ... example"
// buttons are ::: {.webgeods-example} blocks in the article itself.
//
// Each language's layers show whichever of its two checks ran last: a
// fixed example, or "apply to your file".
import { ArticleLab } from "../components/ArticleLab.js";
import { GAP_PAINT, featuresStyle, errorRowClass } from "./topologyStyle.js";

const featuresTable = (lang) => ({
  lang, id: `topology-errors-${lang}`, from: (value) => value.features, rowClassName: errorRowClass, emptyMessage: "No results yet"
});
const gapsTable = (lang) => ({
  lang, id: `topology-errors-gaps-${lang}`, from: (value) => value.gaps, emptyMessage: "No gaps found"
});

const CONFIG = {
  cells: {
    py: ["topology-errors-example-py", "topology-errors-uploaded-py"],
    r: ["topology-errors-example-r", "topology-errors-uploaded-r"]
  },
  resetLabel: "🔄 Reset map and table",
  map: {
    center: [12.5, 41.9], zoom: 4, height: "480px", mode: "both",
    layers: (value, lang) => [
      { id: `topology-errors-${lang}`, data: value.features, ...featuresStyle(value.features) },
      { id: `topology-errors-gaps-${lang}`, type: "fill", data: value.gaps, paint: GAP_PAINT }
    ],
    fit: (value) => value.features
  },
  tables: {
    "#lab-features-py": featuresTable("py"),
    "#lab-gaps-py": gapsTable("py"),
    "#lab-features-r": featuresTable("r"),
    "#lab-gaps-r": gapsTable("r")
  },
  slots: {
    // The last check, whichever language ran it.
    "#lab-status": ({ latest, py, r }) => {
      const features = latest?.features?.features ?? [];
      const errors = features.filter((f) => f.properties?.has_error === true).length;
      const gaps = latest?.gaps?.features?.length ?? 0;
      const warnings = [...new Set([py?.crsWarning, r?.crsWarning].filter(Boolean))];
      return (
        <p>
          <strong>Topology check</strong>
          {` — ${features.length} feature, ${errors} with an error, ${gaps} total gaps.${warnings.length ? ` ⚠️ ${warnings.join(" ")}` : ""}`}
        </p>
      );
    },
    // The checked features (no gaps: a gap has no row in the uploaded
    // file), in the CRS they were uploaded in when there is one.
    "#lab-download": ({ latest, files }) => (
      <button onClick={() => {
        const features = (latest?.originalCrsFeatures ?? latest?.features)?.features ?? [];
        if (features.length === 0) return;
        const base = window.WebGeoDS.Upload.baseName(files);
        window.WebGeoDS.downloadBlob(
          JSON.stringify({ type: "FeatureCollection", features }, null, 2),
          base ? `${base}-topology-report.geojson` : "topology-report.geojson",
          "application/geo+json",
          { tool: "topology-errors-article" }
        );
      }}>⬇ Download</button>
    )
  }
};

export const TopologyErrorsLab = () => <ArticleLab config={CONFIG} />;

// Interactive parts of the article blog/posts/spatial-clustering.qmd,
// around its Python and R cells (which the reader runs). An ArticleLab
// config: the standard slots plus #lab-labels, the point-by-point table
// of the label each language gave.
//
// The map shows Python's result only: R finds the same groups, numbered
// differently (the point of section 4), which two layers on the same
// points couldn't show anyway.
import { ArticleLab } from "../components/ArticleLab.js";

const CLUSTER_PALETTE = ["#ab502b", "#42583c", "#3d5a73", "#c48a2e", "#8b2f24"];
const NOISE_COLOR = "#766851";

// Noise (-1) is never a cluster hue: it's the match's fallback.
const clusterPaint = (labels) => window.WebGeoDS.matchPaint(
  labels.filter((label) => label !== -1), "cluster", { palette: CLUSTER_PALETTE, fallback: NOISE_COLOR });

const CONFIG = {
  cells: { py: "spatial-clustering-py", r: "spatial-clustering-r" },
  map: {
    center: [12.45, 41.9], zoom: 10, mode: "py",
    layers: (result) => [{ id: "spatial-clustering-map", type: "circle", data: result.features, paint: clusterPaint(result.uniqueLabels) }],
    fit: (result) => result.features
  },
  stats: (s) => (s
    ? [["Calculation CRS", s.calculationCrs], ["Labels used", s.uniqueLabels.join(", ")], ["Noise points", s.noiseCount]]
    : [["Calculation CRS", "—"]]),
  slots: {
    "#lab-labels": ({ py, r }) => (py && r
      ? (
        <div>
          <table class="webgeods-stat-grid" style="display: table; width: 100%;">
            <tr>{["Point #", "Python label", "R label"].map((h) => <th class="webgeods-stat-label">{h}</th>)}</tr>
            {py.labels.map((label, i) => (
              <tr>{[String(i + 1), String(label), String(r.labels[i])].map((t) => <td class="webgeods-stat-value">{t}</td>)}</tr>
            ))}
          </table>
        </div>
      )
      : <div>Run both cells above to compare.</div>)
  }
};

export const SpatialClusteringLab = () => <ArticleLab config={CONFIG} />;

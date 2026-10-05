// Interactive parts of the article blog/posts/spatial-classification.qmd,
// around its Python and R cells (which the reader runs). An ArticleLab
// config: the standard slots plus #lab-nofactor, the result card of the
// R regression-switch cell.
import { ArticleLab, StatGrid } from "../components/ArticleLab.js";

// Same palette and roles as the Spatial Classifier tool, so a reader who
// has seen the tool recognizes them.
const CLASS_PALETTE = ["#ab502b", "#42583c", "#3d5a73", "#c48a2e", "#8b2f24"];

function classPaint(classLabels, field, fill) {
  const color = ["match", ["get", field]];
  classLabels.forEach((label, i) => color.push(label, CLASS_PALETTE[i % CLASS_PALETTE.length]));
  color.push("#766851");
  return fill
    ? { "fill-color": color, "fill-opacity": 0.45, "fill-outline-color": "rgba(0,0,0,0)" }
    : { "circle-color": color, "circle-radius": 6, "circle-stroke-width": 1.5, "circle-stroke-color": "#2a2117" };
}

// Each language draws onto its own sources, so running one draws a
// surface and running both leaves both visible. Where both have run the
// grids overlap, which is the point: a cell the two languages classified
// differently shows a color that doesn't match.
function languageLayers(result, lang) {
  const suffix = lang === "r" ? "-r" : "";
  const name = lang === "r" ? "R" : "Python";
  return [
    { id: `spatial-classification-grid${suffix}`, label: `${name} grid`, type: "fill", data: result.gridFeatures, paint: classPaint(result.classLabels, "predictedClass", true) },
    { id: `spatial-classification-training${suffix}`, label: `${name} points`, type: "circle", data: result.trainingFeatures, paint: classPaint(result.classLabels, "class", false) }
  ];
}

const CONFIG = {
  cells: { py: "spatial-classification-py", r: "spatial-classification-r" },
  extra: { noFactor: "spatial-classification-r-nofactor" },
  map: {
    center: [12.45, 41.89], zoom: 11, mode: "both",
    layers: languageLayers,
    fit: (result) => result.gridFeatures
  },
  stats: summaryRows,
  slots: {
    "#lab-nofactor": ({ extra: { noFactor } }) => (
      <StatGrid rows={noFactor
        ? [
          ["model$type", noFactor.modelType],
          [`predict() on a point labeled ${noFactor.sampleTrueClass}`, noFactor.samplePrediction.toFixed(3)]
        ]
        : [["model$type", "—"]]} />
    )
  }
};

export const SpatialClassificationLab = () => <ArticleLab config={CONFIG} />;

function summaryRows(s) {
  if (!s) return [["Calculation CRS", "—"]];
  const byClass = (m) => Object.entries(m ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ");
  const rows = [
    ["Calculation CRS", s.calculationCrs],
    ["Classes", s.classLabels.join(", ")],
    ["Labeled points", s.labeledCount]
  ];
  if (s.accuracyRandom == null) {
    // Not a score of 0: too few points per class to cross-validate.
    rows.push(["Cross-validated accuracy", "too few points per class to cross-validate"]);
  } else {
    rows.push(["Random folds", `${s.accuracyRandom} (${byClass(s.classAccuracyRandom)})`]);
    rows.push(["Spatial blocks", `${s.accuracyBlocks} (${byClass(s.classAccuracyBlocks)})`]);
    rows.push(["Nearest sample, median", `random test ${s.distanceRandom} m · map cells ${s.distanceMap} m · block test ${s.distanceBlocks} m`]);
  }
  rows.push(["Grid cells predicted", s.gridCellCount]);
  return rows;
}

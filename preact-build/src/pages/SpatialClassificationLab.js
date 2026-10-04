// Interactive parts of the article blog/posts/spatial-classification.qmd,
// around its Python and R cells (which the reader runs). One component,
// rendered through portals into empty slots in the Markdown, so it sits
// between the paragraphs exactly where the OJS cells used to:
//
//   #lab-upload    upload control and its status line
//   #lab-map       the shared map
//   #lab-crs       "no CRS, assuming WGS84" warning, if any
//   #lab-stats     Python and R stat cards, side by side
//   #lab-reset     "Reset map and cards"
//   #lab-nofactor  result card of the R regression-switch cell
import { useEffect, useState } from "preact/hooks";
import { useCellValue } from "../hooks/useCellValue.js";
import { MapView } from "../components/MapView.js";
import { DomNode } from "../components/DomNode.js";
import { Portal } from "../components/Layout.js";

const CELLS = {
  py: "spatial-classification-py",
  r: "spatial-classification-r",
  noFactor: "spatial-classification-r-nofactor"
};

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
function languageLayers(lang, result) {
  const suffix = lang === "r" ? "-r" : "";
  return [
    { id: `spatial-classification-grid${suffix}`, type: "fill", data: result.gridFeatures, paint: classPaint(result.classLabels, "predictedClass", true) },
    { id: `spatial-classification-training${suffix}`, type: "circle", data: result.trainingFeatures, paint: classPaint(result.classLabels, "class", false) }
  ];
}

export function SpatialClassificationLab() {

  const [uploadStatus, setUploadStatus] = useState(window.WebGeoDS.Upload.defaultStatus);
  const [py, setPy] = useCellValue(CELLS.py);
  const [r, setR] = useCellValue(CELLS.r);
  const [noFactor] = useCellValue(CELLS.noFactor);
  // The language that ran last draws on top, as when each result was
  // drawn the moment it arrived.
  const [order, setOrder] = useState([]);
  const [lastResult, setLastResult] = useState(null);

  // A new value on every run of a cell: that language moves to the top.
  const ran = (lang, value) => {
    if (!value) return;
    setOrder((current) => [...current.filter((l) => l !== lang), lang]);
    setLastResult(value);
  };
  useEffect(() => ran("py", py), [py]);
  useEffect(() => ran("r", r), [r]);

  const results = { py, r };
  const layers = order.filter((lang) => results[lang]).flatMap((lang) => languageLayers(lang, results[lang]));
  const crsWarning = lastResult?.crsWarning ?? null;

  const reset = () => {
    setPy(null);
    setR(null);
    setOrder([]);
    setLastResult(null);
  };

  return (
    <>
      <Portal target="#lab-upload">
        <DomNode build={() => window.WebGeoDS.Upload.createControl({
          label: "Upload",
          onChange: async (files) => {
            const loaded = await window.WebGeoDS.Upload.load(files);
            setUploadStatus(loaded.message);
          }
        })} />
        <p>{uploadStatus}</p>
      </Portal>

      <Portal target="#lab-map">
        <MapView height="420px" center={[12.45, 41.89]} zoom={11} layers={layers} fitTo={lastResult?.gridFeatures} />
      </Portal>

      <Portal target="#lab-crs">
        <div class="webgeods-panel-status">{crsWarning ? `⚠️ ${crsWarning}` : ""}</div>
      </Portal>

      <Portal target="#lab-stats">
        {/* Two cards side by side: seeing them agree is the point. */}
        <div style="display: flex; flex-wrap: wrap; gap: 16px;">
          <LabeledStatCard label="Python" rows={summaryRows(py)} />
          <LabeledStatCard label="R" rows={summaryRows(r)} />
        </div>
      </Portal>

      <Portal target="#lab-reset">
        <DomNode build={() => window.WebGeoDS.resetButton(() => reset(), "🔄 Reset map and cards")} />
      </Portal>

      <Portal target="#lab-nofactor">
        <StatGrid rows={noFactor
          ? [
            ["model$type", noFactor.modelType],
            [`predict() on a point labeled ${noFactor.sampleTrueClass}`, noFactor.samplePrediction.toFixed(3)]
          ]
          : [["model$type", "—"]]} />
      </Portal>
    </>
  );

}

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

function StatGrid({ rows }) {
  return (
    <div class="webgeods-stat-grid">
      {rows.map(([label, value]) => (
        <>
          <div class="webgeods-stat-label">{label}</div>
          <div class="webgeods-stat-value">{String(value)}</div>
        </>
      ))}
    </div>
  );
}

function LabeledStatCard({ label, rows }) {
  return (
    <div style="flex: 1; min-width: 260px;">
      <div class="webgeods-label">{label}</div>
      <StatGrid rows={rows} />
    </div>
  );
}

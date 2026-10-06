// Interactive parts of the article
// blog/posts/cokriging-raster-gap-filling.qmd, around its two R cells
// (which the reader runs, in order): the fit (the target band with its
// gap, the variogram) and the prediction (the gap filled by cokriging).
// An ArticleLab config for R alone: upload, map, legend, a card for each
// step and the variogram chart (variogramChart.js, shared with the
// kriging pages).
//
// Running the fit again clears the filled band: it belonged to the
// previous fit.
import { ArticleLab } from "../components/ArticleLab.js";
import { StatCard, Legend } from "../components/Layout.js";
import { VegaChart } from "../components/VegaChart.js";
import { base64ToFloat32 } from "../hooks/useToolData.js";
import { variogramSpec, pillifyReferenceLabels } from "./variogramChart.js";

const FIT = "cokriging-fit-r";
const PREDICT = "cokriging-predict-r";
const FILL_RAMP = [[0.00, 68, 1, 84], [0.25, 59, 82, 139], [0.50, 33, 144, 140], [0.75, 94, 201, 98], [1.00, 253, 231, 37]];

const fit = ({ byCell }) => byCell[FIT] ?? null;
// The prediction only counts when it ran after the latest fit.
const prediction = ({ byCell, sources }) => (sources.r === PREDICT ? byCell[PREDICT] : null);

const rasterOf = (r) => r && { bounds: r.wgs84Bounds, width: r.width, height: r.height, values: base64ToFloat32(r.data), min: r.min, max: r.max, colorRamp: FILL_RAMP };

let lastFit = null;
let lastSpec = null;
// One spec per fit: a new object would redraw the chart on every render.
const specFor = (f) => {
  if (f !== lastFit) {
    lastFit = f;
    lastSpec = f ? variogramSpec(f.variogram, f.summary, { unit: "", roundSill: true }) : null;
  }
  return lastSpec;
};

const CONFIG = {
  cells: { r: [FIT, PREDICT] },
  upload: { languages: ["r"] },
  uploadKind: "raster",
  map: {
    center: [12.45, 41.91], zoom: 13, height: "480px", mode: "r",
    // The filled band over the band with its gap.
    layers: (value, lang, state) => [
      { id: "cokriging-target-raw", type: "raster", raster: rasterOf(fit(state)?.raster) },
      { id: "cokriging-target-filled", type: "raster", raster: rasterOf(prediction(state)?.raster) }
    ],
    fit: () => null
  },
  slots: {
    "#lab-legend": (state) => {
      const range = (prediction(state) ?? fit(state))?.raster;
      return <Legend items={range ? { gradient: FILL_RAMP, minLabel: `${range.min}`, maxLabel: `${range.max}` } : null} />;
    },
    "#lab-fit": (state) => {
      const s = fit(state)?.summary;
      return <StatCard rows={s
        ? [["Target band", s.targetBand], ["Covariate band", s.covariateBand], ["Pixels used to fit", s.coFitPixels.toLocaleString()],
          ["Nugget", s.nugget], ["Partial sill", s.partialSill], ["Range", s.range], ["Sample mean", s.sampleMean], ["Sample variance", s.sampleVariance]]
        : [["Result", "—"]]} />;
    },
    "#lab-variogram": (state) => {
      const f = fit(state);
      return f?.summary
        ? <VegaChart spec={specFor(f)} onRender={pillifyReferenceLabels} />
        : <p style="color: #8a8378; text-align: center;">Run the R cell above to see the variogram.</p>;
    },
    "#lab-prediction": (state) => {
      const s = prediction(state)?.summary;
      return s
        ? <StatCard rows={[
          ["Pixels filled", s.pixelsFilled.toLocaleString()],
          ...(s.crossValidationRmse != null ? [["Cross-validation RMSE", s.crossValidationRmse]] : []),
          ...(s.pixelsStillEmpty > 0 ? [["Still empty", `${s.pixelsStillEmpty.toLocaleString()} (no covariate data there either)`]] : [])
        ]} />
        : null;
    }
  }
};

export const CokrigingLab = () => <ArticleLab config={CONFIG} />;

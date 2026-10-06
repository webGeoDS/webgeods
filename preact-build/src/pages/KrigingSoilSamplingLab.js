// Interactive parts of the article blog/posts/kriging-soil-sampling.qmd,
// around its two R cells (which the reader runs, in order): the model
// (sample points, empirical variogram, fitted model) and the prediction
// (the kriged surface). An ArticleLab config for R alone: upload, map,
// legend, a card for each step and the variogram chart, shared with the
// Kriging Interpolator tool (variogramChart.js).
//
// Running the model again clears the surface: it belonged to the
// previous fit.
import { ArticleLab } from "../components/ArticleLab.js";
import { StatCard, Legend } from "../components/Layout.js";
import { VegaChart } from "../components/VegaChart.js";
import { base64ToFloat32 } from "../hooks/useToolData.js";
import { variogramSpec, pillifyReferenceLabels } from "./variogramChart.js";

const MODEL = "kriging-model-r";
const PREDICT = "kriging-predict-r";
const KRIGE_RAMP = [[0.00, 166, 97, 26], [0.25, 223, 194, 125], [0.50, 245, 245, 245], [0.75, 128, 205, 193], [1.00, 1, 133, 113]];
const POINT_COLORS = KRIGE_RAMP.map(([, r, g, b]) => `rgb(${r},${g},${b})`);

const model = ({ byCell }) => byCell[MODEL] ?? null;
// The prediction only counts when it ran after the latest model.
const prediction = ({ byCell, sources }) => (sources.r === PREDICT ? byCell[PREDICT] : null);

function pointsPaint({ valueMin: min, valueMax: max }) {
  const step = (max - min) / 4;
  return {
    "circle-radius": 6,
    "circle-color": ["interpolate", ["linear"], ["get", "value"],
      min, POINT_COLORS[0], min + step, POINT_COLORS[1], min + step * 2, POINT_COLORS[2], min + step * 3, POINT_COLORS[3], max, POINT_COLORS[4]],
    "circle-stroke-color": "#2a2117",
    "circle-stroke-width": 1.5
  };
}

let lastModel = null;
let lastSpec = null;
// One spec per model run: a new object would redraw the chart on every render.
const specFor = (m) => {
  if (m !== lastModel) {
    lastModel = m;
    lastSpec = m ? variogramSpec(m.variogram, m.summary) : null;
  }
  return lastSpec;
};

const CONFIG = {
  cells: { r: [MODEL, PREDICT] },
  upload: { languages: ["r"] },
  map: {
    center: [12.45, 41.885], zoom: 13, height: "480px", mode: "r",
    // The surface under the points.
    layers: (value, lang, state) => {
      const m = model(state);
      const p = prediction(state);
      return [
        { id: "kriging-r-surface", type: "raster",
          raster: p?.raster && { bounds: p.raster.wgs84Bounds, width: p.raster.width, height: p.raster.height,
            values: base64ToFloat32(p.raster.data), min: p.raster.min, max: p.raster.max, colorRamp: KRIGE_RAMP } },
        ...(m?.summary ? [{ id: "kriging-r-points", type: "circle", data: m.samplePoints, paint: pointsPaint(m.summary) }] : [])
      ];
    },
    fit: (value) => value.samplePoints ?? null
  },
  slots: {
    "#lab-legend": (state) => {
      const p = prediction(state);
      const m = model(state);
      const range = p ? p.raster : m?.summary ? { min: m.summary.valueMin, max: m.summary.valueMax } : null;
      return <Legend items={range ? { gradient: KRIGE_RAMP, minLabel: `${range.min}%`, maxLabel: `${range.max}%` } : null} />;
    },
    "#lab-model": (state) => {
      const s = model(state)?.summary;
      return <StatCard rows={s
        ? [["Points used", s.count.toLocaleString()], ["Calculation CRS", s.calculationCrs], ["Value column", s.valueColumn],
          ["Nugget", s.nugget], ["Partial sill", s.partialSill], ["Range (m)", s.range]]
        : [["Result", "—"]]} />;
    },
    "#lab-variogram": (state) => {
      const m = model(state);
      return m?.summary
        ? <VegaChart spec={specFor(m)} onRender={pillifyReferenceLabels} />
        : <p style="color: #8a8378; text-align: center;">Run the R cell above to see the variogram.</p>;
    },
    "#lab-prediction": (state) => {
      const s = prediction(state)?.summary;
      return s ? <StatCard rows={[["Grid cells", s.gridCellCount.toLocaleString()], ["Mean prediction variance", s.meanVariance]]} /> : null;
    }
  }
};

export const KrigingSoilSamplingLab = () => <ArticleLab config={CONFIG} />;

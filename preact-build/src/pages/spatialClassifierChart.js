// Side-panel chart of the Spatial Classifier: two stacked views in ONE
// Vega-Lite spec (vconcat) — labeled points per class, then either the
// confusion matrix (up to 6 classes) or test accuracy per class (more
// than that: a 30x30 matrix in a narrow panel reads as confetti).
//
// Every row carries its selection key in the same field, `key`
// (renderVegaChart reads one keyField for the whole spec): a class name
// for the bars, "true>predicted" for a matrix cell. chartKeyFor and
// selectionFromChartKey translate between those keys and the tool's
// selection, a { property: value } filter over the points.

export const PAIR_SEPARATOR = ">";
const MAX_MATRIX_CLASSES = 6;
const SELECTION_YELLOW = "#ffeb3b"; // same as map/table selection (--dataviz-selection)

// A matrix cell, a class, or the class of a selected point.
export function chartKeyFor(selection, points) {
  if (selection.predictedClass !== undefined) return `${selection.class}${PAIR_SEPARATOR}${selection.predictedClass}`;
  return selection.class ?? points[0]?.properties.class ?? null;
}

// A matrix cell selects only the held-out points behind it.
export function selectionFromChartKey(key) {
  const [trueClass, predictedClass] = key.split(PAIR_SEPARATOR);
  return predictedClass === undefined
    ? { class: trueClass }
    : { heldOut: true, class: trueClass, predictedClass };
}

export function classifierChartSpec(summary) {

  const palette = window.WebGeoDS.DEFAULT_PALETTE;

  const distRows =
    Object.entries(summary.classCounts).map(([cls, count]) => ({ cls, count, key: cls }));

  // A class with no held-out points is absent, not shown at 0%: untested
  // is not the same claim as always wrong.
  const accRows =
    Object.entries(summary.classAccuracy)
      .map(([cls, a]) => ({ cls, accuracy: a.accuracy, testCount: a.testCount, key: cls }));

  const confusionRows =
    (summary.confusion ?? []).map((c) => ({
      trueClass: c.trueClass,
      predictedClass: c.predictedClass,
      count: c.count,
      correct: c.trueClass === c.predictedClass,
      key: `${c.trueClass}${PAIR_SEPARATOR}${c.predictedClass}`
    }));

  const useMatrix =
    confusionRows.length > 0 && summary.classLabels.length <= MAX_MATRIX_CLASSES;

  const classColor = {
    condition: { test: "datum.cls === classExternal", value: SELECTION_YELLOW },
    field: "cls",
    type: "nominal",
    scale: { domain: summary.classLabels, range: palette },
    legend: null
  };

  const matrix = {
    title: { text: "Confusion matrix", subtitle: "held-out points only" },
    width: "container",
    height: 130,
    data: { values: confusionRows },
    layer: [
      {
        // The selection param on this layer, not on the layered spec:
        // declared one level up, Vega-Lite copies it into both layers
        // and fails with "Duplicate signal name".
        params: [{ name: "classSelectAcc", select: { type: "point", fields: ["key"] } }],
        mark: { type: "rect", stroke: "#ffffff", strokeWidth: 1 },
        encoding: {
          // Diagonal green, errors red, so the shape of the mistakes
          // reads before any number; opacity carries the count.
          color: {
            condition: { test: "datum.key === classExternal", value: SELECTION_YELLOW },
            field: "correct",
            type: "nominal",
            scale: { domain: [true, false], range: ["#42583c", "#ab502b"] },
            legend: null
          },
          opacity: { field: "count", type: "quantitative", scale: { range: [0.35, 1] }, legend: null }
        }
      },
      {
        mark: { type: "text", fontSize: 11, fontWeight: 600 },
        encoding: {
          text: { field: "count", type: "quantitative" },
          color: { value: "#ffffff" }
        }
      }
    ],
    encoding: {
      x: { field: "predictedClass", type: "nominal", title: "Predicted", scale: { domain: summary.classLabels } },
      y: { field: "trueClass", type: "nominal", title: "Actual", scale: { domain: summary.classLabels } }
    }
  };

  const accuracyBars = {
    title: { text: "Test accuracy per class", subtitle: "held-out points only" },
    width: "container",
    height: 100,
    data: { values: accRows },
    params: [{ name: "classSelectAcc", select: { type: "point", fields: ["key"] } }],
    mark: "bar",
    encoding: {
      x: { field: "cls", type: "nominal", title: "Class" },
      y: { field: "accuracy", type: "quantitative", title: "Test accuracy", scale: { domain: [0, 1] }, axis: { format: "%" } },
      color: classColor
    }
  };

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    // fit-x: each view sets its own height, only the width must fit the
    // panel (the default autosize clipped a vconcat on the right).
    autosize: { type: "fit-x", contains: "padding" },
    params: [{ name: "classExternal", value: null }],
    vconcat: [
      {
        // All labeled points, before the train/test split: a click
        // selects every point of the class, held out or not.
        title: "Labeled points per class",
        width: "container",
        height: 130,
        data: { values: distRows },
        // Default clear trigger (dblclick) kept: a "click" clear trigger
        // also fired on the selecting click and cancelled it.
        params: [{ name: "classSelectDist", select: { type: "point", fields: ["key"] } }],
        mark: "bar",
        encoding: {
          x: { field: "cls", type: "nominal", title: "Class" },
          y: { field: "count", type: "quantitative", title: "Labeled points" },
          color: classColor
        }
      },
      useMatrix ? matrix : accuracyBars
    ]
  };

}

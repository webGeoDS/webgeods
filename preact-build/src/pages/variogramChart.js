// Variogram charts as Vega-Lite specs, shared by the Kriging Interpolator
// and Raster Gap Filler tools and the kriging article (which drew the same
// chart by hand in d3 before): sample points with their pair counts, the
// fitted curve, and dashed reference lines for nugget, sill and range.
// Each value also appears in the stat card.

const round4 = (n) => Math.round(n * 10000) / 10000;
const LABEL = { type: "text", baseline: "bottom", color: "#8a8378", fontSize: 11, fontWeight: 600 };
const RULE = { type: "rule", strokeDash: [4, 3], color: "#8a8378" };
const at = (fields) => ({ data: { values: [{}] }, ...fields });

// The layers of one variogram panel.
// series: { empirical: { dist, gamma, npairs }, fitted: { dist, gamma } }
// opts:   { nugget, sill, range, unit, xDomain, yDomain, rangeFrom, rangeTo,
//           pointColor, lineColor, pointSize, valueTitle }
function variogramLayers(series, o) {
  const empRows = series.empirical.dist.map((dist, i) => ({ dist, gamma: series.empirical.gamma[i], npairs: series.empirical.npairs[i] }));
  const fitRows = series.fitted.dist.map((dist, i) => ({ dist, gamma: series.fitted.gamma[i] }));
  const maxDist = o.xDomain[1] / 1.05;
  // A range near the right edge gets its label on its left side.
  const rangeLeft = o.range > maxDist * 0.75;
  return [
    // A dotted zero line when the axis goes below zero (a cross-variogram can).
    ...(o.yDomain[0] < -1e-9 ? [at({ mark: { ...RULE, strokeDash: [2, 2] },
      encoding: { x: { datum: 0, type: "quantitative" }, x2: { datum: maxDist }, y: { datum: 0, type: "quantitative" } } })] : []),
    {
      data: { values: empRows },
      mark: { type: "point", filled: true, size: o.pointSize ?? 70, color: o.pointColor },
      encoding: {
        x: { field: "dist", type: "quantitative", title: o.unit ? `Distance (${o.unit})` : "Distance", scale: { domain: o.xDomain } },
        y: { field: "gamma", type: "quantitative", title: "Semivariance", scale: { domain: o.yDomain } },
        tooltip: [
          { field: "dist", title: o.unit ? `Distance (${o.unit})` : "Distance" },
          { field: "gamma", title: o.valueTitle ?? "Semivariance" },
          { field: "npairs", title: "Point pairs" }
        ]
      }
    },
    {
      data: { values: fitRows },
      mark: { type: "line", color: o.lineColor },
      encoding: { x: { field: "dist", type: "quantitative" }, y: { field: "gamma", type: "quantitative" } }
    },
    at({ mark: RULE, encoding: { x: { datum: 0, type: "quantitative" }, x2: { datum: maxDist }, y: { datum: o.nugget, type: "quantitative" } } }),
    at({ mark: { ...LABEL, align: "left", dx: 8, dy: -4 },
      encoding: { x: { datum: 0, type: "quantitative" }, y: { datum: o.nugget, type: "quantitative" }, text: { value: `nugget ${o.nugget}` } } }),
    at({ mark: RULE, encoding: { x: { datum: 0, type: "quantitative" }, x2: { datum: maxDist }, y: { datum: o.sill, type: "quantitative" } } }),
    at({ mark: { ...LABEL, align: "right", dx: -2, dy: -2 },
      encoding: { x: { datum: maxDist, type: "quantitative" }, y: { datum: o.sill, type: "quantitative" }, text: { value: `sill ${o.sill}` } } }),
    at({ mark: RULE, encoding: { x: { datum: o.range, type: "quantitative" }, y: { datum: o.rangeFrom, type: "quantitative" }, y2: { datum: o.rangeTo } } }),
    at({ mark: { ...LABEL, align: rangeLeft ? "right" : "left", dx: rangeLeft ? -3 : 3, dy: -3 },
      encoding: { x: { datum: o.range, type: "quantitative" }, y: { datum: o.rangeFrom, type: "quantitative" }, text: { value: `range ${o.range}${o.unit}` } } })
  ];
}

const maxOf = (values) => values.reduce((a, b) => (b > a ? b : a), -Infinity);

// Kriging (tool and article) and the cokriging article: one panel,
// semivariance from zero. model: { nugget, partialSill, range }
// unit: "m" (default), or "" when the distances have none to show;
// roundSill: show nugget + partial sill to 4 decimals.
export function variogramSpec(variogram, { nugget, partialSill, range }, { height = 220, unit = "m", roundSill = false } = {}) {
  const sill = roundSill ? round4(nugget + partialSill) : nugget + partialSill;
  const series = variogram;
  const maxDist = Math.max(range, maxOf(series.empirical.dist), maxOf(series.fitted.dist));
  const maxGamma = Math.max(sill, maxOf(series.empirical.gamma), maxOf(series.fitted.gamma));
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: "Empirical variogram and fitted model",
    width: "container",
    height,
    autosize: { type: "fit-x", contains: "padding" },
    layer: variogramLayers(series, {
      nugget, sill, range, unit,
      xDomain: [0, maxDist * 1.05], yDomain: [0, maxGamma * 1.05], rangeFrom: 0, rangeTo: maxGamma,
      pointColor: "#42583c", lineColor: "#ab502b"
    })
  };
}

// Raster Gap Filler: one panel for the target band, or three stacked
// (target, covariate, cross-variogram) for cokriging; distances in
// pixels, all panels on one distance axis. A cross-variogram can go below
// zero, so each panel's semivariance axis spans what it holds.
// panels: [{ label, color, data: { empirical, fitted, nugget, partialSill } }]
export function gapFillerVariogramSpec(panels, range) {
  const maxDist = Math.max(range, ...panels.flatMap((p) => [maxOf(p.data.empirical.dist), maxOf(p.data.fitted.dist)]));
  const xDomain = [0, maxDist * 1.05];
  const layersFor = (p, single) => {
    const { nugget } = p.data;
    const sill = round4(nugget + p.data.partialSill);
    const gammas = [...p.data.empirical.gamma, ...p.data.fitted.gamma];
    const minGamma = Math.min(0, nugget, ...gammas);
    const maxGamma = Math.max(0, sill, ...gammas);
    const yDomain = [minGamma * 1.05, maxGamma * 1.05];
    return variogramLayers(p.data, {
      nugget, sill, range, unit: "px", xDomain, yDomain, rangeFrom: yDomain[0], rangeTo: yDomain[1],
      pointColor: p.color, lineColor: single ? "#ab502b" : p.color, pointSize: single ? 70 : 45,
      valueTitle: single ? "Semivariance" : "Value"
    });
  };
  if (panels.length === 1) {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      title: "Empirical variogram and fitted model",
      width: "container",
      height: 220,
      autosize: { type: "fit-x", contains: "padding" },
      layer: layersFor(panels[0], true)
    };
  }
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    autosize: { type: "fit-x", contains: "padding" },
    vconcat: panels.map((p) => ({ title: p.label, width: "container", height: 140, layer: layersFor(p, false) }))
  };
}

// Vega-Lite can't put a background behind text: once the chart is drawn,
// each nugget/sill/range label gets a small pale rounded box behind it,
// so it stays readable where the curve or a point crosses it.
export function pillifyReferenceLabels(container) {
  const svg = container.querySelector("svg");
  if (!svg) return;
  for (const text of svg.querySelectorAll("text")) {
    if (!/^(nugget|sill|range) /.test(text.textContent || "")) continue;
    const box = text.getBBox();
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", box.x - 4);
    rect.setAttribute("y", box.y - 2);
    rect.setAttribute("width", box.width + 8);
    rect.setAttribute("height", box.height + 4);
    rect.setAttribute("rx", 3);
    rect.setAttribute("fill", "#fffdf8");
    rect.setAttribute("stroke", "#d8cdb8");
    rect.setAttribute("stroke-width", 1);
    const transform = text.getAttribute("transform");
    if (transform) rect.setAttribute("transform", transform);
    text.parentNode.insertBefore(rect, text);
  }
}

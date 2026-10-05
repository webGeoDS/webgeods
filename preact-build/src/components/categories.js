// The categories a tool colors by (ToolDashboard `categories`: network
// components, classifier classes), declared once. Map paint, legend,
// diagram colors and the "bars" panel all come from here, so a category
// has the same color everywhere: the palette color at its position in
// `values`.

const FALLBACK = "#766851";
const SELECTION_YELLOW = "#ffeb3b"; // same as the map/table selection

// spec: { field, values: (data) => [], label: (value) => string }
export function makeCategories(spec, data) {

  if (!spec) return null;

  const palette = window.WebGeoDS.DEFAULT_PALETTE;
  const values = spec.values(data) ?? [];
  const label = spec.label ?? String;
  const colorOf = (value) => {
    const i = values.indexOf(value);
    return i < 0 ? FALLBACK : palette[i % palette.length];
  };

  return {
    field: spec.field,
    values,
    colorOf,
    // Paint for a layer whose `field` holds one of the values
    // (WebGeoDS.matchPaint options: { fill, line, lineWidth, radius, strokeWidth... }).
    paint: (field, options = {}) => window.WebGeoDS.matchPaint(values, field, { palette, fallback: FALLBACK, ...options }),
    // For a diagram: a feature's color by its own `field` value.
    featureColor: (feature) => colorOf(feature.properties?.[spec.field]),
    legend: values.map((value) => ({ color: colorOf(value), label: label(value) }))
  };

}

// The "bars" side panel: one clickable bar per category, its height
// `counts[i]` for `values[i]`. Keys are strings inside the chart (a
// nominal field); toKey/fromKey convert back to the values' own type,
// so a bar selects { [field]: value } exactly as the map would.
export function barsPanel(panel, categories, data) {

  const counts = panel.counts(data);
  if (!categories || !counts) return null;

  const { field, values, colorOf } = categories;
  const tick = panel.tick ?? ((value) => String(value));
  const rows = values.map((value, i) => ({ key: String(value), tick: tick(value), count: counts[i] }));

  return {
    spec: {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      title: panel.title,
      width: "container",
      height: "container",
      autosize: { type: "fit", contains: "padding" },
      data: { values: rows },
      params: [
        { name: "barSelect", select: { type: "point", fields: ["key"] } },
        { name: "barExternal", value: null }
      ],
      mark: "bar",
      encoding: {
        x: { field: "tick", type: "nominal", title: panel.axis?.x ?? null, sort: null },
        y: { field: "count", type: "quantitative", title: panel.axis?.y ?? null },
        color: {
          condition: { test: "datum.key === barExternal", value: SELECTION_YELLOW },
          field: "key", type: "nominal", legend: null,
          scale: { domain: rows.map((r) => r.key), range: values.map(colorOf) }
        }
      }
    },
    selectParams: ["barSelect"],
    externalParam: "barExternal",
    keyField: "key",
    // A selection on this field lights its bar; any other (one node, say)
    // lights the bar of the first selected feature's category.
    toKey: (selection, features) => {
      const value = selection[field] !== undefined ? selection[field] : features[0]?.properties?.[field];
      return value === undefined ? null : String(value);
    },
    fromKey: (key) => ({ [field]: values.find((value) => String(value) === key) })
  };

}

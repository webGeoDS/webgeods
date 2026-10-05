// Warns in the console about a ToolDashboard config field it doesn't
// know (`selectby` for `selectBy`, say) or a required one that is
// missing: without this a typo just does nothing, silently.

const TOP = ["tool", "cells", "example", "autoCompute", "uploadKind", "languages", "exampleStatus", "inputsFromInspect", "download",
  "inputs", "computeLabel", "busyLabel", "map", "fit", "selectable", "categories", "layers",
  "side", "tables", "stats", "legend", "legendExtra"];
const KNOWN = {
  input: ["kind", "name", "label", "min", "max", "step", "value", "options", "onPick", "width", "placeholder", "size"],
  layer: ["id", "label", "type", "data", "paint", "selectBy", "raster", "render"],
  selectable: ["id", "from", "layer", "paint", "fit"],
  categories: ["field", "values", "label"],
  side: ["id", "placeholder", "panels"],
  diagram: ["kind", "nodes", "links", "color", "idField", "height"],
  chart: ["kind", "spec", "selectParams", "externalParam", "keyField", "toKey", "fromKey", "height"],
  bars: ["kind", "title", "counts", "tick", "axis", "height"],
  carousel: ["kind", "items", "height"],
  table: ["label", "id", "from", "rowClassName", "iconColumns", "emptyMessage"],
  map: ["center", "zoom", "height", "onClick"],
  stats: ["empty", "inspect", "result"]
};

function unknown(object, known, where, problems) {
  for (const key of Object.keys(object ?? {})) {
    if (!known.includes(key)) problems.push(`unknown field "${key}" in ${where}`);
  }
}

export function checkConfig(config) {

  const problems = [];
  const name = config.tool ?? "(no tool)";

  unknown(config, TOP, "the config", problems);
  for (const field of ["tool", "cells", "layers", "stats"]) {
    if (config[field] === undefined) problems.push(`missing "${field}"`);
  }
  if (config.cells && !config.cells.compute && !config.cells.inspect) problems.push(`"cells" needs an inspect or a compute cell`);
  unknown(config.map, KNOWN.map, "map", problems);

  (config.inputs ?? []).forEach((input, i) => unknown(input, KNOWN.input, `inputs[${i}]`, problems));
  unknown(config.selectable, KNOWN.selectable, "selectable", problems);
  unknown(config.categories, KNOWN.categories, "categories", problems);
  unknown(config.side, KNOWN.side, "side", problems);
  (config.side?.panels ?? []).forEach((panel, i) => {
    const known = KNOWN[panel.kind];
    if (!known) problems.push(`side.panels[${i}]: unknown kind "${panel.kind}" (diagram, chart, bars or carousel)`);
    else unknown(panel, known, `side.panels[${i}]`, problems);
    if (panel.kind === "bars" && !config.categories) problems.push(`side.panels[${i}]: a "bars" panel needs "categories"`);
  });
  (config.tables ?? []).forEach((table, i) => unknown(table, KNOWN.table, `tables[${i}]`, problems));
  unknown(config.stats, KNOWN.stats, "stats", problems);

  for (const problem of problems) console.warn(`WebGeoDS ToolDashboard (${name}): ${problem}.`);
  return problems;

}

// Layers come from a function of the data, so they're checked as they
// are produced, once per layer id.
const checkedLayers = new Set();
export function checkLayer(tool, layer) {
  if (checkedLayers.has(layer.id)) return;
  checkedLayers.add(layer.id);
  const problems = [];
  unknown(layer, KNOWN.layer, `layer "${layer.id}"`, problems);
  for (const problem of problems) console.warn(`WebGeoDS ToolDashboard (${tool}): ${problem}.`);
}

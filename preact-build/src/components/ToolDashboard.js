// A whole tool from one config: the page says WHAT to show (inputs,
// layers, side panels, tables, stats, legend), this component holds the
// state and wires the views together. Built on useToolData and the
// components next to it; a tool that doesn't fit can still be written by
// hand with those.
//
// THE SELECTION is a plain { property: value } filter over one feature
// collection, `selectable.from(data)`:
//   { node: 7 }                                     one node
//   { component: 2 }                                every node of a component
//   { heldOut: true, class: "a", predictedClass: "b" }
//   { __key: "<sourceId>:<id>" }                    one feature, by featureKey
// The features it matches are drawn on the selection layer, lit in the
// diagram and the selectable table, and passed to a chart's `toKey`.
// Picking the same selection again clears it; new data clears it too.
//
// config:
//   tool, cells, languages, exampleStatus, inputsFromInspect, download
//                          passed to useToolData
//   inputs                 [{ kind: "slider", name, label, min, max, step, value }
//                           | { kind: "select", name, label, options: [] | (data) => [], value }]
//   computeLabel, busyLabel
//   map                    { center, zoom, height }
//   selectable             { id, from: (data) => FC, layer: "<selection layer id>",
//                            paint: (data) => paint overrides, fit: zoom to a selection }
//   layers(data, ctx)      [{ id, type, data, paint, selectBy: (mapFeature) => selection }]
//                          bottom first; the selection layer goes on top
//   fit                    { inspect: (v) => FC, result: (v) => FC }: zoom on new data
//   side                   { id, placeholder, panels: [
//                            { kind: "diagram", nodes, links, color, idField, height }
//                            | { kind: "chart", spec, selectParams, externalParam, keyField,
//                                toKey: (selection, features) => key, fromKey: (key) => selection, height }
//                          ] }  panels without `height` share the free space
//   tables                 [{ label, from: (data) => FC, id }] — a table whose id is
//                          selectable.id is clickable and shows the selection
//   stats                  { empty: rows, inspect: (v) => rows, result: (v) => rows }
//   legend(data, ctx)      legend items or null
//
// data is { inspect, result }; ctx is { selection, selected } (selected:
// the matched features).
import { useEffect, useMemo, useState } from "preact/hooks";
import { useToolData } from "../hooks/useToolData.js";
import { MapView } from "./MapView.js";
import { ForceGraph } from "./ForceGraph.js";
import { VegaChart } from "./VegaChart.js";
import { DataTable, featureRows, featureKey } from "./DataTable.js";
import { ControlPanel, SelectInput, SliderInput, ComputeButton } from "./ControlPanel.js";
import { StatCard, Legend, MapWithSidePanel, Tabs, DEFAULT_MAP_HEIGHT } from "./Layout.js";

const SELECTION_PAINT = {
  "circle-color": "#ffeb3b",
  "circle-radius": 8,
  "circle-stroke-color": "#2a2117",
  "circle-stroke-width": 1.5
};

const sameSelection = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function matcher(selection, sourceId) {
  const entries = Object.entries(selection);
  return (f, i) => entries.every(([field, value]) =>
    field === "__key" ? featureKey(sourceId, f, i) === value : f.properties?.[field] === value);
}

export function ToolDashboard({ config }) {

  const {
    tool, inputs: inputSpecs = [], map = {}, selectable, side, tables = [],
    stats, fit = {}, computeLabel = "▶ Compute", busyLabel
  } = config;

  const toolData = useToolData({
    tool,
    cells: config.cells,
    languages: config.languages,
    initialInputs: Object.fromEntries(inputSpecs.map((spec) => [spec.name, spec.value])),
    inputsFromInspect: config.inputsFromInspect,
    exampleStatus: config.exampleStatus,
    computeLabel: busyLabel,
    download: config.download
  });
  const { inspect, result, inputs, setInput, busy } = toolData;
  const data = useMemo(() => ({ inspect, result }), [inspect, result]);

  const [selection, setSelection] = useState(null);
  const [fitTo, setFitTo] = useState(null);
  const select = (next) => setSelection((current) => (sameSelection(current, next) ? null : next));

  useEffect(() => setSelection(null), [inspect, result]);
  useEffect(() => { if (inspect && fit.inspect) setFitTo(fit.inspect(inspect)); }, [inspect]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (result && fit.result) setFitTo(fit.result(result)); }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the selection --------------------------------------------------

  const pool = useMemo(() => (selectable ? selectable.from(data) : null), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => {
    if (!selection || !pool) return [];
    return pool.features.filter(matcher(selection, selectable.id));
  }, [selection, pool]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCollection = useMemo(() => ({ type: "FeatureCollection", features: selected }), [selected]);
  const selectedKeys = selected.map((f) => featureKey(selectable.id, f, pool.features.indexOf(f)));
  const ctx = { selection, selected };

  useEffect(() => {
    if (selectable?.fit && selected.length) setFitTo(selectedCollection);
  }, [selectedCollection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- map ------------------------------------------------------------

  const layers = useMemo(() => {
    const list = config.layers(data, ctx).map(({ selectBy, ...layer }) => (
      selectBy ? { ...layer, onClick: (feature) => select(selectBy(feature)) } : layer
    ));
    if (selectable) {
      list.push({
        id: selectable.layer,
        type: "circle",
        data: selectedCollection,
        paint: { ...SELECTION_PAINT, ...(selectable.paint?.(data, ctx) ?? {}) }
      });
    }
    return list;
  }, [data, selection, selectedCollection]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapHeight = map.height ?? DEFAULT_MAP_HEIGHT;
  const mapView = (
    <MapView tool={tool} height={mapHeight} center={map.center} zoom={map.zoom}
      layers={layers} fitTo={fitTo} flushTop={!!side} />
  );

  // ---- side panels -----------------------------------------------------

  const panels = (side?.panels ?? [])
    .map((panel) => renderPanel(panel, data, { selection, selected, select, setSelection }))
    .filter(Boolean);

  const sideContent = panels.length === 0 ? null
    : panels.length === 1 && !panels[0].height ? panels[0].node
      : (
        <div style="display: flex; flex-direction: column; gap: 8px; height: 100%;">
          {panels.map((p) => (
            <div style={`flex: ${p.height ? `0 0 ${p.height}px` : "1 1 auto"}; min-height: 0;`}>{p.node}</div>
          ))}
        </div>
      );

  // ---- tables ------------------------------------------------------------

  const tableViews = tables.map((table) => {
    const rows = featureRows(table.id, table.from(data));
    const clickable = selectable && table.id === selectable.id;
    return {
      label: table.label,
      content: (
        <DataTable columns={rows.columns} rows={rows.rows}
          selectedKeys={clickable ? selectedKeys : undefined}
          onRowClick={clickable ? (row) => select({ __key: row.__key }) : undefined} />
      )
    };
  });

  const statRows = result ? stats.result(result) : inspect ? stats.inspect(inspect) : stats.empty;

  return (
    <div class="webgeods-dashboard">
      <ControlPanel {...toolData.panelProps}>
        {inputSpecs.map((spec) => renderInput(spec, tool, data, inputs, setInput, busy))}
        <ComputeButton label={computeLabel} disabled={!toolData.canCompute} onClick={toolData.compute} />
      </ControlPanel>

      <StatCard rows={statRows} />

      {side
        ? <MapWithSidePanel sideId={side.id} height={mapHeight} placeholder={side.placeholder}
          map={mapView} side={sideContent} />
        : mapView}

      <Legend items={config.legend?.(data, ctx) ?? null} />

      {tableViews.length > 1 && <Tabs tabs={tableViews} />}
      {tableViews.length === 1 && tableViews[0].content}
    </div>
  );

}

function renderInput(spec, tool, data, inputs, setInput, busy) {
  const id = `${tool}-${spec.name}`;
  if (spec.kind === "select") {
    const options = typeof spec.options === "function" ? spec.options(data) : spec.options;
    return <SelectInput id={id} label={spec.label} options={options}
      value={inputs[spec.name]} onChange={setInput(spec.name)} disabled={busy} />;
  }
  return <SliderInput id={id} label={spec.label} min={spec.min} max={spec.max} step={spec.step}
    value={inputs[spec.name]} onChange={setInput(spec.name)} disabled={busy} />;
}

// A panel with nothing to show yet (no result) is left out.
function renderPanel(panel, data, { selection, selected, select, setSelection }) {

  if (panel.kind === "diagram") {
    const nodes = panel.nodes(data);
    const links = panel.links(data);
    if (!nodes || !links) return null;
    const idField = panel.idField;
    return {
      height: panel.height,
      node: (
        <ForceGraph nodes={nodes} links={links} nodeColor={panel.color} linkColor={panel.color}
          selectedIds={selected.map((f) => f.properties[idField])}
          onNodeClick={(id, feature) => select({ [idField]: feature.properties[idField] })} />
      )
    };
  }

  const spec = panel.spec(data);
  if (!spec) return null;
  return {
    height: panel.height,
    node: (
      <VegaChart spec={spec} selectParams={panel.selectParams} externalParam={panel.externalParam}
        keyField={panel.keyField} style={panel.height ? { height: "100%" } : undefined}
        selected={selection ? panel.toKey(selection, selected) : null}
        // The chart's own point selection already toggles: a second click
        // on the same bar reports null.
        onSelect={(key) => setSelection(key == null ? null : panel.fromKey(key))} />
    )
  };

}

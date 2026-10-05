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
//   tool, cells, example, languages, exampleStatus, inputsFromInspect, download
//                          passed to useToolData
//   inputs                 [{ kind: "slider", name, label, min, max, step, value }
//                           | { kind: "select", name, label, options: [] | (data) => [], value }]
//   computeLabel, busyLabel
//   map                    { center, zoom, height }
//   selectable             { id, from: (data) => FC, layer: "<selection layer id>",
//                            paint: (data) => paint overrides, fit: zoom to a selection }
//   categories             { field, values: (data) => [], label: (value) => string }:
//                          what the tool colors by. ctx.categories.paint(field, options)
//                          colors a layer, the legend lists them, a diagram can take
//                          color: "categories", and a "bars" panel charts them
//   layers(data, ctx)      [{ id, label, type, data, paint, selectBy: (mapFeature) => selection }]
//                          bottom first; the selection layer goes on top
//   fit                    { inspect: (v) => FC, result: (v) => FC }: zoom on new data
//   side                   { id, placeholder, panels: [
//                            { kind: "diagram", nodes, links, color, idField, height }
//                            | { kind: "chart", spec, selectParams, externalParam, keyField,
//                                toKey: (selection, features) => key, fromKey: (key) => selection, height }
//                            | { kind: "bars", title, counts: (data) => [one per category],
//                                tick: (value) => axis label, axis: { x, y }, height }
//                          ] }  panels without `height` share the free space
//   tables                 [{ label, from: (data) => FC, id }] — a table whose id is
//                          selectable.id is clickable and shows the selection
//   stats                  { empty: rows, inspect, result }: each a function of the
//                          value returning rows, or a list of rows where a row is
//                          [label, "path.in.value", unit?] (numbers formatted) or a
//                          function of the value returning a row, rows or null
//   legend(data, ctx)      legend items or null; by default the categories, then
//   legendExtra(data, ctx) any extra items
//
// data is { inspect, result }; ctx is { selection, selected, categories }
// (selected: the matched features). Unknown fields are reported in the
// console (configCheck.js); the ToolConfig type below gives VS Code
// autocompletion in a page that declares
//   /** @type {import("../components/ToolDashboard.js").ToolConfig} */

/**
 * @typedef {{ inspect: any, result: any }} ToolData
 * @typedef {Object} ToolConfig
 * @property {string} tool
 * @property {{ inspect: string, compute: string, exportShp?: string, example?: string }} cells
 * @property {string} [example]
 * @property {string[]} [languages]
 * @property {string} [exampleStatus]
 * @property {(inspect: any, inputs: Object) => Object} [inputsFromInspect]
 * @property {{ getFeatures: Function, filenameSuffix: string, defaultFilename: string, shapefile?: Object }} [download]
 * @property {Array<{ kind: "slider" | "select", name: string, label: string, value: any, min?: number, max?: number, step?: number, options?: any[] | ((data: ToolData) => any[]) }>} [inputs]
 * @property {string} [computeLabel]
 * @property {string} [busyLabel]
 * @property {{ center?: [number, number], zoom?: number, height?: string }} [map]
 * @property {{ inspect?: Function, result?: Function }} [fit]
 * @property {{ id: string, from: (data: ToolData) => any, layer: string, paint?: Function, fit?: boolean }} [selectable]
 * @property {{ field: string, values: (data: ToolData) => any[], label?: (value: any) => string }} [categories]
 * @property {(data: ToolData, ctx: Object) => Array<{ id: string, label?: string, type: string, data: any, paint?: Object, selectBy?: Function }>} layers
 * @property {{ id: string, placeholder?: string, panels: Object[] }} [side]
 * @property {Array<{ label: string, id: string, from: (data: ToolData) => any }>} [tables]
 * @property {{ empty: any[], inspect: Function | any[], result: Function | any[] }} stats
 * @property {(data: ToolData, ctx: Object) => (Object[] | null)} [legend]
 * @property {(data: ToolData, ctx: Object) => Object[]} [legendExtra]
 */

import { useEffect, useMemo, useState } from "preact/hooks";
import { useToolData } from "../hooks/useToolData.js";
import { MapView } from "./MapView.js";
import { ForceGraph } from "./ForceGraph.js";
import { VegaChart } from "./VegaChart.js";
import { DataTable, featureRows, featureKey } from "./DataTable.js";
import { ControlPanel, SelectInput, SliderInput, ComputeButton } from "./ControlPanel.js";
import { StatCard, Legend, MapWithSidePanel, Tabs, DEFAULT_MAP_HEIGHT } from "./Layout.js";
import { makeCategories, barsPanel } from "./categories.js";
import { checkConfig, checkLayer } from "./configCheck.js";

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

  useMemo(() => checkConfig(config), [config]);

  const toolData = useToolData({
    tool,
    cells: config.cells,
    example: config.example,
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
  const categories = useMemo(() => makeCategories(config.categories, data), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = { selection, selected, categories };

  useEffect(() => {
    if (selectable?.fit && selected.length) setFitTo(selectedCollection);
  }, [selectedCollection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- map ------------------------------------------------------------

  const layers = useMemo(() => {
    const list = config.layers(data, ctx).map(({ selectBy, ...layer }) => {
      checkLayer(tool, { selectBy, ...layer });
      return selectBy ? { ...layer, onClick: (feature) => select(selectBy(feature)) } : layer;
    });
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

  // What tool-smoke.mjs reads to test any tool from its own config.
  const exposed = (window.WebGeoDS.Preact.tools ??= {});
  exposed[tool] = { config, layers, selectionLayer: selectable?.layer ?? null };

  const mapHeight = map.height ?? DEFAULT_MAP_HEIGHT;
  const mapView = (
    <MapView tool={tool} height={mapHeight} center={map.center} zoom={map.zoom}
      layers={layers} fitTo={fitTo} flushTop={!!side} />
  );

  // ---- side panels -----------------------------------------------------

  // Chart specs only change with the data: a new spec object redraws the
  // chart, which a selection change must not do.
  const charts = useMemo(() => (side?.panels ?? []).map((panel) => {
    if (panel.kind === "bars") return barsPanel(panel, categories, data);
    if (panel.kind === "chart") {
      const spec = panel.spec(data);
      return spec && { ...panel, spec };
    }
    return null;
  }), [data, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const panels = (side?.panels ?? [])
    .map((panel, i) => renderPanel(panel, charts[i], data, { selected, selection, select, setSelection, categories }))
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

  const statRows = result ? statRowsOf(stats.result, result) : inspect ? statRowsOf(stats.inspect, inspect) : stats.empty;

  const legend = config.legend
    ? config.legend(data, ctx)
    : categories?.values.length ? [...categories.legend, ...(config.legendExtra?.(data, ctx) ?? [])] : null;

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

      <Legend items={legend ?? null} />

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

// [label, "path.in.value", unit?] rows, or functions of the value.
function statRowsOf(spec, value) {
  if (typeof spec === "function") return spec(value);
  return spec.flatMap((row) => {
    if (typeof row === "function") {
      const rows = row(value);
      return rows == null ? [] : Array.isArray(rows[0]) ? rows : [rows];
    }
    const [label, path, unit] = row;
    const v = path.split(".").reduce((object, key) => object?.[key], value);
    const text = v == null ? "—" : Number.isInteger(v) ? v.toLocaleString() : String(v);
    return [[label, unit && v != null ? `${text} ${unit}` : text]];
  });
}

// A panel with nothing to show yet (no result) is left out.
function renderPanel(panel, chart, data, { selection, selected, select, setSelection, categories }) {

  if (panel.kind === "diagram") {
    const nodes = panel.nodes(data);
    const links = panel.links(data);
    if (!nodes || !links) return null;
    const idField = panel.idField;
    const color = panel.color === "categories" ? categories?.featureColor : panel.color;
    return {
      height: panel.height,
      node: (
        <ForceGraph nodes={nodes} links={links} nodeColor={color} linkColor={color}
          selectedIds={selected.map((f) => f.properties[idField])}
          onNodeClick={(id, feature) => select({ [idField]: feature.properties[idField] })} />
      )
    };
  }

  if (!chart) return null;
  return {
    height: panel.height,
    node: (
      <VegaChart spec={chart.spec} selectParams={chart.selectParams} externalParam={chart.externalParam}
        keyField={chart.keyField} style={panel.height ? { height: "100%" } : undefined}
        selected={selection ? chart.toKey(selection, selected) : null}
        // The chart's own point selection already toggles: a second click
        // on the same bar reports null.
        onSelect={(key) => setSelection(key == null ? null : chart.fromKey(key))} />
    )
  };

}

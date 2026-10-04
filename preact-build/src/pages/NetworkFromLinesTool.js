// Network from Lines tool (blog/tools/network-from-lines.qmd): the
// interactive layer around the page's hidden Python cells, which build a
// graph from a line layer (nodes at the snapped endpoints, one edge per
// line). Replaces the WebGeoDS.Dashboard config + onResult it had before;
// the cells, prose and URL are unchanged.
//
// One `selection` state drives map, diagram and chart:
//   null
//   { kind: "node", id, component }   a node clicked on the map or diagram
//   { kind: "component", component }  a bar: every node of that component
// A node lights up on map and diagram and its component's bar lights up
// in the chart; a bar lights up every node of the component. The same
// click again clears it.
import { useEffect, useMemo, useState } from "preact/hooks";
import { useToolData } from "../hooks/useToolData.js";
import { MapView } from "../components/MapView.js";
import { ForceGraph } from "../components/ForceGraph.js";
import { VegaChart } from "../components/VegaChart.js";
import { ControlPanel, SliderInput, ComputeButton } from "../components/ControlPanel.js";
import { StatCard, Legend, MapWithSidePanel, DEFAULT_MAP_HEIGHT } from "../components/Layout.js";

const TOOL = "network-from-lines";
const CELLS = {
  example: "network-example-py",
  inspect: "network-inspect-py",
  compute: "network-build-py"
};
const SRC = {
  input: "network-input-py",
  edges: "network-edges-py",
  nodes: "network-nodes-py",
  selection: "network-selection"
};
const EMPTY_STATS = [["—", "Upload a file or load the example above"]];

const sameSelection = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const paletteColor = (i) => window.WebGeoDS.DEFAULT_PALETTE[i % window.WebGeoDS.DEFAULT_PALETTE.length];
const componentColor = (feature) => paletteColor(feature.properties.component ?? 0);

export function NetworkFromLinesTool() {

  const tool = useToolData({
    tool: TOOL,
    cells: CELLS,
    initialInputs: { snapTolerance: 0 },
    exampleStatus: "✓ example data loaded — try Build Graph, then raise the snap tolerance.",
    computeLabel: "⌛ Building...",
    download: {
      // Nodes and edges in one file, tagged so they're one filter apart
      // in QGIS or similar.
      getFeatures: (result) => ({
        type: "FeatureCollection",
        features: [
          ...result.nodes.features.map((f) => ({ ...f, properties: { ...f.properties, kind: "node" } })),
          ...result.edges.features.map((f) => ({ ...f, properties: { ...f.properties, kind: "edge" } }))
        ]
      }),
      filenameSuffix: "-graph.geojson",
      defaultFilename: "network-graph.geojson"
    }
  });
  const { inspect, result, inputs, setInput, busy } = tool;

  const [selection, setSelection] = useState(null);
  const [fitTo, setFitTo] = useState(null);
  const select = (next) => setSelection((current) => (sameSelection(current, next) ? null : next));

  // New data clears the selection; the map zooms to the lines on inspect
  // and to the built graph after Build graph.
  useEffect(() => setSelection(null), [inspect, result]);
  useEffect(() => setFitTo(inspect?.features ?? null), [inspect]);
  useEffect(() => { if (result) setFitTo(result.edges); }, [result]);

  const selectNode = (id, component) => select({ kind: "node", id: Number(id), component });

  // ---- what the selection covers --------------------------------------

  const selectedNodes = useMemo(() => {
    if (!selection || !result) return [];
    return result.nodes.features.filter((f) =>
      selection.kind === "node" ? f.properties.node === selection.id : f.properties.component === selection.component
    );
  }, [selection, result]);

  const selectedIds = useMemo(() => selectedNodes.map((f) => f.properties.node), [selectedNodes]);
  const chartKey = selection ? String(selection.component) : null;

  // ---- map layers, bottom to top ----------------------------------------

  const layers = useMemo(() => {
    const list = [{ id: SRC.input, type: "line", data: inspect?.features ?? null }];
    if (result) {
      list.push(
        {
          id: SRC.edges, type: "line", data: result.edges,
          paint: window.WebGeoDS.matchPaint(result.componentIds, "component", { line: true, lineWidth: 3 })
        },
        {
          id: SRC.nodes, type: "circle", data: result.nodes,
          paint: window.WebGeoDS.matchPaint(result.componentIds, "component", { radius: 5 }),
          onClick: (feature) => selectNode(feature.properties.node, feature.properties.component)
        }
      );
    }
    list.push({
      id: SRC.selection, type: "circle",
      data: { type: "FeatureCollection", features: selectedNodes },
      paint: { "circle-color": "#ffeb3b", "circle-radius": 8, "circle-stroke-color": "#2a2117", "circle-stroke-width": 1.5 }
    });
    return list;
  }, [inspect, result, selectedNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- stats, legend, chart -----------------------------------------------

  const stats = result ? graphStats(result.summary) : inspect ? inspectStats(inspect) : EMPTY_STATS;
  const legend = result
    ? result.componentIds.map((id, i) => ({ color: paletteColor(i), label: `Component ${id + 1}` }))
    : null;
  const chartSpec = useMemo(() => (result ? componentChartSpec(result.componentSizes) : null), [result]);

  return (
    <div class="webgeods-dashboard">
      <ControlPanel {...tool.panelProps}>
        <SliderInput id={`${TOOL}-snapTolerance`} label="Snap tolerance (m)" min={0} max={20} step={1}
          value={inputs.snapTolerance} onChange={setInput("snapTolerance")} disabled={busy} />
        <ComputeButton label="▶ Build graph" disabled={!tool.canCompute} onClick={tool.compute} />
      </ControlPanel>

      <StatCard rows={stats} />

      <MapWithSidePanel
        sideId="nfl-diagram"
        height={DEFAULT_MAP_HEIGHT}
        map={<MapView tool={TOOL} height={DEFAULT_MAP_HEIGHT} center={[12.46, 41.906]} zoom={14}
          layers={layers} fitTo={fitTo} flushTop />}
        side={result && (
          // The topology diagram takes the free height; the component-size
          // chart sits under it at a fixed 160px.
          <div style="display: flex; flex-direction: column; gap: 8px; height: 100%;">
            <div style="flex: 1 1 auto; min-height: 0;">
              <ForceGraph nodes={result.nodes} links={result.edges}
                nodeColor={componentColor} linkColor={componentColor}
                selectedIds={selectedIds}
                onNodeClick={(id, feature) => selectNode(id, feature.properties.component)} />
            </div>
            <div style="flex: 0 0 160px; min-height: 0;">
              <VegaChart spec={chartSpec} selectParams={["componentSelect"]}
                externalParam="componentExternal" keyField="component"
                style={{ height: "100%" }}
                selected={chartKey}
                onSelect={(component) => setSelection(component == null ? null : { kind: "component", component: Number(component) })} />
            </div>
          </div>
        )}
      />

      <Legend items={legend} />
    </div>
  );

}

function inspectStats(value) {
  const s = value.summary;
  const rows = [["Lines", s ? s.count.toLocaleString() : "—"]];
  if (s && s.dropped > 0) rows.push(["Non-line features skipped", s.dropped]);
  if (value.crsWarning) rows.push(["CRS", value.crsWarning]);
  return rows;
}

function graphStats(s) {
  return [
    ["Nodes", s.nodes.toLocaleString()],
    ["Edges", s.edges.toLocaleString()],
    ["Connected components", s.components],
    ["Largest component (nodes)", s.largestComponentNodes],
    ["Dead ends (degree 1)", s.deadEnds],
    ["Intersections (degree ≥ 3)", s.intersections],
    ["Mean degree", s.meanDegree],
    ["Total length", `${s.totalLengthKm} km`],
    ["Snap tolerance", `${s.snapTolerance} m`],
    ["Calculation CRS", s.calculationCrs]
  ];
}

// "Nodes per component", one bar per component in size order, clickable.
// Component values stay strings ("0", "1"...) in the chart: the field is
// nominal; the axis labels convert to a number before adding 1
// ("0" + 1 would read "#01").
function componentChartSpec(componentSizes) {
  const rows = componentSizes.map((size, rank) => ({ component: String(rank), size }));
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: "Nodes per component",
    width: "container",
    height: "container",
    autosize: { type: "fit", contains: "padding" },
    data: { values: rows },
    params: [
      { name: "componentSelect", select: { type: "point", fields: ["component"] } },
      { name: "componentExternal", value: null }
    ],
    mark: "bar",
    encoding: {
      x: { field: "component", type: "nominal", title: "Component", sort: null,
        axis: { labelExpr: "'#' + (toNumber(datum.value) + 1)" } },
      y: { field: "size", type: "quantitative", title: "Nodes" },
      color: {
        condition: { test: "datum.component === componentExternal", value: "#ffeb3b" },
        field: "component", type: "nominal", legend: null,
        scale: { domain: rows.map((r) => r.component), range: rows.map((_, i) => paletteColor(i)) }
      }
    }
  };
}

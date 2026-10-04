// Spatial Classifier tool (blog/tools/spatial-classifier.qmd): the
// interactive layer around the page's hidden Python cells. Replaces the
// WebGeoDS.Dashboard config + onResult + OJS cells it had before; the
// cells, prose and URL are unchanged.
//
// One `selection` state drives map, chart and table:
//   null
//   { kind: "point", key, cls }                  a map dot or a table row
//   { kind: "class", cls }                       a bar: every point of a class
//   { kind: "pair", trueClass, predictedClass }  a matrix cell: the held-out
//                                                points behind it
// Selecting the same thing again clears it; any selection zooms to its
// points (the behavior of the shared table engine this replaces).
import { useEffect, useMemo, useState } from "preact/hooks";
import { useCellRunner } from "../hooks/useCellRunner.js";
import { MapView } from "../components/MapView.js";
import { DataTable, featureRows, featureKey } from "../components/DataTable.js";
import { VegaChart } from "../components/VegaChart.js";
import { ControlPanel, SelectInput, SliderInput, ComputeButton } from "../components/ControlPanel.js";
import { StatCard, Legend, MapWithSidePanel, Tabs, Portal, DEFAULT_MAP_HEIGHT } from "../components/Layout.js";
import { classifierChartSpec, chartKeyFor, selectionFromChartKey } from "./spatialClassifierChart.js";

const TOOL = "spatial-classifier";
const CELLS = {
  example: "spatial-classifier-example-py",
  inspect: "spatial-classifier-inspect-py",
  compute: "spatial-classifier-compute-py",
  exportShp: "spatial-classifier-export-shp-py"
};
const SRC = {
  grid: "spatial-classifier-grid-py",
  blocks: "spatial-classifier-blocks-py",
  points: "spatial-classifier-training-py",
  selection: "spatial-classifier-selection"
};
const HOLDOUT_OPTIONS = ["Spatial blocks", "Random points"];
const EMPTY_STATS = [["Points", "—"], ["—", "Upload a point GeoJSON/Shapefile or load the example above"]];
const EXAMPLE_STATUS = "✓ example data loaded — pick the class column and Compute below.";

// Same as WebGeoDS.Map's default circle style: uploaded, not yet classified.
const INSPECT_POINT_PAINT = {
  "circle-radius": 6,
  "circle-color": "#b0522c",
  "circle-stroke-width": 1,
  "circle-stroke-color": "#f3ede1"
};

const sameSelection = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function SpatialClassifierTool({ tablesTarget = "#sc-tables" }) {

  const runner = useCellRunner();
  const [inspect, setInspect] = useState(null);   // inspect cell value
  const [result, setResult] = useState(null);     // compute cell value
  const [files, setFiles] = useState(null);
  const [uploadKind, setUploadKind] = useState(null);
  const [selection, setSelectionRaw] = useState(null);
  const [fitTo, setFitTo] = useState(null);
  const [inputs, setInputs] = useState({
    classColumn: "", holdout: HOLDOUT_OPTIONS[0], nTrees: 100, gridResolution: 20
  });

  const select = (next) => setSelectionRaw((current) => (sameSelection(current, next) ? null : next));
  const setInput = (name) => (value) => setInputs((current) => ({ ...current, [name]: value }));

  // ---- running the cells ---------------------------------------------

  const runInspect = async () => {
    const value = await runner.runCell(CELLS.inspect);
    const columns = value?.summary?.columns ?? [];
    setInspect(value);
    setResult(null);
    setSelectionRaw(null);
    setFitTo(value?.features ?? null);
    setInputs((current) => ({ ...current, classColumn: columns.includes("class") ? "class" : (columns[0] ?? "") }));
  };

  const loadExample = () => runner.queue("⌛ Loading example...", async () => {
    await runner.runCell(CELLS.example);
    setUploadKind("geojson");
    await runInspect();
    return EXAMPLE_STATUS;
  });

  const handleFiles = (fileList) => runner.queue("⌛ Loading...", async () => {
    const loaded = await window.WebGeoDS.Upload.load(fileList, { languages: ["python"] });
    setFiles(fileList);
    if (!loaded.ok) return loaded.message;
    setUploadKind(loaded.kind);
    await runInspect();
    return loaded.message;
  });

  const compute = () => runner.queue("⌛ Training...", async () => {
    const value = await runner.runCell(CELLS.compute, inputs);
    setResult(value);
    setSelectionRaw(null);
    window.WebGeoDS.track?.("validation_completed", { tool: TOOL });
    return "✓ Done.";
  });

  const reset = () => runner.queue("Resetting...", async () => {
    setInspect(null);
    setResult(null);
    setFiles(null);
    setUploadKind(null);
    setSelectionRaw(null);
    return window.WebGeoDS.Upload.defaultStatus;
  });

  // ---- what the selection covers ---------------------------------------

  const points = result?.trainingFeatures ?? inspect?.features ?? null;

  const selectedPoints = useMemo(() => {
    if (!selection || !points) return [];
    const matches = {
      point: (f, i) => featureKey(SRC.points, f, i) === selection.key,
      class: (f) => f.properties.class === selection.cls,
      pair: (f) => f.properties.heldOut === true &&
        f.properties.class === selection.trueClass &&
        f.properties.predictedClass === selection.predictedClass
    }[selection.kind];
    return points.features.filter(matches);
  }, [selection, points]);

  const selectedCollection = useMemo(
    () => ({ type: "FeatureCollection", features: selectedPoints }),
    [selectedPoints]
  );

  const selectPoint = (feature, index) => select({
    kind: "point",
    key: featureKey(SRC.points, feature, index),
    cls: feature.properties.class
  });

  // ---- map layers ------------------------------------------------------

  const summary = result?.summary;
  const blocksMode = (summary?.heldOutBlockCount ?? 0) > 0;
  // A matrix cell selects only held-out points: fade the training ones so
  // they don't compete with them. Not for a class: it includes both.
  const fadeTraining = selection?.kind === "pair";

  const layers = useMemo(() => {

    const pointLayer = {
      id: SRC.points,
      type: "circle",
      data: points,
      // MapLibre hands back its own copy of the feature, with a numeric
      // id; featureKey normalizes both sides to the same key.
      onClick: (feature) => {
        const key = featureKey(SRC.points, feature, -1);
        const index = points.features.findIndex((f, i) => featureKey(SRC.points, f, i) === key);
        if (index >= 0) selectPoint(points.features[index], index);
      }
    };

    const selectionLayer = {
      id: SRC.selection,
      type: "circle",
      data: selectedCollection,
      paint: {
        "circle-color": "#ffeb3b",
        "circle-radius": 8,
        "circle-stroke-color": "#2a2117",
        // The thick ring marks held-out points in random mode only, as
        // on the points layer; in blocks mode the dashed blocks do.
        "circle-stroke-width": blocksMode ? 0 : ["case", ["==", ["get", "heldOut"], true], 3, 0]
      }
    };

    if (!summary) {
      return [{ ...pointLayer, paint: INSPECT_POINT_PAINT }, selectionLayer];
    }

    const palette = window.WebGeoDS.DEFAULT_PALETTE;
    const labels = summary.classLabels;

    return [
      {
        id: SRC.grid,
        type: "fill",
        data: result.gridFeatures,
        paint: {
          ...window.WebGeoDS.matchPaint(labels, "predictedClass", { palette, fill: true, strokeWidth: 1.5 }),
          // Opacity carries the forest's confidence: nearly transparent
          // at 1/n_classes (trees split evenly), solid where all agree.
          "fill-opacity": ["interpolate", ["linear"], ["get", "confidence"], 1 / labels.length, 0.08, 1, 0.6]
        }
      },
      {
        id: SRC.blocks,
        type: "line",
        data: result.heldOutBlockFeatures,
        paint: { "line-color": "#2a2117", "line-width": 2, "line-dasharray": [2, 1.5] }
      },
      {
        ...pointLayer,
        paint: {
          ...window.WebGeoDS.matchPaint(labels, "class", { palette, strokeWidth: 1.5 }),
          "circle-stroke-width": blocksMode ? 1.5 : ["case", ["==", ["get", "heldOut"], true], 3, 1.5],
          "circle-opacity": fadeTraining ? ["case", ["==", ["get", "heldOut"], true], 1, 0.12] : 1
        }
      },
      selectionLayer
    ];

  }, [points, result, selectedCollection, blocksMode, fadeTraining]); // eslint-disable-line react-hooks/exhaustive-deps

  // New data zooms to the data; a selection zooms to what it covers;
  // clearing a selection leaves the view where it is.
  useEffect(() => {
    if (selectedPoints.length) setFitTo(selectedCollection);
  }, [selectedCollection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- stats, legend, chart, tables --------------------------------------

  const stats = summary ? computeStats(summary) : inspect ? inspectStats(inspect) : EMPTY_STATS;

  const legend = summary ? [
    ...summary.classLabels.map((label, i) => ({
      color: window.WebGeoDS.DEFAULT_PALETTE[i % window.WebGeoDS.DEFAULT_PALETTE.length],
      label
    })),
    // One "held out" entry, drawn the way the map draws it in this mode.
    blocksMode
      ? { color: "#2a2117", label: "held out for testing (points inside)", outline: "dashed" }
      : { color: "#2a2117", label: "held out for testing", outline: true, shape: "circle" }
  ] : null;

  const chartSpec = useMemo(() => (summary ? classifierChartSpec(summary) : null), [summary]);

  const pointTable = featureRows(SRC.points, points);
  const gridTable = featureRows(SRC.grid, result?.gridFeatures);
  const selectedKeys = selectedPoints.map((f) => featureKey(SRC.points, f, points.features.indexOf(f)));

  const columns = inspect?.summary?.columns ?? [];
  const canCompute = !!inspect && !runner.busy;

  return (
    <div class="webgeods-dashboard">
      <ControlPanel
        upload={{ label: "📁 Upload", kind: "vector", onFiles: handleFiles }}
        example={{ onClick: loadExample }}
        download={{
          enabled: !!result,
          getFeatures: () => result?.originalCrsFeatures ?? null,
          getBaseName: () => window.WebGeoDS.Upload.baseName(files),
          filenameSuffix: "-classified-surface.geojson",
          defaultFilename: "classified-surface.geojson",
          tool: TOOL,
          uploadKind,
          shapefile: {
            cellId: CELLS.exportShp,
            filenameSuffix: "-classified-surface.zip",
            defaultFilename: "classified-surface-shapefile.zip"
          }
        }}
        onReset={reset}
        status={runner.status}
        busy={runner.busy}
      >
        <SelectInput id={`${TOOL}-classColumn`} label="Class column:" options={columns}
          value={inputs.classColumn} onChange={setInput("classColumn")} disabled={runner.busy} />
        {/* Blocks first and default: the cautious estimate for a map. */}
        <SelectInput id={`${TOOL}-holdout`} label="Held out:" options={HOLDOUT_OPTIONS}
          value={inputs.holdout} onChange={setInput("holdout")} disabled={runner.busy} />
        <SliderInput id={`${TOOL}-nTrees`} label="Trees" min={10} max={300} step={10}
          value={inputs.nTrees} onChange={setInput("nTrees")} disabled={runner.busy} />
        <SliderInput id={`${TOOL}-gridResolution`} label="Grid resolution" min={10} max={40} step={5}
          value={inputs.gridResolution} onChange={setInput("gridResolution")} disabled={runner.busy} />
        <ComputeButton disabled={!canCompute} onClick={compute} />
      </ControlPanel>

      <StatCard rows={stats} />

      <MapWithSidePanel
        sideId="sc-chart"
        height={DEFAULT_MAP_HEIGHT}
        map={<MapView tool={TOOL} height={DEFAULT_MAP_HEIGHT} layers={layers} fitTo={fitTo} flushTop />}
        side={chartSpec && (
          <VegaChart
            spec={chartSpec}
            selectParams={["classSelectDist", "classSelectAcc"]}
            externalParam="classExternal"
            keyField="key"
            selected={chartKeyFor(selection)}
            onSelect={(key) => setSelectionRaw(selectionFromChartKey(key))}
          />
        )}
      />

      <Legend items={legend} />

      <Portal target={tablesTarget}>
        <Tabs tabs={[
          {
            label: "Training points",
            content: <DataTable columns={pointTable.columns} rows={pointTable.rows} selectedKeys={selectedKeys}
              onRowClick={(row) => {
                const index = pointTable.rows.indexOf(row);
                selectPoint(points.features[index], index);
              }} />
          },
          {
            label: "Classification areas",
            content: <DataTable columns={gridTable.columns} rows={gridTable.rows} />
          }
        ]} />
      </Portal>
    </div>
  );

}

function inspectStats(value) {
  const s = value.summary;
  if (!s) return EMPTY_STATS;
  const rows = [
    ["Points", s.count.toLocaleString()],
    ["Original CRS", s.crs === "None" || !s.crs ? "Unknown" : s.crs]
  ];
  if (value.crsWarning) rows.push(["CRS warning", value.crsWarning]);
  return rows;
}

function computeStats(r) {
  // Python's None arrives as `undefined`, not `null`: loose equality
  // catches both.
  const pct = (x, digits = 0) => (x == null ? "N/A" : `${(x * 100).toFixed(digits)}%`);
  const metres = (x) => (x == null ? "N/A" : `${Math.round(x).toLocaleString()} m`);
  const rows = [
    ["Points", r.count.toLocaleString()],
    ["Original CRS", r.crs === "None" || !r.crs ? "Unknown" : r.crs],
    ["Calculation CRS", r.calculationCrs],
    ["Class column", r.classColumn],
    ["Classes found", r.classLabels.join(", ")],
    ["Labeled points", r.labeledCount.toLocaleString()]
  ];
  if (r.excludedCount > 0) {
    rows.push(["Excluded from training", `${r.excludedCount} (too far from the calculation UTM zone to project)`]);
  }
  rows.push([
    "Held out",
    r.testCount === 0 ? "—"
      : r.holdout === "Spatial blocks"
        ? `${r.testCount} points in ${r.heldOutBlockCount} of ${r.blocksPerSide * r.blocksPerSide} blocks (dashed on the map)`
        : `${r.testCount} random points`
  ]);
  rows.push(["Train / test split", r.testCount > 0 ? `${r.trainCount} / ${r.testCount}` : `${r.trainCount} / — (too few points to hold out)`]);
  rows.push(["Test accuracy", pct(r.accuracy, 1)]);
  rows.push(["5-fold CV accuracy", `random points ${pct(r.cvRandom)} · spatial blocks ${pct(r.cvBlocks)}`]);
  rows.push([
    "Distance to nearest sample",
    `map cells ${metres(r.distanceMap)} · random test ${metres(r.distanceRandom)} · block test ${metres(r.distanceBlocks)} (medians)`
  ]);
  rows.push(["Trees", r.nTrees]);
  rows.push(["Grid cells", r.gridCellCount.toLocaleString()]);
  rows.push(["Mean confidence", pct(r.meanConfidence)]);
  rows.push([
    "Uncertain cells",
    `${r.uncertainCellCount.toLocaleString()} (${(r.uncertainCellCount / r.gridCellCount * 100).toFixed(0)}%) under ${(r.uncertainBelow * 100).toFixed(0)}% agreement`
  ]);
  return rows;
}

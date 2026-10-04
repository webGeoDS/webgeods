// The data lifecycle every tool shares, the part WebGeoDS.Dashboard
// handled for Dashboard tools (shared/dashboard.js loadExample,
// handleFiles, _runInspectInner, runCompute, reset): load the example or
// an upload, run the inspect cell on it, run the compute cell with the
// current inputs, reset. A tool page keeps only what is its own (layers,
// stats, charts, selection) and spreads `panelProps` onto ControlPanel.
//
//   const tool = useToolData({
//     tool: "spatial-classifier",
//     cells: { example, inspect, compute, exportShp },  // exportShp optional
//     initialInputs: { nTrees: 100, ... },
//     inputsFromInspect: (inspectValue, inputs) => ({ ...inputs, classColumn: ... }),
//     exampleStatus: "✓ example data loaded — ...",
//     computeLabel: "⌛ Training...",
//     download: { getFeatures: (result) => ..., filenameSuffix, defaultFilename,
//                 shapefile: { filenameSuffix, defaultFilename } }
//   });
//   tool.inspect / tool.result   latest inspect / compute cell values
//   tool.inputs, tool.setInput(name)(value)
//   tool.compute(), tool.canCompute, tool.busy
//   <ControlPanel {...tool.panelProps}>...inputs...</ControlPanel>
//
// New data clears the previous result; a page that keeps state derived
// from them (a selection, a zoom target) resets it with an effect on
// tool.inspect / tool.result.
import { useState } from "preact/hooks";
import { useCellRunner } from "./useCellRunner.js";

export function useToolData({
  tool,
  cells,
  languages = ["python"],
  uploadLabel = "📁 Upload",
  uploadKind: uploadControlKind = "vector",
  initialInputs = {},
  inputsFromInspect,
  exampleStatus = "✓ example data loaded — ready to compute below.",
  computeLabel = "⌛ Working...",
  doneStatus = "✓ Done.",
  download
}) {

  const runner = useCellRunner();
  const [inspect, setInspect] = useState(null);
  const [result, setResult] = useState(null);
  const [files, setFiles] = useState(null);
  const [kind, setKind] = useState(null);
  const [inputs, setInputs] = useState(initialInputs);

  const setInput = (name) => (value) => setInputs((current) => ({ ...current, [name]: value }));

  // Runs inside a queued step: new data, so any previous result is stale.
  const runInspect = async () => {
    const value = await runner.runCell(cells.inspect);
    setInspect(value);
    setResult(null);
    if (inputsFromInspect) setInputs((current) => inputsFromInspect(value, current));
  };

  const loadExample = () => runner.queue("⌛ Loading example...", async () => {
    await runner.runCell(cells.example);
    setKind("geojson");
    await runInspect();
    return exampleStatus;
  });

  const handleFiles = (fileList) => runner.queue("⌛ Loading...", async () => {
    const loaded = await window.WebGeoDS.Upload.load(fileList, { languages });
    setFiles(fileList);
    if (!loaded.ok) return loaded.message;
    setKind(loaded.kind);
    await runInspect();
    return loaded.message;
  });

  const compute = () => runner.queue(computeLabel, async () => {
    // Inputs reach the cell through `#| inject:` (window[name]).
    setResult(await runner.runCell(cells.compute, inputs));
    window.WebGeoDS.track?.("validation_completed", { tool });
    return doneStatus;
  });

  const reset = () => runner.queue("Resetting...", async () => {
    setInspect(null);
    setResult(null);
    setFiles(null);
    setKind(null);
    return window.WebGeoDS.Upload.defaultStatus;
  });

  const panelProps = {
    upload: { label: uploadLabel, kind: uploadControlKind, onFiles: handleFiles },
    example: cells.example ? { onClick: loadExample } : undefined,
    download: download && {
      enabled: !!result,
      getFeatures: () => (result ? download.getFeatures(result) : null),
      getBaseName: () => window.WebGeoDS.Upload.baseName(files),
      filenameSuffix: download.filenameSuffix,
      defaultFilename: download.defaultFilename,
      tool,
      uploadKind: kind,
      shapefile: download.shapefile && cells.exportShp
        ? { cellId: cells.exportShp, ...download.shapefile }
        : undefined
    },
    onReset: reset,
    status: runner.status,
    busy: runner.busy
  };

  return {
    inspect,
    result,
    inputs,
    setInput,
    compute,
    canCompute: !!inspect && !runner.busy,
    busy: runner.busy,
    status: runner.status,
    panelProps
  };

}

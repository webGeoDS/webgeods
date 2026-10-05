// The data lifecycle every tool shares, the part WebGeoDS.Dashboard
// handled for Dashboard tools (shared/dashboard.js loadExample,
// handleFiles, _runInspectInner, runCompute, reset): load the example or
// an upload, run the inspect cell on it, run the compute cell with the
// current inputs, reset. A tool page keeps only what is its own (layers,
// stats, charts, selection) and spreads `panelProps` onto ControlPanel.
//
//   const tool = useToolData({
//     tool: "spatial-classifier",
//     example: "/examples/....geojson",  // the example data, a file on the site
//     cells: { inspect, compute, exportShp },  // each optional; an `example`
//                                              // cell instead of the file
//                                              // still works
//     autoCompute: false,          // true: compute right after every load
//     initialInputs: { nTrees: 100, ... },
//     inputsFromInspect: (inspectValue, inputs) => ({ ...inputs, classColumn: ... }),
//     exampleStatus: "✓ example data loaded — ...",
//     computeLabel: "⌛ Training...",
//     download: { getFeatures: (result) => ..., filenameSuffix, defaultFilename,
//                 shapefile: { filenameSuffix, defaultFilename } }
//       or, for a file a cell writes (a GeoTIFF, a reprojected file):
//               { cell, label, filename: (baseName, inputs) => name, mimeType,
//                 after: "result" | "inspect", inputs: (data, inputs) => extra injected values }
//   });
//   tool.inspect / tool.result   latest inspect / compute cell values
//   tool.resultInputs            the inputs that result was computed with
//   tool.inputs, tool.setInput(name)(value), tool.setInputs(fn)
//   tool.compute(), tool.canCompute, tool.busy
//   <ControlPanel {...tool.panelProps}>...inputs...</ControlPanel>
//
// Without an inspect cell, a load makes `inspect` an empty object, so
// compute is enabled once there is data. New data clears the previous
// result; a page that keeps state derived from them (a selection, a zoom
// target) resets it with an effect on tool.inspect / tool.result.
import { useRef, useState } from "preact/hooks";
import { useCellRunner } from "./useCellRunner.js";

const base64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function useToolData({
  tool,
  cells,
  example,
  autoCompute = false,
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
  const [resultInputs, setResultInputs] = useState(null);
  const [files, setFiles] = useState(null);
  const [kind, setKind] = useState(null);
  const [inputs, setInputs] = useState(initialInputs);
  // The inputs as of the latest render, for steps queued before a
  // re-render (an automatic compute right after inspect).
  const latestInputs = useRef(inputs);
  latestInputs.current = inputs;

  const setInput = (name) => (value) => setInputs((current) => ({ ...current, [name]: value }));

  // Inputs reach the cells through `#| inject:` (window[name]).
  const runCompute = async (currentInputs) => {
    const value = await runner.runCell(cells.compute, currentInputs);
    setResultInputs(currentInputs);
    setResult(value);
    window.WebGeoDS.track?.("validation_completed", { tool });
  };

  // Runs inside a queued step: new data, so any previous result is stale.
  const runInspect = async () => {
    const value = cells.inspect ? await runner.runCell(cells.inspect) : {};
    setInspect(value);
    setResult(null);
    let nextInputs = latestInputs.current;
    if (inputsFromInspect) {
      nextInputs = inputsFromInspect(value, nextInputs);
      setInputs(nextInputs);
    }
    if (autoCompute && cells.compute) await runCompute(nextInputs);
  };

  // The example file goes through the same path as an upload, but
  // `files` stays null: downloads keep the tool's default filename.
  const loadExample = () => runner.queue("⌛ Loading example...", async () => {
    if (example) {
      const response = await fetch(example);
      if (!response.ok) throw new Error(`Example file ${example}: HTTP ${response.status}`);
      const file = new File([await response.blob()], example.split("/").pop());
      const loaded = await window.WebGeoDS.Upload.load([file], { languages });
      if (!loaded.ok) return loaded.message;
      setKind(loaded.kind);
    } else {
      await runner.runCell(cells.example);
      setKind("geojson");
    }
    setFiles(null);
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
    await runCompute(inputs);
    return doneStatus;
  });

  const reset = () => runner.queue("Resetting...", async () => {
    setInspect(null);
    setResult(null);
    setFiles(null);
    setKind(null);
    return window.WebGeoDS.Upload.defaultStatus;
  });

  // A file written by a cell: run it, decode its base64 value, save it.
  const downloadFromCell = () => runner.queue("⌛ Preparing download...", async () => {
    const extra = download.inputs ? download.inputs({ inspect, result }, inputs) : {};
    const b64 = await runner.runCell(download.cell, { ...inputs, ...extra });
    const base = window.WebGeoDS.Upload.baseName(files);
    window.WebGeoDS.downloadBlob(base64ToBytes(b64), download.filename(base, inputs), download.mimeType ?? "application/octet-stream", { tool });
    return "✓ Downloaded.";
  });

  const downloadReady = download?.after === "inspect" ? !!inspect : !!result;

  const panelProps = {
    upload: { label: uploadLabel, kind: uploadControlKind, onFiles: handleFiles },
    example: example || cells.example ? { onClick: loadExample } : undefined,
    download: download && !download.cell && {
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
    cellDownload: download?.cell && {
      label: download.label ?? "⬇ Download",
      enabled: downloadReady,
      onClick: downloadFromCell
    },
    onReset: reset,
    status: runner.status,
    busy: runner.busy
  };

  return {
    inspect,
    result,
    resultInputs,
    inputs,
    setInput,
    setInputs,
    compute,
    canCompute: !!cells.compute && !!inspect && !runner.busy,
    busy: runner.busy,
    status: runner.status,
    panelProps
  };

}

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
//                 shapefile: { filenameSuffix, defaultFilename },
//                 after: "inspect" (getFeatures gets the inspect value: a tool
//                 that only inspects), enabled: (data) => boolean }
//       or, for a file a cell writes (a GeoTIFF, a reprojected file):
//               { cell, label, after: "result" | "inspect",
//                 enabled: (data) => boolean (default: there is a result / inspect),
//                 inputs: (data, inputs, { uploadKind }) => extra injected values,
//                 filename: (baseName, inputs) => name, mimeType   (the cell
//                   returns base64), or
//                 file: (value, baseName, inputs) => { content, filename, mimeType }
//                   (the cell returns anything else) }
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

export const base64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

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
    // A tool that only inspects: the inspection is its result.
    if (cells.inspect && !cells.compute) window.WebGeoDS.track?.("validation_completed", { tool });
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
    const extra = download.inputs ? download.inputs({ inspect, result }, inputs, { uploadKind: kind }) : {};
    const value = await runner.runCell(download.cell, { ...inputs, ...extra });
    const base = window.WebGeoDS.Upload.baseName(files);
    const file = download.file
      ? download.file(value, base, inputs)
      : { content: base64ToBytes(value), filename: download.filename(base, inputs), mimeType: download.mimeType };
    window.WebGeoDS.downloadBlob(file.content, file.filename, file.mimeType ?? "application/octet-stream", { tool });
    return "✓ Downloaded.";
  });

  const downloadReady = download?.enabled
    ? !!download.enabled({ inspect, result })
    : download?.after === "inspect" ? !!inspect : !!result;

  const panelProps = {
    upload: { label: uploadLabel, kind: uploadControlKind, onFiles: handleFiles },
    example: example || cells.example ? { onClick: loadExample } : undefined,
    download: download && !download.cell && {
      enabled: downloadReady,
      getFeatures: () => {
        const source = download.after === "inspect" ? inspect : result;
        return source ? download.getFeatures(source) : null;
      },
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

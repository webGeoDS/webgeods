// The data lifecycle every tool shares: load the example or
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
//     autoCompute: false,          // true, or (inspectValue) => boolean:
//                                  // compute right after a load
//     initialInputs: { nTrees: 100, ... },
//     inputsFromInspect: (inspectValue, inputs) => ({ ...inputs, classColumn: ... }),
//     exampleStatus: "✓ example data loaded — ...",
//     computeLabel: "⌛ Training...",
//     download: { getFeatures: (result, { inspect, result }) => ..., filenameSuffix, defaultFilename,
//                 shapefile: { filenameSuffix, defaultFilename },
//                 after: "inspect" (enabled once inspected; getFeatures gets the
//                 result if there is one, else the inspect value), enabled: (data) => boolean }
//       or, for a file a cell writes (a GeoTIFF, a reprojected file):
//               { cell, label, after: "result" | "inspect",
//                 enabled: (data) => boolean (default: there is a result / inspect),
//                 inputs: (data, inputs, { uploadKind }) => extra injected values
//                   (data has resultInputs: download what was computed),
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
// The example computed in advance (blog/examples/precomputed/<tool>.json,
// written by precompute-examples.mjs) follows the tool's own flow without
// starting the engine: Load example shows its inspection (and its result
// when the tool computes on load), and Compute with the inputs it was
// computed with shows its result. The engine runs at the first action
// that needs it (other inputs, a cell download), replaying the example
// in it first. The file is used only when its fingerprint matches this
// page's cell code, example file and default inputs; otherwise, and with
// ?live in the URL, the example runs live.
//
// Without an inspect cell, a load makes `inspect` an empty object, so
// compute is enabled once there is data. New data clears the previous
// result; a page that keeps state derived from them (a selection, a zoom
// target) resets it with an effect on tool.inspect / tool.result.
import { useRef, useState } from "preact/hooks";
import { useCellRunner, findCell } from "./useCellRunner.js";

export const base64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// A raster band sent by a cell as base64 float32 bytes. The last few
// are kept: layers are rebuilt on every input change, and the same band
// must decode to the same array (MapView then knows nothing changed).
const decoded = new Map();
export const base64ToFloat32 = (b64) => {
  if (!decoded.has(b64)) {
    decoded.set(b64, new Float32Array(base64ToBytes(b64).buffer));
    if (decoded.size > 8) decoded.delete(decoded.keys().next().value);
  }
  return decoded.get(b64);
};

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

  // False while the page shows a precomputed example the engine hasn't
  // run yet; the latest result and its inputs, for replaying it there.
  const engineCurrent = useRef(true);
  // The precomputed example on show, while the engine hasn't run it.
  const pre = useRef(null);
  const latestResult = useRef(null);
  latestResult.current = { result, resultInputs };

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
    engineCurrent.current = true;
    pre.current = null;
    setInspect(value);
    // A tool that only inspects: the inspection is its result.
    if (cells.inspect && !cells.compute) window.WebGeoDS.track?.("validation_completed", { tool });
    setResult(null);
    let nextInputs = latestInputs.current;
    if (inputsFromInspect) {
      nextInputs = inputsFromInspect(value, nextInputs);
      setInputs(nextInputs);
    }
    const auto = typeof autoCompute === "function" ? autoCompute(value) : autoCompute;
    if (auto && cells.compute) await runCompute(nextInputs);
  };

  // The example file goes through the same path as an upload, but
  // `files` stays null: downloads keep the tool's default filename.
  // (Upload.load only queues the file: nothing is written, and no engine
  // started, until a cell runs.)
  const loadExample = () => runner.queue("⌛ Loading example...", async () => {
    if (example) {
      const response = await fetch(example);
      if (!response.ok) throw new Error(`Example file ${example}: HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const file = new File([bytes], example.split("/").pop());
      const loaded = await window.WebGeoDS.Upload.load([file], { languages });
      if (!loaded.ok) return loaded.message;
      setKind(loaded.kind);
      setFiles(null);
      const precomputed = await precomputedExample(bytes);
      if (precomputed) {
        engineCurrent.current = false;
        pre.current = precomputed;
        setInspect(precomputed.inspect);
        setInputs(precomputed.inputs);
        // As live: a tool that computes on load shows its result now.
        const auto = typeof autoCompute === "function" ? autoCompute(precomputed.inspect) : autoCompute;
        setResult(auto && cells.compute ? precomputed.result : null);
        setResultInputs(auto && cells.compute ? precomputed.resultInputs : null);
        window.WebGeoDS.track?.("example_loaded", { tool, precomputed: true });
        return exampleStatus;
      }
    } else {
      await runner.runCell(cells.example);
      setKind("geojson");
      setFiles(null);
    }
    window.WebGeoDS.track?.("example_loaded", { tool, precomputed: false });
    await runInspect();
    return exampleStatus;
  });

  // What the precomputed file must have been made from.
  const fingerprint = async (exampleBytes) => {
    const codes = [];
    for (const id of [cells.inspect, cells.compute]) {
      codes.push(id ? await (await findCell(id)).getCode() : "");
    }
    const text = new TextEncoder().encode(JSON.stringify({ codes, inputs: initialInputs }));
    const all = new Uint8Array(text.length + exampleBytes.length);
    all.set(text);
    all.set(exampleBytes, text.length);
    const digest = await crypto.subtle.digest("SHA-256", all);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const precomputedExample = async (exampleBytes) => {
    if (cells.example || new URLSearchParams(location.search).has("live")) return null;
    try {
      const response = await fetch(`/examples/precomputed/${tool}.json`);
      if (!response.ok) return null;
      const pre = await response.json();
      if (pre.fingerprint === await fingerprint(exampleBytes)) return pre;
      console.warn(`WebGeoDS: /examples/precomputed/${tool}.json is out of date (run precompute-examples.mjs); running the example live.`);
    } catch (error) {
      console.warn("WebGeoDS: precomputed example not usable, running it live.", error);
    }
    return null;
  };

  // Before a step that needs the engine to hold the data shown: replay
  // the precomputed example there (inspect, and the result when the
  // step builds on it).
  const ensureEngine = async ({ withResult }) => {
    if (engineCurrent.current) return;
    if (cells.inspect) await runner.runCell(cells.inspect);
    const { result: shown, resultInputs: shownInputs } = latestResult.current;
    if (withResult && shown && cells.compute) await runner.runCell(cells.compute, shownInputs);
    engineCurrent.current = true;
    pre.current = null;
  };

  const sameInputs = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // The visitor is about to use the tool (pointer, focus or touch on
  // it): start the engine and the packages of its cells now, so a
  // first Compute or upload mostly finds them ready. Once per cell
  // (CodeCell.preload()), and never when saving data.
  const preloadEngine = () => {
    for (const id of [cells.inspect, cells.compute]) {
      if (id) findCell(id).then((cell) => cell.preload()).catch(() => {});
    }
  };

  // For precompute-examples.mjs: the example as shown now, ready to save.
  const snapshot = async () => {
    const response = await fetch(example);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { fingerprint: await fingerprint(bytes), inspect, inputs, result, resultInputs };
  };

  const handleFiles = (fileList) => runner.queue("⌛ Loading...", async () => {
    const loaded = await window.WebGeoDS.Upload.load(fileList, { languages });
    setFiles(fileList);
    if (!loaded.ok) return loaded.message;
    setKind(loaded.kind);
    await runInspect();
    return loaded.message;
  });

  const compute = () => runner.queue(computeLabel, async () => {
    // The example with the inputs it was computed with: its result.
    if (pre.current?.result && sameInputs(inputs, pre.current.resultInputs)) {
      setResultInputs(pre.current.resultInputs);
      setResult(pre.current.result);
      window.WebGeoDS.track?.("example_result_viewed", { tool });
      return doneStatus;
    }
    await ensureEngine({ withResult: false });
    await runCompute(inputs);
    return doneStatus;
  });

  const reset = () => runner.queue("Resetting...", async () => {
    engineCurrent.current = true;
    pre.current = null;
    setInspect(null);
    setResult(null);
    setFiles(null);
    setKind(null);
    return window.WebGeoDS.Upload.defaultStatus;
  });

  // A file written by a cell: run it, decode its base64 value, save it.
  const downloadFromCell = () => runner.queue("⌛ Preparing download...", async () => {
    await ensureEngine({ withResult: true });
    const extra = download.inputs ? download.inputs({ inspect, result, resultInputs }, inputs, { uploadKind: kind }) : {};
    // What the cell was given: filename()/file() name the file after it.
    const injected = { ...inputs, ...extra };
    const value = await runner.runCell(download.cell, injected);
    const base = window.WebGeoDS.Upload.baseName(files);
    const file = download.file
      ? download.file(value, base, injected)
      : { content: base64ToBytes(value), filename: download.filename(base, injected), mimeType: download.mimeType };
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
        // After "inspect": the latest of the two (a repaired result, else the inspection).
        const source = download.after === "inspect" ? (result ?? inspect) : result;
        return source ? download.getFeatures(source, { inspect, result }) : null;
      },
      getBaseName: () => window.WebGeoDS.Upload.baseName(files),
      filenameSuffix: download.filenameSuffix,
      defaultFilename: download.defaultFilename,
      mimeType: download.mimeType,
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
    panelProps,
    preloadEngine,
    snapshot
  };

}

// The tool control panel: a row with upload / example / download /
// reset, a status row, then the page's own inputs and Compute button as
// children. Classes from shared/styles.css.
import { useState } from "preact/hooks";
import { downloadFeatures } from "./downloads.js";

export function ControlPanel({ upload, example, download, cellDownload, onReset, resetLabel = "🔄 Reset", status, busy, children }) {

  return (
    <div class="webgeods-panel">
      <div class="webgeods-panel-row">
        <UploadButton label={upload?.label ?? "📁 Upload"} kind={upload?.kind ?? "vector"} onFiles={(files) => upload?.onFiles(files)} />
        {example && (
          <button type="button" class="webgeods-panel-btn" data-variant="outline" disabled={busy} onClick={example.onClick}>
            {example.label ?? "📋 Load example"}
          </button>
        )}
        {download && <DownloadButton disabled={busy || !download.enabled} onDownload={() => downloadFeatures(download)} />}
        {cellDownload && (
          <button type="button" class="webgeods-panel-btn" data-variant="outline"
            disabled={busy || !cellDownload.enabled} onClick={cellDownload.onClick}>
            {cellDownload.label}
          </button>
        )}
        <ResetButton label={resetLabel} onClick={() => onReset?.()} />
      </div>
      <div class="webgeods-panel-row">
        <StatusText status={status} busy={busy} />
      </div>
      {children && <div class="webgeods-panel-row">{children}</div>}
    </div>
  );

}

// The upload "button": a native file input inside a <label> styled as a
// button, so a click on the label opens the picker with no script (the
// input itself is hidden by CSS). onFiles gets the input's FileList on
// every change (empty if the picker is cancelled).
export function UploadButton({ label = "Upload", variant, kind = "vector", onFiles }) {
  const { accept, rasterAccept } = window.WebGeoDS.Upload;
  return (
    <label class="webgeods-panel-btn" data-variant={variant}>
      {label}
      <input type="file" multiple accept={kind === "raster" ? rasterAccept : accept}
        onChange={(e) => onFiles(e.currentTarget.files)} />
    </label>
  );
}

export function ResetButton({ label = "🔄 Reset", onClick }) {
  return <button class="webgeods-panel-btn" data-variant="outline" onClick={onClick}>{label}</button>;
}

// onDownload: async; the button shows "⌛ Preparing..." until it settles.
export function DownloadButton({ label = "⬇ Download", disabled, onDownload }) {
  const [preparing, setPreparing] = useState(false);
  const click = async () => {
    setPreparing(true);
    try { await onDownload(); } finally { setPreparing(false); }
  };
  return (
    <button class="webgeods-panel-btn" data-variant="outline" disabled={disabled || preparing} onClick={click}>
      {preparing ? "⌛ Preparing..." : label}
    </button>
  );
}

// The status line next to the panel's controls; pulses while busy.
export function StatusText({ status, busy }) {
  return <span class={"webgeods-panel-status" + (busy ? " webgeods-btn-loading" : "")}>{status}</span>;
}

// options: strings, or { value, label } objects.
export function SelectInput({ id, label, options, value, onChange, disabled }) {
  return (
    <>
      <span class="webgeods-panel-status">{label}</span>
      <select class="webgeods-panel-status" id={id} value={value} disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}>
        {options.map((option) => (typeof option === "object"
          ? <option value={option.value}>{option.label}</option>
          : <option value={option}>{option}</option>))}
      </select>
    </>
  );
}

export function SliderInput({ id, label, min, max, step = 1, value, onChange, disabled }) {
  return (
    <span class="webgeods-slider">
      <span class="webgeods-slider-label">{label}:</span>
      <input type="range" id={id} min={min} max={max} step={step} value={value} disabled={disabled}
        onInput={(e) => onChange(Number(e.currentTarget.value))} />
      <span class="webgeods-slider-value">{value}</span>
    </span>
  );
}

export function ComputeButton({ label = "▶ Compute", disabled, onClick }) {
  return (
    <button type="button" class="webgeods-panel-btn" disabled={disabled} onClick={onClick}>{label}</button>
  );
}

export function NumberInput({ id, label, step, width = "95px", value, onChange, disabled }) {
  return (
    <>
      {label && <span class="webgeods-panel-status">{label}</span>}
      <input type="number" id={id} step={step} value={value} disabled={disabled}
        class="webgeods-panel-status" style={{ width }}
        onChange={(e) => onChange(Number(e.currentTarget.value))} />
    </>
  );
}

export function CheckboxInput({ id, label, value, onChange, disabled }) {
  return (
    <label class="webgeods-panel-status">
      <input type="checkbox" id={id} checked={!!value} disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)} />
      {" "}{label}
    </label>
  );
}

export function TextInput({ id, label, placeholder, size = 10, value, onChange, disabled }) {
  return (
    <>
      {label && <span class="webgeods-panel-status">{label}</span>}
      <input type="text" id={id} size={size} placeholder={placeholder} value={value} disabled={disabled}
        class="webgeods-panel-status" onInput={(e) => onChange(e.currentTarget.value)} />
    </>
  );
}

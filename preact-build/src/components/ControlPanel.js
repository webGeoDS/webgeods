// The tool control panel, with the same markup and classes as
// WebGeoDS.Dashboard's (shared/dashboard-dom.js _buildDom()): a row with
// upload / example / download / reset, a status row, then the page's own
// inputs and Compute button as children. Upload, download, reset and the
// status line are the site's existing helpers, placed with DomNode.
import { useRef } from "preact/hooks";
import { DomNode } from "./DomNode.js";

export function ControlPanel({ upload, example, download, cellDownload, onReset, resetLabel = "🔄 Reset", status, busy, children }) {

  // Helpers are built once; their callbacks read the latest props here.
  const latest = useRef({});
  latest.current = { upload, download, onReset };

  return (
    <div class="webgeods-panel">
      <div class="webgeods-panel-row">
        <DomNode build={() => window.WebGeoDS.Upload.createControl({
          label: upload?.label ?? "📁 Upload",
          kind: upload?.kind ?? "vector",
          onChange: (files) => latest.current.upload?.onFiles(files)
        })} />
        {example && (
          <button type="button" class="webgeods-panel-btn" data-variant="outline" disabled={busy} onClick={example.onClick}>
            {example.label ?? "📋 Load example"}
          </button>
        )}
        {download && (
          <DomNode
            build={() => window.WebGeoDS.downloadButton({
              getFeatures: () => latest.current.download.getFeatures(),
              getBaseName: () => latest.current.download.getBaseName?.() ?? null,
              filenameSuffix: download.filenameSuffix,
              defaultFilename: download.defaultFilename,
              ...(download.mimeType ? { mimeType: download.mimeType } : {}),
              enabled: false,
              tool: download.tool,
              shapefile: download.shapefile ? {
                ...download.shapefile,
                get uploadKind() { return latest.current.download.uploadKind; }
              } : undefined
            })}
            update={(button) => { button.disabled = busy || !download.enabled; }}
          />
        )}
        {cellDownload && (
          <button type="button" class="webgeods-panel-btn" data-variant="outline"
            disabled={busy || !cellDownload.enabled} onClick={cellDownload.onClick}>
            {cellDownload.label}
          </button>
        )}
        <DomNode build={() => window.WebGeoDS.resetButton(() => latest.current.onReset?.(), resetLabel)} />
      </div>
      <div class="webgeods-panel-row">
        <DomNode build={() => window.WebGeoDS.uploadStatusEl(status, busy)} deps={[status, busy]} />
      </div>
      {children && <div class="webgeods-panel-row">{children}</div>}
    </div>
  );

}

// Same markup as Dashboard's select input. options: strings, or
// { value, label } objects.
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

// Same markup as WebGeoDS.createSlider (shared/upload.js).
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

// Same markup as the number inputs of the OJS tools (viewshed-calculator.qmd).
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

// Same markup as buffer-proximity.qmd's "Dissolve" checkbox.
export function CheckboxInput({ id, label, value, onChange, disabled }) {
  return (
    <label class="webgeods-panel-status">
      <input type="checkbox" id={id} checked={!!value} disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)} />
      {" "}{label}
    </label>
  );
}

// Same markup as crs-inspector.qmd's target-CRS field.
export function TextInput({ id, label, placeholder, size = 10, value, onChange, disabled }) {
  return (
    <>
      {label && <span class="webgeods-panel-status">{label}</span>}
      <input type="text" id={id} size={size} placeholder={placeholder} value={value} disabled={disabled}
        class="webgeods-panel-status" onInput={(e) => onChange(e.currentTarget.value)} />
    </>
  );
}

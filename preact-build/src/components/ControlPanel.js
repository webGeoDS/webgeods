// The tool control panel, with the same markup and classes as
// WebGeoDS.Dashboard's (shared/dashboard-dom.js _buildDom()): a row with
// upload / example / download / reset, a status row, then the page's own
// inputs and Compute button as children. Upload, download, reset and the
// status line are the site's existing helpers, placed with DomNode.
import { useRef } from "preact/hooks";
import { DomNode } from "./DomNode.js";

export function ControlPanel({ upload, example, download, onReset, resetLabel = "🔄 Reset", status, busy, children }) {

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
        <DomNode build={() => window.WebGeoDS.resetButton(() => latest.current.onReset?.(), resetLabel)} />
      </div>
      <div class="webgeods-panel-row">
        <DomNode build={() => window.WebGeoDS.uploadStatusEl(status, busy)} deps={[status, busy]} />
      </div>
      {children && <div class="webgeods-panel-row">{children}</div>}
    </div>
  );

}

// Same markup as Dashboard's select input.
export function SelectInput({ id, label, options, value, onChange, disabled }) {
  return (
    <>
      <span class="webgeods-panel-status">{label}</span>
      <select class="webgeods-panel-status" id={id} value={value} disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}>
        {options.map((option) => <option value={option}>{option}</option>)}
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

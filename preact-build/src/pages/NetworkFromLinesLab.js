// Interactive parts of the article blog/posts/network-from-lines.qmd,
// around its Python and R cells (which the reader runs). One component,
// rendered through portals into empty slots in the Markdown, where the
// OJS cells used to be:
//
//   #lab-upload  upload control and its status line
//   #lab-map     the shared map (the result's lines)
//   #lab-crs     "no CRS, assuming WGS84" warning, if any
//   #lab-stats   Python and R stat cards, side by side
//   #lab-graphs  the graph at 0 m and at 5 m, as two force diagrams
//   #lab-reset   "Reset map and cards"
//
// Map and diagrams show the language that ran last: Python and R build
// the same graph, so a second run only redraws the same picture.
import { useEffect, useState } from "preact/hooks";
import { useCellValue } from "../hooks/useCellValue.js";
import { MapView } from "../components/MapView.js";
import { ForceGraph } from "../components/ForceGraph.js";
import { DomNode } from "../components/DomNode.js";
import { Portal } from "../components/Layout.js";

const CELLS = { py: "network-from-lines-py", r: "network-from-lines-r" };
const LINE_PAINT = { "line-color": "#3d5a73", "line-width": 3 };

// One color per connected component, so "how many colors" answers "how
// many pieces" (same palette as the standalone tool).
const componentColor = (f) =>
  window.WebGeoDS.DEFAULT_PALETTE[(f.properties.component ?? 0) % window.WebGeoDS.DEFAULT_PALETTE.length];

export function NetworkFromLinesLab() {

  const [uploadStatus, setUploadStatus] = useState(window.WebGeoDS.Upload.defaultStatus);
  const [py, setPy] = useCellValue(CELLS.py);
  const [r, setR] = useCellValue(CELLS.r);
  const [latest, setLatest] = useState(null);

  useEffect(() => { if (py) setLatest(py); }, [py]);
  useEffect(() => { if (r) setLatest(r); }, [r]);

  const reset = () => {
    setPy(null);
    setR(null);
    setLatest(null);
  };

  const layers = [{ id: "network-from-lines-map", type: "line", data: latest?.features ?? null, paint: LINE_PAINT }];

  return (
    <>
      <Portal target="#lab-upload">
        <DomNode build={() => window.WebGeoDS.Upload.createControl({
          label: "Upload",
          onChange: async (files) => {
            const loaded = await window.WebGeoDS.Upload.load(files, { languages: ["python", "r"] });
            setUploadStatus(loaded.message);
          }
        })} />
        <p>{uploadStatus}</p>
      </Portal>

      <Portal target="#lab-map">
        <MapView height="420px" center={[12.49, 41.905]} zoom={13} layers={layers} fitTo={latest?.features} />
      </Portal>

      <Portal target="#lab-crs">
        <div class="webgeods-panel-status">{latest?.crsWarning ? `⚠️ ${latest.crsWarning}` : ""}</div>
      </Portal>

      <Portal target="#lab-stats">
        <div style="display: flex; flex-wrap: wrap; gap: 16px;">
          <LabeledBox label="Python"><StatGrid rows={summaryRows(py)} /></LabeledBox>
          <LabeledBox label="R"><StatGrid rows={summaryRows(r)} /></LabeledBox>
        </div>
      </Portal>

      <Portal target="#lab-graphs">
        <div style="display: flex; flex-wrap: wrap; gap: 16px;">
          {[["Graph at 0m", latest?.at0m], ["Graph at 5m", latest?.at5m]].map(([label, graph]) => (
            <LabeledBox label={label}>
              <div style="height: 220px; border: 1px solid #d8cdb8; border-radius: 4px;">
                <ForceGraph nodes={graph?.nodeFeatures ?? null} links={graph?.edgeFeatures ?? null}
                  nodeColor={componentColor} linkColor={componentColor} />
              </div>
            </LabeledBox>
          ))}
        </div>
      </Portal>

      <Portal target="#lab-reset">
        <DomNode build={() => window.WebGeoDS.resetButton(() => reset(), "🔄 Reset map and cards")} />
      </Portal>
    </>
  );

}

function summaryRows(s) {
  if (!s) return [["Calculation CRS", "—"]];
  const triple = (g) => `${g.nodes} / ${g.edges} / ${g.components}`;
  return [
    ["Calculation CRS", s.calculationCrs],
    ["At 0m — nodes / edges / components", triple(s.at0m)],
    ["At 5m — nodes / edges / components", triple(s.at5m)]
  ];
}

function StatGrid({ rows }) {
  return (
    <div class="webgeods-stat-grid">
      {rows.map(([label, value]) => (
        <>
          <div class="webgeods-stat-label">{label}</div>
          <div class="webgeods-stat-value">{String(value)}</div>
        </>
      ))}
    </div>
  );
}

function LabeledBox({ label, children }) {
  return (
    <div style="flex: 1; min-width: 260px;">
      <div class="webgeods-label">{label}</div>
      {children}
    </div>
  );
}

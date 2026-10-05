// The interactive parts of an article from one config, around the Python
// and R cells the READER runs. Fills the standard slots the article's
// Markdown declares (empty `::: {#lab-...}` divs), skipping any it
// doesn't have:
//
//   #lab-upload  upload control and its status line
//   #lab-map     the shared map
//   #lab-crs     the latest result's CRS warning, if any
//   #lab-stats   one stat card per language, side by side
//   #lab-reset   "Reset map and cards": clears both results
//
// config:
//   cells     { py, r }: the cells computing the same thing in each
//             language; either can be left out (an R-only article)
//   extra     { name: cellId }: other cells whose values slots read
//   upload    options for WebGeoDS.Upload.load (e.g. { languages: ["python", "r"] })
//   map       { center, zoom, height, layers: (value, lang) => [...], fit: (value) => FC,
//               mode: "latest" (only the language that ran last) | "both" (each on
//               its own layers, the one that ran last on top) }
//   stats     (value | null) => rows for a language's card
//   slots     { "#selector": (state) => content } for the article's own slots
//
// state: { py, r, latest, extra: { name: value } }; latest is the result
// of the language that ran last.
import { useEffect, useState } from "preact/hooks";
import { useCellValue } from "../hooks/useCellValue.js";
import { MapView } from "./MapView.js";
import { DomNode } from "./DomNode.js";
import { Portal } from "./Layout.js";

const LANGUAGE_LABELS = { py: "Python", r: "R" };

export function ArticleLab({ config }) {

  const { cells, extra = {}, upload, map, stats, slots = {} } = config;

  const [uploadStatus, setUploadStatus] = useState(window.WebGeoDS.Upload.defaultStatus);
  const [py, setPy] = useCellValue(cells.py);
  const [r, setR] = useCellValue(cells.r);
  // Fixed per article, so the hook count never changes between renders.
  const extraValues = Object.fromEntries(Object.entries(extra).map(([name, id]) => [name, useCellValue(id)[0]]));
  // Languages in the order they last ran, the latest at the end.
  const [order, setOrder] = useState([]);

  const ran = (lang, value) => {
    if (value) setOrder((current) => [...current.filter((l) => l !== lang), lang]);
  };
  useEffect(() => ran("py", py), [py]);
  useEffect(() => ran("r", r), [r]);

  const results = { py, r };
  const languages = Object.keys(cells).filter((lang) => cells[lang]);
  const ranLanguages = order.filter((lang) => results[lang]);
  const lastLang = ranLanguages.at(-1);
  const latest = lastLang ? results[lastLang] : null;
  const state = { py, r, latest, extra: extraValues };

  const reset = () => {
    setPy(null);
    setR(null);
    setOrder([]);
  };

  const shown = map.mode === "both" ? ranLanguages : ranLanguages.slice(-1);
  const layers = shown.flatMap((lang) => map.layers(results[lang], lang));

  const parts = {
    "#lab-upload": () => (
      <>
        <DomNode build={() => window.WebGeoDS.Upload.createControl({
          label: "Upload",
          onChange: async (files) => setUploadStatus((await window.WebGeoDS.Upload.load(files, upload)).message)
        })} />
        <p>{uploadStatus}</p>
      </>
    ),
    "#lab-map": () => (
      <MapView height={map.height ?? "420px"} center={map.center} zoom={map.zoom}
        layers={layers} fitTo={latest ? map.fit(latest) : null} />
    ),
    "#lab-crs": () => (
      <div class="webgeods-panel-status">{latest?.crsWarning ? `⚠️ ${latest.crsWarning}` : ""}</div>
    ),
    // Two cards side by side: seeing them agree is the point.
    "#lab-stats": () => (
      <SideBySide>
        {languages.map((lang) => (
          <LabeledBox label={LANGUAGE_LABELS[lang]}><StatGrid rows={stats(results[lang])} /></LabeledBox>
        ))}
      </SideBySide>
    ),
    "#lab-reset": () => (
      <DomNode build={() => window.WebGeoDS.resetButton(() => reset(), "🔄 Reset map and cards")} />
    ),
    ...Object.fromEntries(Object.entries(slots).map(([target, render]) => [target, () => render(state)]))
  };

  return (
    <>
      {Object.entries(parts)
        .filter(([target]) => document.querySelector(target))
        .map(([target, render]) => <Portal target={target}>{render()}</Portal>)}
    </>
  );

}

export function StatGrid({ rows }) {
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

export function SideBySide({ children }) {
  return <div style="display: flex; flex-wrap: wrap; gap: 16px;">{children}</div>;
}

export function LabeledBox({ label, children }) {
  return (
    <div style="flex: 1; min-width: 260px;">
      <div class="webgeods-label">{label}</div>
      {children}
    </div>
  );
}

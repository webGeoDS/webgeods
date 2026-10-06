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
//             language; either can be left out (an R-only article), and
//             either can be a list (a diagnose and a repair cell): the
//             language's result is then whichever of them ran last
//   extra     { name: cellId }: other cells whose values slots read
//   upload    options for WebGeoDS.Upload.load (e.g. { languages: ["python", "r"] })
//   uploadKind "vector" (default) or "raster": what the upload control accepts
//   map       { center, zoom, height, layers: (value, lang, state) => [...], fit: (value) => FC,
//               mode: "latest" (only the language that ran last) | "both" (each on
//               its own layers, the one that ran last on top) | "py" or "r" (that
//               language only, when the other would just draw the same shapes) }
//             #lab-crs shows the CRS warning of the result on the map
//   stats     (value | null) => rows for a language's card
//   slots     { "#selector": (state) => content } for the article's own slots
//   resetLabel the #lab-reset button's text
//   onRun     (cellId, value) => void, after any of `cells` runs
//   onReset   () => void, after a reset
//   tables    { "#selector": { lang, id, from: (value) => FC, rowClassName,
//               iconColumns, emptyMessage } }: a feature table of one
//               language's result, `id` being the map layer it lists.
//               Clicking a row selects that feature (drawn on top, zoomed
//               to), clicking it on the map selects its row; the same
//               click again, a reset or new results clear it.
//
// state: { py, r, latest, sources: { py, r } (the cell each result came
// from), byCell: { cellId: latest value } (cleared on reset), extra:
// { name: value }, files (the last upload), reset }; latest is the
// result of the language that ran last.
import { useEffect, useMemo, useState } from "preact/hooks";
import { useCellValue } from "../hooks/useCellValue.js";
import { MapView } from "./MapView.js";
import { DataTable, featureRows, featureKey } from "./DataTable.js";
import { selectionLayer } from "./selection.js";
import { UploadButton, ResetButton } from "./ControlPanel.js";
import { Portal, StatCard } from "./Layout.js";

const LANGUAGE_LABELS = { py: "Python", r: "R" };
const SELECTION_LAYER = "lab-selection";

export function ArticleLab({ config }) {

  const { cells, extra = {}, upload, uploadKind = "vector", map, stats, slots = {}, tables = {}, resetLabel = "🔄 Reset map and cards", onRun, onReset } = config;

  const [uploadStatus, setUploadStatus] = useState(window.WebGeoDS.Upload.defaultStatus);
  const [files, setFiles] = useState(null);
  const [py, setPy, pySource] = useCellValue(cells.py);
  const [r, setR, rSource] = useCellValue(cells.r);
  // Fixed per article, so the hook count never changes between renders.
  const extraValues = Object.fromEntries(Object.entries(extra).map(([name, id]) => [name, useCellValue(id)[0]]));
  // Languages in the order they last ran, the latest at the end.
  const [order, setOrder] = useState([]);
  const [byCell, setByCell] = useState({});
  const [selection, setSelection] = useState(null); // { id, key } of a table row

  const ran = (lang, value, source) => {
    setSelection(null);
    if (!value) return;
    setOrder((current) => [...current.filter((l) => l !== lang), lang]);
    setByCell((current) => ({ ...current, [source]: value }));
    onRun?.(source, value);
  };
  useEffect(() => ran("py", py, pySource), [py]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => ran("r", r, rSource), [r]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = { py, r };
  const languages = Object.keys(cells).filter((lang) => cells[lang]);
  const ranLanguages = order.filter((lang) => results[lang]);
  const lastLang = ranLanguages.at(-1);
  const latest = lastLang ? results[lastLang] : null;
  const reset = () => {
    setPy(null);
    setR(null);
    setOrder([]);
    setByCell({});
    setSelection(null);
    onReset?.();
  };
  const state = { py, r, latest, sources: { py: pySource, r: rSource }, byCell, extra: extraValues, files, reset };

  // ---- tables and their selection --------------------------------------

  const tableList = Object.entries(tables).map(([target, table]) => {
    const collection = results[table.lang] ? table.from(results[table.lang]) : null;
    return { target, table, collection, rows: featureRows(table.id, collection) };
  });
  const selectedFeature = useMemo(() => {
    if (!selection) return null;
    const entry = tableList.find((t) => t.table.id === selection.id);
    const index = entry?.rows.rows.findIndex((row) => row.__key === selection.key) ?? -1;
    return index >= 0 ? entry.collection.features[index] : null;
  }, [selection, py, r]); // eslint-disable-line react-hooks/exhaustive-deps
  const select = (id, key) => setSelection((current) => (current?.id === id && current.key === key ? null : { id, key }));

  const shown = map.mode === "both" ? ranLanguages
    : map.mode === "py" || map.mode === "r" ? ranLanguages.filter((lang) => lang === map.mode)
      : ranLanguages.slice(-1);
  const onMap = shown.length ? results[shown.at(-1)] : null;
  const tableIds = new Set(Object.values(tables).map((t) => t.id));
  const layers = shown.flatMap((lang) => map.layers(results[lang], lang, state)).map((layer) => (
    tableIds.has(layer.id) ? { ...layer, onClick: (feature) => select(layer.id, featureKey(layer.id, feature, -1)) } : layer
  ));
  if (tableIds.size) layers.push(selectionLayer(SELECTION_LAYER, selectedFeature ? [selectedFeature] : []));
  // New results zoom to the data, a selection to its feature; clearing
  // a selection leaves the view where it is.
  const [fitTo, setFitTo] = useState(null);
  const mapFit = onMap ? map.fit(onMap) : null;
  useEffect(() => setFitTo(mapFit), [mapFit]);
  useEffect(() => {
    if (selectedFeature) setFitTo({ type: "FeatureCollection", features: [selectedFeature] });
  }, [selectedFeature]);

  const parts = {
    "#lab-upload": () => (
      <>
        <UploadButton label="Upload" kind={uploadKind} onFiles={async (selected) => {
          setFiles(selected);
          setUploadStatus((await window.WebGeoDS.Upload.load(selected, upload)).message);
        }} />
        <p>{uploadStatus}</p>
      </>
    ),
    "#lab-map": () => (
      <MapView height={map.height ?? "420px"} center={map.center} zoom={map.zoom}
        layers={layers} fitTo={fitTo} />
    ),
    "#lab-crs": () => (
      <div class="webgeods-panel-status">{onMap?.crsWarning ? `⚠️ ${onMap.crsWarning}` : ""}</div>
    ),
    // Two cards side by side: seeing them agree is the point.
    "#lab-stats": () => (
      <SideBySide>
        {languages.map((lang) => (
          <LabeledBox label={LANGUAGE_LABELS[lang]}><StatCard rows={stats(results[lang])} /></LabeledBox>
        ))}
      </SideBySide>
    ),
    "#lab-reset": () => (
      <ResetButton label={resetLabel} onClick={() => reset()} />
    ),
    ...Object.fromEntries(tableList.map(({ target, table, rows }) => [target, () => (
      <DataTable columns={rows.columns} rows={rows.rows} rowClassName={table.rowClassName}
        iconColumns={table.iconColumns} emptyMessage={table.emptyMessage ?? "No results yet"}
        selectedKeys={selection?.id === table.id ? [selection.key] : undefined}
        onRowClick={(row) => select(table.id, row.__key)} />
    )])),
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

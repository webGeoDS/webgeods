// Controlled table: renders with WebGeoDS.Table.render (shared/table.js:
// scrollable box, sticky header, icon columns, row classes) on every
// render. The selection is a prop and a click is reported through
// onRowClick; this component owns no state, so a map, a chart and this
// table can all follow the same `selection` held by the page.
//
// rows: plain objects; each needs a `__key` for selection (the same
// convention shared/map-table.js uses: "<sourceId>:<featureId>").
import { useEffect, useRef } from "preact/hooks";

export function DataTable({ columns, rows, selectedKeys, onRowClick, rowClassName, iconColumns, emptyMessage = "No results yet" }) {

  const container = useRef(null);

  useEffect(() => {
    window.WebGeoDS.Table.render(container.current, {
      columns,
      data: rows ?? [],
      selectedKeys: selectedKeys ? new Set(selectedKeys) : null,
      onRowClick,
      rowClassName,
      iconColumns,
      emptyMessage
    });
  });

  return <div ref={container} />;

}

// Same columns/rows a WebGeoDS.Map table() derives from a source: the
// union of every feature's property keys, values stringified (row class
// callbacks across the site compare against strings), plus `__key`.
export function featureRows(sourceId, collection) {

  const features = collection?.features ?? [];
  const columns = [...new Set(features.flatMap((f) => Object.keys(f.properties ?? {})))];
  const cell = (value) =>
    value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);

  const rows = features.map((f, i) => ({
    ...Object.fromEntries(columns.map((key) => [key, cell((f.properties ?? {})[key])])),
    __key: featureKey(sourceId, f, i)
  }));

  return { columns, rows };

}

// One key per feature, the same whether it comes from the data or from a
// map click. Feature ids arrive from geopandas as strings ("0", "1"...)
// while MapLibre hands numeric ids back on click: compared as-is they
// never match (a real bug in the Spatial Classifier's earlier
// cross-link), so numeric-looking ids are normalized to numbers here.
export function featureKey(sourceId, feature, index) {
  const id = feature?.id;
  const usable = id !== undefined && id !== null && id !== "" && !Number.isNaN(Number(id));
  return `${sourceId}:${usable ? Number(id) : index}`;
}

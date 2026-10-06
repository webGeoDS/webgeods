// Controlled table: a scrollable box with a sticky header (styles.css,
// .webgeods-table-scroll), a leading "#" row number, optional icon
// columns and row classes. The selection is a prop and a click is
// reported through onRowClick; this component owns no state, so a map,
// a chart and this table can all follow the same `selection` held by the
// page. Values are rendered as text, never as HTML (they come from
// uploaded files).
//
// rows: plain objects; each needs a `__key` for selection
// ("<sourceId>:<featureId>").
// iconColumns: these columns show "true" as ✓, "false" as ✗ and "fixed"
// as ✓ fixed (a repaired row), colored by class; rowClassName still
// sees the raw values.

const ICON_TEXT = { true: "✓", false: "✗", fixed: "✓ fixed" };
const ICON_CLASS = { true: "webgeods-icon-valid", false: "webgeods-icon-invalid", fixed: "webgeods-icon-valid" };

export function DataTable({ columns, rows, selectedKeys, onRowClick, rowClassName, iconColumns = [], emptyMessage = "No results yet" }) {

  const data = rows ?? [];
  if (data.length === 0) {
    return <div class="webgeods-table-scroll"><div class="webgeods-table-empty">{emptyMessage}</div></div>;
  }

  const selected = selectedKeys ? new Set(selectedKeys) : null;

  return (
    <div class="webgeods-table-scroll">
      <table class="webgeods-table">
        <thead>
          <tr><th>#</th>{columns.map((col) => <th>{col}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((row, index) => {
            const classes = [
              rowClassName?.(row) || "",
              row.__key !== undefined && selected?.has(row.__key) ? "webgeods-row-selected" : "",
              onRowClick ? "webgeods-row-clickable" : ""
            ].filter(Boolean).join(" ");
            return (
              <tr class={classes || undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                <td>{index + 1}</td>
                {columns.map((col) => {
                  const value = row[col] === undefined || row[col] === null ? "" : String(row[col]);
                  const icon = iconColumns.includes(col) && Object.prototype.hasOwnProperty.call(ICON_TEXT, value);
                  return <td class={icon ? ICON_CLASS[value] : undefined}>{icon ? ICON_TEXT[value] : value}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

}

// A feature collection as table columns and rows: the union of every feature's property keys, values stringified (row class
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

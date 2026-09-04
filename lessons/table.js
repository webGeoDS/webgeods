/**
 * WebGeoDS.Table
 *
 * Plain vanilla-DOM table renderer — no library. Rebuilds the whole
 * <table> on every render() call (same "rebuild, don't diff"
 * granularity Grid.js's updateConfig().forceRender() already had, and
 * Inputs.table() has too): render() only ever runs on discrete events
 * (a Validate/Check/Repair click, a map source's content changing),
 * never per frame/keystroke, so there's nothing to gain from diffing.
 *
 * Exposes:
 *
 *   window.WebGeoDS.Table.render(containerOrId, {
 *     columns,       // string[]
 *     data,          // object[] — one plain {column: value} object per row
 *     rowClassName,  // (row) => string — optional, applied to <tr>.className
 *     selectedKey,   // string|null — optional, marks the matching row selected
 *     onRowClick,    // (row) => void — optional
 *     emptyMessage   // string — shown instead of a table when data is empty
 *   })
 *
 * `containerOrId` accepts either an existing element's id (string —
 * looked up via getElementById, throws if missing) or an actual
 * Element (used directly, no lookup) — same convention as
 * WebGeoDS.Map's own auto-container constructor (see shared/map.js).
 *
 * Row values are inserted via `textContent`, never interpolated into
 * an HTML string: cell values come from uploaded file content (a
 * feature's "name" property, a validity error message), so they're
 * untrusted — textContent is safe by construction, no manual escaping
 * needed.
 *
 * A row's selection identity (`row.__key`, compared against
 * `selectedKey`) is set by the caller (shared/map.js's table()) — this
 * module doesn't know or care what it means, only whether it matches.
 *
 * No ES module syntax is used so the file can be included directly by
 * Quarto in the generated HTML.
 */

(() => {

  "use strict";


  // ============================================================
  // Namespace
  // ============================================================

  window.WebGeoDS =
    window.WebGeoDS || {};


  // ============================================================
  // render(containerOrId, options)
  // ============================================================

  function render(
    containerOrId,
    {
      columns = [],
      data = [],
      rowClassName,
      selectedKey = null,
      onRowClick,
      emptyMessage = "No results"
    } = {}
  ) {

    const container =
      containerOrId instanceof Element ?
        containerOrId :
        document.getElementById(containerOrId);

    if (!container) {

      throw new Error(
        `WebGeoDS.Table: element "${containerOrId}" not found.`
      );

    }

    container.replaceChildren();

    if (data.length === 0) {

      const empty =
        document.createElement("div");

      empty.className =
        "webgeods-table-empty";

      empty.textContent =
        emptyMessage;

      container.appendChild(empty);

      return container;

    }

    const table =
      document.createElement("table");

    table.className =
      "webgeods-table";


    const thead =
      document.createElement("thead");

    const headRow =
      document.createElement("tr");

    for (const col of columns) {

      const th =
        document.createElement("th");

      th.textContent =
        col;

      headRow.appendChild(th);

    }

    thead.appendChild(headRow);

    table.appendChild(thead);


    const tbody =
      document.createElement("tbody");

    for (const row of data) {

      const tr =
        document.createElement("tr");

      const classNames =
        [
          rowClassName?.(row) || "",
          row.__key !== undefined && row.__key === selectedKey ?
            "webgeods-row-selected" :
            ""
        ].filter(Boolean);

      if (classNames.length > 0) {

        tr.className =
          classNames.join(" ");

      }

      if (onRowClick) {

        tr.classList.add(
          "webgeods-row-clickable"
        );

        tr.addEventListener(
          "click",
          () => onRowClick(row)
        );

      }

      for (const col of columns) {

        const td =
          document.createElement("td");

        const value =
          row[col];

        td.textContent =
          value === undefined || value === null ?
            "" :
            String(value);

        tr.appendChild(td);

      }

      tbody.appendChild(tr);

    }

    table.appendChild(tbody);

    container.appendChild(table);

    return container;

  }


  // ============================================================
  // Public WebGeoDS API
  // ============================================================

  window.WebGeoDS.Table = {
    render
  };


})();

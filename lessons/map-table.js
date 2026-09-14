/**
 * WebGeoDS.Map — table / cross-link engine
 *
 * Extends `WebGeoDSMap` (shared/map.js) with table()/tableCell() — the
 * generic feature-table dump and the reactive, cross-linkable table
 * cell built on top of it (row selection <-> map click <-> a third
 * consumer like a Vega-Lite chart, all sharing one selection). Split
 * out of map.js (2026-09-14, see check-file-size-budget.mjs's own
 * long-standing note that map.js had accumulated unrelated concerns):
 * this was the single largest block in that file, and — not
 * incidentally — the one most directly relevant to any future work
 * centralizing cross-link signals across map/table/diagram/chart.
 *
 * Two module-private pieces of map.js's own IIFE that this code reads
 * or writes are promoted to STATIC PROPERTIES of the class instead
 * (`WebGeoDSMap._tableCellCounter`, `WebGeoDSMap._tableSelections`),
 * so both files see the exact same state — one counter, one registry,
 * not two independent ones by accident. `WebGeoDSMap.
 * findTableSelection()` (a static method, stays in map.js) reads
 * `WebGeoDSMap._tableSelections` the same way.
 *
 * `designToken()` is duplicated here rather than shared — same
 * pattern shared/vega-chart.js already uses for the same helper
 * ("duplicated, not imported -- this file has no dependency on map.js
 * being loaded, and the two IIFEs don't share scope"): 10 lines, not
 * worth a shared-state mechanism.
 *
 * Must load AFTER shared/map.js (extends its class, and depends on
 * the two static properties above already existing on it) and before
 * any page code calls table()/tableCell().
 *
 * No ES module syntax is used so the file can be included
 * directly by Quarto in the generated HTML.
 */

(() => {

  "use strict";

  const WebGeoDSMap =
    window.WebGeoDS.Map;

  // See shared/map.js's own designToken() doc comment for the full
  // rationale (reading a CSS custom property live rather than
  // hand-copying its hex value).
  function designToken(name, fallback) {

    const value =
      getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();

    return value || fallback;

  }


  // ==========================================================
  // table(sourceIds, containerId, options)
  //
  // Generic property dump of one or more sources' CURRENT features
  // (via getGeoJSON() above) into a plain table (shared/table.js):
  // columns are the UNION of every `properties` key seen across ALL
  // features from ALL given sources (not just the first — different
  // features can carry different keys), one row per feature, missing
  // keys shown blank. `sourceIds` accepts a single string or an
  // array (e.g. two languages' independent sources feeding one
  // shared table). For a page that wants specific columns or custom
  // labels, call WebGeoDS.Table.render() directly instead — this
  // generic dump deliberately doesn't attempt that, only row-level
  // coloring and selection (below).
  //
  // Each row object also carries a hidden `__key` (`${sourceId}:${id}`,
  // `id` being the feature's own MapLibre id — see _stampFeatureIds()
  // above, which guarantees every feature has one) — not a
  // `properties` key, so it's never in `columns`/never shown, but
  // it's how tableCell() below tells shared/table.js which row is
  // currently selected and which row a click came from.
  //
  // options.rowClassName(row) — optional: called once per row with
  // the row object (each property value stringified, same
  // convention as before + a __key field) — return a CSS class name
  // to color that row, or a falsy value for none. The class itself
  // isn't defined here; the caller's stylesheet must provide it
  // (e.g. shared/styles.css's .webgeods-row-invalid/-fixed).
  //
  // options.iconColumns — optional, forwarded straight through to
  // WebGeoDS.Table.render() (see shared/table.js): a "true"/"false"
  // value in one of these columns renders as 🟢/🔴 instead of text.
  // Independent of rowClassName — a page can use either, both, or
  // neither.
  //
  // Requires shared/table.js on the page — always true for blog/
  // (loaded on every page via _quarto.yml's include-after-body) but
  // NOT for lessons/ (no table.js entry there) even though both sync
  // the same shared/map.js — checked explicitly so a lessons/ page
  // calling this fails with a clear message instead of a bare
  // "Cannot read properties of undefined".
  // ==========================================================

  WebGeoDSMap.prototype.table = function (
    sourceIds,
    containerId,
    options = {}
  ) {

    if (
      typeof window.WebGeoDS?.Table?.render !==
      "function"
    ) {

      throw new Error(
        "WebGeoDS.Map: table() requires shared/table.js (WebGeoDS.Table) to be loaded on this page."
      );

    }


    const ids =
      Array.isArray(sourceIds) ?
        sourceIds :
        [sourceIds];

    const featuresBySource =
      ids.flatMap((sourceId) =>
        (this.getGeoJSON(sourceId)?.features ?? [])
          .map((feature) => ({ sourceId, feature }))
      );

    const columns =
      [...new Set(
        featuresBySource.flatMap(({ feature }) =>
          Object.keys(
            feature.properties ??
            {}
          )
        )
      )];

    // Stringified explicitly (not left to shared/table.js's own
    // display-time String(value)): rowClassName() callbacks across
    // the project already compare against string values (e.g.
    // `row.valid_after === "false"`), a convention kept unchanged
    // here rather than silently flipping it to native types under
    // existing callers.
    const cellValue =
      (value) => {

        if (
          value === undefined ||
          value === null
        ) {

          return "";

        }

        return typeof value === "object" ?
          JSON.stringify(value) :
          String(value);

      };

    const data =
      featuresBySource.map(({ sourceId, feature }) => ({

        ...Object.fromEntries(
          columns.map((key) =>
            [key, cellValue((feature.properties ?? {})[key])]
          )
        ),

        __key:
          `${sourceId}:${feature.id}`

      }));

    return window.WebGeoDS.Table.render(
      containerId,
      { columns, data, ...options }
    );

  };


  // ==========================================================
  // _tableController(sourceIds, containerId, options) -- the engine
  // tableCell() (below) wraps for an {ojs} cell, and WebGeoDS.
  // Dashboard (shared/dashboard.js's _init()) calls directly for its
  // OWN declarative `compute.table` field. Split out (2026-09-14) so
  // Dashboard -- which uses no `mutable`/Generators/{ojs} cell by
  // design (see dashboard.js's own doc comment) -- can drive the same
  // render/selection/click-binding machinery without needing an OJS
  // reactive wrapper it has no way to provide. Returns `{ element,
  // select(key), selectMany(keys), getSelectedKey(), getSelectedKeys(),
  // setOnRender(fn), destroy() }` -- `setOnRender()` is how a caller
  // learns a re-render happened (tableCell() below uses it to call
  // Observable's own `change()`; Dashboard doesn't need it at all,
  // since it just inserts `element` once and every future render
  // mutates that same node in place).
  //
  // `containerId` is optional: omit it (or pass null/undefined) and
  // this creates its OWN <div> once, the same idiom as this class's
  // own constructor (`new WebGeoDS.Map({...})` with no id
  // auto-creates its container) — no hand-written `<div id="...">`
  // needed elsewhere in the page. Passing an explicit string still
  // works exactly as before (looked up via getElementById inside
  // table()/Table.render()); Dashboard always passes an actual
  // Element (its own `tableEl`, created in shared/dashboard-dom.js).
  //
  // One-line OJS wiring for table() above, self-reactive to
  // MapLibre's own "sourcedata" event instead of requiring the
  // calling {ojs} cell to build that reactivity by hand (the
  // earlier topology-fix.qmd design: a separate Generators.observe()
  // cell plus a following `{ ... }` block just to get this).
  //
  // Renders the MERGED features of every tracked source (same
  // combining behavior as table() itself) — re-rendered from
  // scratch whenever ANY tracked source's content changes, not just
  // whichever one changed most recently. An earlier version showed
  // only the single most-recently-changed source, on the theory
  // that a page with independent per-language sources (e.g.
  // geometry-py/geometry-r) wants "whichever one just ran" rather
  // than a merged view — wrong in practice: verified empirically
  // (geometry-validity.qmd) that running Python then R left the
  // reactive stats line correctly combining both sources' feature
  // counts while the table below silently dropped Python's row
  // entirely, showing only R's — a real, visible inconsistency on
  // exactly the page whose purpose is comparing the two languages'
  // results side by side, not a hypothetical one.
  //
  // IMPORTANT, found later (2026-09-11): merging is only correct
  // when the tracked sources hold genuinely DIFFERENT data. On a
  // page where two sources hold two languages' INDEPENDENT
  // computations over the SAME input (geometry-validity.qmd,
  // topology-errors.qmd), merging double-counts every feature — one
  // row from each language for what's conceptually one record. That
  // page's own `lastResult` pattern (most-recent-language-only)
  // fixed this for its stats line/download, but the table itself
  // was calling this method with BOTH source ids and inherited the
  // exact bug. The correct fix for that case is not "most recent
  // only" either (loses the side-by-side comparison, this article's
  // whole point) — it's ONE tableCell() call per language, each
  // into its own container/tab (same shape topology-checker.qmd
  // already uses for its features/gaps split, just applied to
  // languages instead of data roles). This is exactly why
  // SELECTION_SOURCE_ID below is per-CALL, not a fixed name: two
  // calls like that are live on the same map simultaneously (a
  // tabset hides one visually, it doesn't unmount its {ojs} cell),
  // and sharing one overlay source would have them clobber each
  // other's highlight.
  //
  // `sourceIds` — which sources count as "tracked":
  //   - a string or array: exactly those source ids, nothing else
  //     (the predictable default — a source outside this list never
  //     affects the table, no matter what happens to it).
  //   - omitted / null / "*": AUTO mode — every source EXCEPT the
  //     basemap's own (this._basemapSourceIds, snapshotted once in
  //     _initialize() right after "load" — see the comment there).
  //     A source added later with any other id is picked up with no
  //     code change here; one the basemap's style itself declared
  //     never is. This is the right choice only as long as the page
  //     never swaps basemaps at runtime via setStyle() — doing so
  //     would introduce new style-owned sources the snapshot doesn't
  //     know about, which auto mode would then wrongly treat as
  //     caller data.
  //
  // Filtered the same way as topology-fix.qmd's own retired
  // hand-written version was: `dataType === "source" &&
  // sourceDataType === "content"`, verified empirically to fire
  // exactly once per genuine data change (not per the several other
  // "sourcedata" events MapLibre fires for metadata/visibility/
  // tile-loading, and NOT for addLayer()/removeSource() either —
  // also verified empirically, neither fires a "content" event by
  // itself). Before any tracked source has ever changed (e.g. right
  // after page load), renders an empty table — table() itself
  // already handles a `[]` source list as zero features/columns, no
  // separate "not yet initialized" state needed here.
  //
  // Errors from table() (e.g. missing shared/table.js) surface as
  // an unhandled promise rejection rather than an inline OJS error:
  // the Generators.observe() initializer must return synchronously,
  // so render() below can't be awaited from here.
  //
  // Row selection ↔ map linking, built in (not an opt-in option —
  // every current page benefits, see roadmap-acquisizione.md for
  // the discussion that led here): clicking a row zooms the map to
  // that feature (fitToData()) and draws it on a dedicated overlay
  // source, `__webgeods_selection` (setGeoJSON()-managed, one per
  // map — NOT shared/map.js's existing highlight()/clearHighlights(),
  // which is per-tracked-source and would need clearing on every
  // OTHER tracked source whenever selection moved between languages
  // on a dual-source page; a single dedicated overlay sidesteps
  // that). Clicking the map selects the corresponding row the same
  // way; clicking empty space, or the already-selected row/feature
  // again, clears the selection. Relies on _stampFeatureIds() (see
  // addGeoJSON()/setGeoJSON() above) for a stable id per feature —
  // the selection key is `${sourceId}:${feature.id}`, matching
  // table()'s own `row.__key`.
  //
  // Public entry point for a THIRD consumer to join this same
  // selection (built for the Vega-Lite cross-link work — see
  // roadmap-acquisizione.md — but not specific to it): this call's
  // selection is registered under `options.id` (or an
  // auto-generated one if omitted) in a lookup a non-{ojs} caller
  // can reach — `WebGeoDS.Map.findTableSelection(id)` returns
  // `{ select(key), selectMany(keys), getSelectedKey(),
  // getSelectedKeys(), element }`. `select(key)` drives the SAME
  // selection a click would (map click, table row click, or this
  // call are indistinguishable to it, including toggle-off-if-
  // already-selected); `selectMany(keys)` is the multi-feature form
  // (e.g. a chart selecting every point in a class), sharing the
  // exact same underlying state and toggle-off behavior — a single
  // click and a whole-class selection are just different sizes of
  // the same Set. `element.addEventListener(
  // WebGeoDS.Map.SELECTION_CHANGE_EVENT, (e) => ...)` reacts to a
  // selection made by ANY of those. `options.id` is worth
  // setting explicitly on a page with more than one tableCell()
  // call (e.g. one per language) — a future chart cell needs to
  // name which one it's joining, an auto id it never sees isn't
  // reachable.
  // ==========================================================

  WebGeoDSMap.prototype._tableController = function (
    sourceIds,
    containerId,
    options = {}
  ) {

    const auto =
      sourceIds === undefined ||
      sourceIds === null ||
      sourceIds === "*";

    const ids =
      auto ?
        null :
        (Array.isArray(sourceIds) ?
          sourceIds :
          [sourceIds]);

    const isTracked =
      (sourceId) =>
        auto ?
          !this._basemapSourceIds?.has(sourceId) :
          ids.includes(sourceId);

    // The full set of tracked ids to merge — for an explicit list
    // this is just `ids`; for AUTO mode it's recomputed from the
    // map's current sources each time, since new sources can appear
    // after this cell first runs (see AUTO mode's doc above).
    const trackedIds =
      () =>
        auto ?
          Object.keys(this.map.getStyle()?.sources ?? {})
            .filter((id) => !this._basemapSourceIds?.has(id)) :
          ids;

    const container =
      containerId ??
      document.createElement("div");

    // `container` above stays whatever the caller/default gave it
    // (a string id or an Element — table()/Table.render() already
    // handle either), unchanged from before this entry point was
    // added. The public entry point's DOM-side properties
    // (.select/.getSelectedKey/.dataset, the change event) need an
    // actual Element to attach to, resolved separately so a
    // string-id caller (documented as valid, even though no current
    // page uses it — every call today passes null) doesn't throw
    // trying to set a property on a string primitive.
    const containerEl =
      typeof container === "string" ?
        document.getElementById(container) :
        container;

    // One counter value shared by the overlay source id below and
    // this call's default selection id further down -- easier to
    // correlate the two while debugging, not load-bearing.
    const callNumber =
      ++WebGeoDSMap._tableCellCounter;

    // Unique per tableCell() call (not a fixed name): two calls on
    // the same map -- e.g. one per language, each tracking its own
    // source, both live simultaneously even if only one is visible
    // in a tabset -- must not share one overlay source, or
    // selecting a row in one clobbers the other's highlight. See
    // roadmap-acquisizione.md, "Vega-Lite / JS-first" entries.
    const SELECTION_SOURCE_ID =
      `__webgeods_selection_${callNumber}`;

    // This call's own entry in WebGeoDSMap._tableSelections (see the
    // static findTableSelection() in map.js) -- options.id if the
    // caller wants a memorable one to look up later (e.g. from a
    // Vega-Lite chart cell), auto-generated otherwise.
    const selectionId =
      options.id ??
      `webgeods-tablecell-${callNumber}`;

    const findFeatureByKey =
      (key) => {

        const sep =
          key.indexOf(":");

        const sourceId =
          key.slice(0, sep);

        const id =
          key.slice(sep + 1);

        const features =
          this.getGeoJSON(sourceId)?.features ??
          [];

        return features.find(
          (feature) => String(feature.id) === id
        ) ??
        null;

      };

    const selectionPaint =
      (features) => {

        const type =
          this._detectGeometryType({
            type: "FeatureCollection",
            features
          });

        const selection =
          designToken("--dataviz-selection", "#ffeb3b");

        return type === "line" ?
          { "line-color": selection, "line-width": 6 } :
          type === "circle" ?
            { "circle-color": selection, "circle-radius": 8 } :
            { "fill-color": selection, "fill-opacity": 0.6 };

      };

    // A Set, not a single key: a table-row click or a map click
    // still ever selects exactly one, but a THIRD consumer (the
    // Vega-Lite class-distribution chart) selects every feature
    // belonging to a class — see selectByKeys() below. selectByKey
    // (singular) is a thin wrapper kept for the two single-feature
    // callers.
    let selectedKeys =
      new Set();

    // Set via setOnRender() below by whichever caller needs to know
    // a render happened (tableCell()'s own OJS wrapper, to call
    // Observable's change()) -- null (a no-op) for a caller like
    // Dashboard that just reads `element` once and lets it mutate in
    // place.
    let onRender =
      null;

    // Fires WebGeoDSMap.SELECTION_CHANGE_EVENT on `container` --
    // the public entry point's other half (findTableSelection()'s
    // .select()/.getSelectedKey() are the "drive it" half). Any
    // consumer (a Vega-Lite chart cell, or another future one) can
    // addEventListener() on the same container object it already
    // got back from tableCell() to react to a selection made by
    // ANY cause: a map click, a table row click, or another
    // consumer's own .select()/.selectMany() call. Called from
    // every place `selectedKeys` actually changes, below.
    // `detail.key` stays the single-key contract existing
    // consumers already rely on (null when the selection is empty
    // OR holds more than one key); `detail.keys` is the full set,
    // for a multi-select-aware consumer.
    const announceSelection =
      () => {

        const keys =
          [...selectedKeys];

        containerEl?.dispatchEvent(
          new CustomEvent(
            WebGeoDSMap.SELECTION_CHANGE_EVENT,
            { detail: { key: keys.length === 1 ? keys[0] : null, keys } }
          )
        );

      };

    const render =
      async () => {

        // A selected feature can disappear out from under the
        // selection (e.g. the page's own "Reset map and table"
        // button empties the tracked source it came from) — drop
        // any key that no longer resolves to anything instead of
        // leaving a stale overlay highlighted on the map.
        const stillValid =
          [...selectedKeys].filter(
            (key) => findFeatureByKey(key)
          );

        if (stillValid.length !== selectedKeys.size) {

          selectedKeys =
            new Set(stillValid);

          if (selectedKeys.size === 0) {

            await this.removeGeoJSON(
              SELECTION_SOURCE_ID
            );

          } else {

            const features =
              stillValid.map(findFeatureByKey);

            await this.setGeoJSON(
              SELECTION_SOURCE_ID,
              { type: "FeatureCollection", features },
              { paint: selectionPaint(features) }
            );

          }

          announceSelection();

        }

        await this.table(
          trackedIds(),
          container,
          { ...options, selectedKeys, onRowClick: (row) => selectByKeys([row.__key]) }
        );

        // Notifies whoever called setOnRender() (tableCell()'s own
        // OJS wrapper calls Observable's change() here; a caller
        // like Dashboard, with no such wrapper, leaves this null and
        // just lets `container` mutate in place instead).
        onRender?.();

      };

    const selectByKeys =
      async (keys) => {

        const uniqueKeys =
          [...new Set(keys)];

        const isSameSelection =
          uniqueKeys.length === selectedKeys.size &&
          uniqueKeys.every((key) => selectedKeys.has(key));

        if (isSameSelection) {

          selectedKeys =
            new Set();

          await this.removeGeoJSON(
            SELECTION_SOURCE_ID
          );

        } else {

          const resolved =
            uniqueKeys
              .map((key) => [key, findFeatureByKey(key)])
              .filter(([, feature]) => feature);

          if (resolved.length === 0) {

            return;

          }

          selectedKeys =
            new Set(resolved.map(([key]) => key));

          const features =
            resolved.map(([, feature]) => feature);

          await this.setGeoJSON(
            SELECTION_SOURCE_ID,
            { type: "FeatureCollection", features },
            { paint: selectionPaint(features) }
          );

          await this.fitToData(
            { type: "FeatureCollection", features }
          );

        }

        announceSelection();

        await render();

      };

    const selectByKey =
      (key) =>
        selectByKeys([key]);

    // Public entry point -- see WebGeoDSMap.findTableSelection()'s
    // doc comment above. Exposed THREE ways, for three different
    // consumers of the same capability:
    //   - directly on `container` (.select/.selectMany/
    //     .getSelectedKey) -- ergonomic for a chart {ojs} cell in
    //     the SAME document, which already holds `container` as
    //     its own cell value (e.g. `pyTopologyTable`) and can call
    //     `pyTopologyTable.select(key)` with no lookup;
    //   - via WebGeoDSMap._tableSelections, keyed by `selectionId`
    //     -- for a consumer that ISN'T itself an {ojs} cell (a
    //     plain <script>) or doesn't hold that reference, reached
    //     instead via WebGeoDS.Map.findTableSelection(id);
    //   - on the object THIS method itself returns (below) -- for
    //     WebGeoDS.Dashboard, which holds that reference directly
    //     (`dashboard.table`) and needs neither of the above.
    // `.select(key)` is `selectByKeys([key])`: calling it
    // externally is indistinguishable from a click, including the
    // toggle-off-if-already-selected behavior. `.selectMany(keys)`
    // is the same mechanism for a consumer that selects several
    // features at once (e.g. "every point belonging to this
    // class") -- both drive the SAME underlying selection, so a
    // single-select click and a multi-select call from a chart
    // stay in sync no matter which one touched it last.
    // `container.dataset.webgeodsSelectionId` surfaces the
    // resolved id either way (explicit `options.id` or the
    // auto-generated fallback) so it's discoverable from the
    // element alone.
    if (containerEl) {

      containerEl.select =
        selectByKey;

      containerEl.selectMany =
        selectByKeys;

      containerEl.getSelectedKey =
        () => [...selectedKeys][0] ?? null;

      containerEl.getSelectedKeys =
        () => selectedKeys;

      containerEl.dataset.webgeodsSelectionId =
        selectionId;

    }

    WebGeoDSMap._tableSelections.set(
      selectionId,
      {
        select: selectByKey,
        selectMany: selectByKeys,
        getSelectedKey: () => [...selectedKeys][0] ?? null,
        getSelectedKeys: () => selectedKeys,
        element: containerEl
      }
    );

    render();

    const sourceHandler =
      (e) => {

        if (
          e.dataType === "source" &&
          e.sourceDataType === "content" &&
          isTracked(e.sourceId)
        ) {

          render();

        }

      };

    const clickHandler =
      (e) => {

        const layers =
          trackedIds().filter(
            (id) => this.map.getLayer(id)
          );

        const clicked =
          layers.length > 0 ?
            this.map.queryRenderedFeatures(e.point, { layers }) :
            [];

        if (clicked.length === 0) {

          if (selectedKeys.size > 0) {

            // Passing the SAME set again is selectByKeys()'s own
            // toggle-off path (isSameSelection) -- clears whether
            // the current selection is one feature (a table/map
            // click) or a whole class (a chart bar selection),
            // with no separate "clear everything" branch to keep
            // in sync with it.
            selectByKeys(
              [...selectedKeys]
            );

          }

        } else {

          selectByKey(
            `${clicked[0].source}:${clicked[0].id}`
          );

        }

      };

    this.map.on(
      "sourcedata",
      sourceHandler
    );

    this.map.on(
      "click",
      clickHandler
    );

    return {

      element:
        container,

      select:
        selectByKey,

      selectMany:
        selectByKeys,

      getSelectedKey:
        () => [...selectedKeys][0] ?? null,

      getSelectedKeys:
        () => selectedKeys,

      setOnRender:
        (fn) => { onRender = fn; },

      destroy:
        () => {

          this.map.off("sourcedata", sourceHandler);
          this.map.off("click", clickHandler);

          // Only if WE own that entry -- if another render()/instance
          // (e.g. under a shortened id collision) has already
          // overwritten it, leave that one alone rather than deleting
          // out from under it.
          if (WebGeoDSMap._tableSelections.get(selectionId)?.element === containerEl) {

            WebGeoDSMap._tableSelections.delete(
              selectionId
            );

          }

        }

    };

  };


  // ==========================================================
  // tableCell(sourceIds, containerId, Generators, options) -- the
  // {ojs}-cell wrapper around _tableController() above. One-line OJS
  // wiring for table(), self-reactive to MapLibre's own "sourcedata"
  // event instead of requiring the calling {ojs} cell to build that
  // reactivity by hand (the earlier topology-fix.qmd design: a
  // separate Generators.observe() cell plus a following `{ ... }`
  // block just to get this).
  //
  // A plain (non `output: false`) {ojs} cell assigning
  // `tableCell(...)` displays the result automatically via
  // Observable's own "a cell whose value is a DOM Node gets shown"
  // convention -- the SAME element reference every time, just
  // rebuilt in place by shared/table.js's render(), so it never
  // needs to "move". `change()` is called once per _tableController()
  // render (see its own setOnRender() call below), same timing as
  // before this was split into two functions.
  // ==========================================================

  WebGeoDSMap.prototype.tableCell = function (
    sourceIds,
    containerId,
    Generators,
    options = {}
  ) {

    if (
      !Generators ||
      typeof Generators.observe !== "function"
    ) {

      throw new TypeError(
        "WebGeoDS.Map: tableCell()'s Generators argument is missing or invalid — pass the Generators available in the calling {ojs} cell."
      );

    }

    return Generators.observe((change) => {

      const controller =
        this._tableController(sourceIds, containerId, options);

      controller.setOnRender(
        () => change(controller.element)
      );

      return controller.destroy;

    });

  };


})();

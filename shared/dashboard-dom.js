/**
 * WebGeoDS.Dashboard — DOM construction
 *
 * Extends `WebGeoDSDashboard` (shared/dashboard.js) with _buildDom(),
 * the one-time, static assembly of the whole skeleton (toolbar, stats
 * card, map+sidePanel row, legend, sidePanel placeholder). Split out
 * of dashboard.js (2026-09-14, same size-budget motivation as shared/
 * map.js's own map-raster.js/map-table.js split): this single method
 * was ~30% of that file.
 *
 * `DEFAULT_MAP_HEIGHT` — the one module-private value of dashboard.js
 * this method reads — is promoted to a static property
 * (`WebGeoDSDashboard.DEFAULT_MAP_HEIGHT`, declared in dashboard.js
 * itself) rather than duplicated here, because dashboard.js's own
 * `_init()` ALSO reads it (for the map's default height) and must see
 * the exact same value, not an independent copy.
 *
 * Must load AFTER shared/dashboard.js (extends its class, and depends
 * on the static property above already existing on it) and before
 * any page constructs a `new WebGeoDS.Dashboard({...})`.
 *
 * No ES module syntax is used so the file can be included
 * directly by Quarto in the generated HTML.
 */

(() => {

  "use strict";

  const WebGeoDSDashboard =
    window.WebGeoDS.Dashboard;


  // ==========================================================
  // DOM construction
  // ==========================================================

  WebGeoDSDashboard.prototype._buildDom = function () {

    const config =
      this.config;

    this.root =
      document.createElement("div");

    this.root.className =
      "webgeods-dashboard";


    // --------------------------------------------------------
    // Control panel: upload, example, download, reset -- one row --
    // then a status row, then (if this tool has compute inputs) a
    // third row for those + the Compute button.
    // --------------------------------------------------------

    const panel =
      document.createElement("div");

    panel.className =
      "webgeods-panel";

    const controlRow =
      document.createElement("div");

    controlRow.className =
      "webgeods-panel-row";

    const controlChildren = [];

    const uploadCfg =
      config.upload || {};

    this._uploadControl =
      window.WebGeoDS.Upload.createControl({
        label: uploadCfg.label || "📁 Upload",
        kind: uploadCfg.kind || "vector",
        onChange: (files) => this.handleFiles(files)
      });

    controlChildren.push(this._uploadControl);

    if (config.example) {

      this._exampleBtn =
        document.createElement("button");

      this._exampleBtn.className =
        "webgeods-panel-btn";

      this._exampleBtn.dataset.variant =
        "outline";

      this._exampleBtn.textContent =
        config.example.label || "📋 Load example";

      this._exampleBtn.onclick =
        () => this.loadExample();

      controlChildren.push(this._exampleBtn);

    }

    if (config.compute && config.compute.download) {

      const downloadCfg =
        config.compute.download;

      const dashboard =
        this;

      this._downloadBtn =
        window.WebGeoDS.downloadButton({
          getFeatures: () => downloadCfg.getFeatures(this.state.result),
          getBaseName: () => window.WebGeoDS.Upload.baseName(this.state.files),
          filenameSuffix: downloadCfg.filenameSuffix,
          defaultFilename: downloadCfg.defaultFilename,
          enabled: false,
          tool: config.tool,
          mimeType: downloadCfg.mimeType,
          // `uploadKind` as a GETTER, not a frozen value: this button
          // is built once in the constructor and never rebuilt (see
          // this file's own doc comment on compute inputs), but the
          // upload kind changes on every upload/example load after
          // that -- a plain property would freeze it at its initial
          // value (null) forever. downloadButton() (shared/ui.js)
          // reads shapefile.uploadKind fresh on every click, so a
          // getter transparently stays current with no change needed
          // there.
          shapefile: downloadCfg.shapefile ? {
            ...downloadCfg.shapefile,
            get uploadKind() { return dashboard.state.kind; }
          } : undefined
        });

      controlChildren.push(this._downloadBtn);

    }

    this._resetBtn =
      window.WebGeoDS.resetButton(
        () => this.reset(),
        config.resetLabel || "🔄 Reset"
      );

    controlChildren.push(this._resetBtn);

    controlRow.append(...controlChildren);


    const statusRow =
      document.createElement("div");

    statusRow.className =
      "webgeods-panel-row";

    this.statusRowEl =
      statusRow;

    statusRow.appendChild(
      window.WebGeoDS.uploadStatusEl(this.state.status, this.state.busy)
    );


    panel.append(controlRow, statusRow);


    // --------------------------------------------------------
    // Compute inputs row (sliders/checkboxes) + Compute button --
    // built once, not rebuilt on state changes (a real bug in
    // hand-wired tools: buffer-proximity.qmd's own controls row
    // rebuilds whenever inspectSummary changes, silently resetting
    // any slider the reader had already moved). Only disabled/
    // enabled afterward, via _syncControls().
    // --------------------------------------------------------

    if (config.compute) {

      const computeRow =
        document.createElement("div");

      computeRow.className =
        "webgeods-panel-row";

      for (const input of (config.compute.inputs || [])) {

        if (input.kind === "checkbox") {

          const wrap =
            document.createElement("label");

          wrap.className =
            "webgeods-panel-status";

          const checkbox =
            document.createElement("input");

          checkbox.type =
            "checkbox";

          checkbox.checked =
            !!input.value;

          wrap.append(
            checkbox,
            document.createTextNode(" " + input.label)
          );

          computeRow.appendChild(wrap);

          this._inputEls[input.name] =
            checkbox;

        } else if (input.kind === "select") {

          // Built empty here -- unlike a slider's range, a select's
          // OPTIONS aren't known until inspect actually runs (e.g.
          // "which column holds the class label" depends on the
          // uploaded file's own attribute columns). See
          // _syncSelectInputs(), called from _runInspectInner()
          // below, for where the options actually get populated.
          const label =
            document.createElement("span");

          label.className =
            "webgeods-panel-status";

          label.textContent =
            input.label;

          const select =
            document.createElement("select");

          select.className =
            "webgeods-panel-status";

          select.id =
            `${config.tool}-${input.name}`;

          computeRow.append(
            label,
            select
          );

          this._inputEls[input.name] =
            select;

        } else {

          const sliderWrap =
            window.WebGeoDS.createSlider(
              input.range,
              {
                value: input.value,
                step: input.step,
                label: input.label,
                id: `${config.tool}-${input.name}`
              }
            );

          computeRow.appendChild(sliderWrap);

          this._inputEls[input.name] =
            sliderWrap.querySelector("input");

        }

      }

      this._computeBtn =
        document.createElement("button");

      this._computeBtn.className =
        "webgeods-panel-btn";

      this._computeBtn.textContent =
        config.compute.label || "▶ Compute";

      this._computeBtn.disabled =
        true;

      this._computeBtn.onclick =
        () => this.runCompute();

      computeRow.appendChild(this._computeBtn);

      panel.appendChild(computeRow);

    }


    // --------------------------------------------------------
    // Stats / map / legend, outside the panel -- same document
    // order as every hand-wired tool (summary read before the map,
    // legend after it).
    // --------------------------------------------------------

    this.statsEl =
      document.createElement("div");

    this.mapSlotEl =
      document.createElement("div");

    this.legendWrapEl =
      document.createElement("div");

    this._renderStats();

    this.legendWrapEl.appendChild(
      window.WebGeoDS.legend(null)
    );

    // layout.sidePanel: an EXTRA slot beside the map, for a tool
    // that wants a second view next to it (e.g. a diagram, see
    // graph-diagram.js) without hand-wiring the DOM surgery this
    // itself replaces -- moving mapSlotEl into a flex row, matching
    // its height, and fixing the two layout bugs that surgery hit
    // in practice: (1) a flex item traps its child's margin instead
    // of letting it collapse through, which silently ate the normal
    // gap .webgeods-map-container's own margin-top provides above
    // the stat card -- worked around here by moving that spacing
    // onto the row itself, a plain block sibling that isn't anybody
    // else's flex item; (2) the same trapped margin also inflated
    // mapSlotEl's own rendered height beyond the map's actual
    // content height, misaligning it against the side panel -- the
    // real fix is removing the trap at its source (zeroing the
    // map's own margin-top once it exists, in _init() below), not
    // re-measuring around it.
    const sidePanelCfg =
      config.layout?.sidePanel;

    if (sidePanelCfg) {

      this._mapRow =
        document.createElement("div");

      this._mapRow.style.cssText =
        "display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; margin-top: 20px;";

      this.sidePanelEl =
        document.createElement("div");

      if (sidePanelCfg.id) {

        this.sidePanelEl.id =
          sidePanelCfg.id;

      }

      const mapHeight =
        config.map?.height ?? WebGeoDSDashboard.DEFAULT_MAP_HEIGHT;

      // background-color: matches every OTHER dashboard panel
      // (toolbar, stats, legend -- all --surface-muted in
      // shared/styles.css), not left to default to the page's own
      // --surface showing through -- found live, comparing this
      // panel's look against the rest of the dashboard. A diagram's
      // own SVG has no fill of its own (shows this through), and a
      // Vega-Lite chart's background is themed to "transparent" by
      // shared/vega-chart.js for the exact same reason -- both rely
      // on THIS background, not a background of their own.
      this.sidePanelEl.style.cssText =
        `flex: ${sidePanelCfg.flex ?? "1 1 280px"}; min-width: ${sidePanelCfg.minWidth ?? "260px"}; height: ${mapHeight}; overflow: hidden; border: 1px solid #d8cdb8; border-radius: 4px; background-color: var(--surface-muted);`;

      this.mapSlotEl.style.flex =
        "2 1 480px";

      this._mapRow.append(this.mapSlotEl, this.sidePanelEl);

      // An empty bordered box sitting next to the map from page
      // load, with nothing in it until the first successful
      // Compute, reads as broken or still loading rather than "no
      // results yet" -- found live, reviewing both sidePanel tools
      // shipped so far. Shown here once and restored on reset() (see
      // _showSidePanelPlaceholder() below); real content (a diagram,
      // a chart, or both) always replaces it on a successful
      // compute, whether via _renderDiagram() or a tool's own
      // onResult calling renderVegaChart() directly on sidePanelEl.
      this._showSidePanelPlaceholder(
        sidePanelCfg.placeholder
      );

    }

    // compute.table -- an EXTRA slot below the legend, for a tool
    // that wants a feature table (map<->table cross-link, same
    // engine every hand-wired tableCell() call already uses -- see
    // _tableController() in shared/map-table.js). Created here
    // (empty div, appended to root) but not wired up until _init()
    // (shared/dashboard.js), which needs this._map to exist first --
    // "no compute.table configured" leaves `this.tableEl` undefined,
    // same convention as sidePanelEl above.
    if (config.compute?.table) {

      this.tableEl =
        document.createElement("div");

    }

    this.root.append(
      panel,
      this.statsEl,
      sidePanelCfg ? this._mapRow : this.mapSlotEl,
      this.legendWrapEl,
      ...(this.tableEl ? [this.tableEl] : [])
    );


    // --------------------------------------------------------
    // Mount
    // --------------------------------------------------------

    const mount =
      config.mount;

    if (typeof mount === "string") {

      const target =
        document.querySelector(mount);

      if (!target) {

        throw new Error(
          `WebGeoDS.Dashboard: mount "${mount}" not found.`
        );

      }

      target.appendChild(this.root);

    } else if (mount instanceof HTMLElement) {

      mount.appendChild(this.root);

    }

    // No `mount` given: root stays detached, available via `.el` for
    // the caller to place itself.

  };


})();

/**
 * WebGeoDS.Map
 *
 * MapLibre GL JS wrapper.
 *
 * Exposes:
 *
 *   window.WebGeoDS.Map
 *
 * No ES module syntax is used so the file can be included
 * directly by Quarto in the generated HTML.
 */

(() => {

  "use strict";


  // ============================================================
  // Namespace
  // ============================================================

  window.WebGeoDS =
    window.WebGeoDS || {};


  // ============================================================
  // Configuration
  // ============================================================

  // Vendored locally (maplibre-gl.js/.css, the official UMD build —
  // sets window.maplibregl — from unpkg.com/maplibre-gl@4.7.1/dist/)
  // instead of loaded from esm.sh at runtime: protects the page from
  // an esm.sh outage or a future resolution change, and matches how
  // every other engine script in this project is loaded (a plain
  // local file, not a dynamic ESM import). Same sibling-file model as
  // alidade_smooth.json — both are fetched relative to the page, not
  // inlined by `embed-resources: true` (confirmed: that setting only
  // inlines what's referenced by a static HTML tag in the rendered
  // output, not files fetched by the page's own JS at runtime).
  // `window.WEBGEODS_ASSET_BASE` (optional, unset by default) lets a
  // page prefix these locally-vendored assets with a root-relative
  // path (e.g. "/") — needed for any page that isn't at the project's
  // top level, since a bare relative "maplibre-gl.js" resolves
  // against the CURRENT PAGE's own URL, not the project root (bug
  // found first with a nested blog post: blog/_quarto.yml sets this,
  // see its include-in-header). lessons/ never sets it: every lesson
  // page lives flat at the project root by design (self-contained,
  // embedded via iframe on a third-party domain), so the bare
  // relative path has always resolved correctly there and must keep
  // doing so — a leading "/" would instead point at that third-party
  // domain's root, not ours.
  const ASSET_BASE = window.WEBGEODS_ASSET_BASE || "";
  const MAPLIBRE_JS_URL = ASSET_BASE + "maplibre-gl.js";
  const MAPLIBRE_CSS_URL = ASSET_BASE + "maplibre-gl.css";

  // OpenFreeMap, Positron style — free, no API key, and deliberately
  // neutral/light so overlaid data (terracotta points/lines, moss
  // area fills — see _defaultPaint below) stays the visual focus.
  // Chosen to match the "Field Atlas" design system (see _brand.yml,
  // styles.css) — verified reachable and returning a valid MapLibre
  // style JSON at https://tiles.openfreemap.org/styles/positron.
  const DEFAULT_STYLE =
    "https://tiles.openfreemap.org/styles/positron";

  // ============================================================
  // MapLibre loader
  // ============================================================

  let mapLibrePromise = null;


  // Loads the vendored UMD script via a plain <script> tag (not
  // import()): the UMD build isn't an ES module, it just sets
  // `window.maplibregl` once it finishes executing.
  //
  // Retries with a FRESH <script> element (not a wait on the same
  // one): on a very large embed-resources page (many hundred KB of
  // inlined JS), `onload` has been observed firing on the FIRST
  // appended script while `window.maplibregl` never becomes visible
  // — confirmed not a network/content problem (the file is delivered
  // correctly and in full every time) and confirmed NOT a matter of
  // waiting longer either (polling the same load for up to 8s still
  // failed in most repeated runs). What actually and reliably works,
  // verified directly: a SECOND, brand-new <script src="..."> for the
  // exact same URL, appended right after the first one's `onload`
  // fires, resolves correctly every time. Root cause not fully
  // understood (a Chromium quirk specific to appending a script while
  // the page is still busy parsing/compiling a very large amount of
  // its own inline JS, most likely) — this works around the symptom
  // rather than the cause.
  const MAX_SCRIPT_ATTEMPTS = 8;

  function loadMapLibreScript(attempt = 1) {

    if (window.maplibregl) {
      return Promise.resolve(window.maplibregl);
    }

    return new Promise((resolve, reject) => {

      // Retries beyond the first get a short delay before appending
      // the next <script>, instead of doing it synchronously inside
      // the previous one's onload: verified empirically (Playwright,
      // a page with several code cells competing for the main thread
      // right after load) that a page busy enough with other work can
      // burn through all MAX_SCRIPT_ATTEMPTS immediately, back-to-back,
      // faster than the browser can actually finish executing any one
      // of them — giving the event loop a moment between attempts
      // measurably reduced the failure rate in that same repeated test.
      const append =
        attempt === 1
          ? (fn) => fn()
          : (fn) => setTimeout(fn, 150 * (attempt - 1));

      const script =
        document.createElement("script");

      // A cache-busting query string on retries only (not the first
      // attempt, to keep the common case's normal caching behavior):
      // verified empirically that retrying with the IDENTICAL url
      // does NOT reliably fix anything (the browser likely serves the
      // exact same cached response/compiled state) — only a genuinely
      // fresh, differently-keyed request does.
      script.src =
        attempt === 1
          ? MAPLIBRE_JS_URL
          : `${MAPLIBRE_JS_URL}?retry=${attempt}`;

      script.onload =
        () => {

          if (window.maplibregl) {

            resolve(window.maplibregl);

          } else if (attempt < MAX_SCRIPT_ATTEMPTS) {

            resolve(loadMapLibreScript(attempt + 1));

          } else {

            reject(
              new Error(`WebGeoDS.Map: ${MAPLIBRE_JS_URL} loaded ${attempt} time(s) but window.maplibregl never became available.`)
            );

          }

        };

      script.onerror =
        () => reject(
          new Error(`WebGeoDS.Map: failed to load ${MAPLIBRE_JS_URL}.`)
        );

      append(() => document.head.appendChild(script));

    });

  }


  async function loadMapLibre() {

    if (!mapLibrePromise) {

      mapLibrePromise = (async () => {

        // Load MapLibre only when WebGeoDS.Map is actually used
        const maplibregl =
          await loadMapLibreScript();


        const Map =
          maplibregl?.Map;


        const LngLatBounds =
          maplibregl?.LngLatBounds;


        if (!Map) {

          throw new Error(
            "WebGeoDS.Map: MapLibre Map not available."
          );

        }


        if (!LngLatBounds) {

          throw new Error(
            "WebGeoDS.Map: MapLibre LngLatBounds not available."
          );

        }


        // ------------------------------------------------------
        // Load MapLibre CSS once
        // ------------------------------------------------------

        if (
          !document.querySelector(
            'link[data-webgeods-maplibre="true"]'
          )
        ) {

          const link =
            document.createElement("link");

          link.rel =
            "stylesheet";

          link.href =
            MAPLIBRE_CSS_URL;

          link.dataset.webgeodsMaplibre =
            "true";

          document.head.appendChild(link);

        }


        return {
          Map,
          LngLatBounds
        };

      })().catch(error => {

        // Allow retry if loading failed
        mapLibrePromise = null;

        throw error;

      });

    }


    return mapLibrePromise;

  }


  // ============================================================
  // Instance registry — id -> live WebGeoDSMap
  // ============================================================
  //
  // Lets other code look up "the map with id X" without needing a
  // direct JS reference to the instance that created it — the same
  // role HTMLWidgets.find("#id") plays for htmlwidgets. Populated in
  // the constructor, cleared on destroy() or on a failed
  // _initialize().

  const _instances = new Map();

  let _autoIdCounter = 0;


  // ============================================================
  // WebGeoDSMap
  // ============================================================

  class WebGeoDSMap {


    // ----------------------------------------------------------
    // find(id) — look up a live instance by container id
    // ----------------------------------------------------------

    static find(id) {

      return _instances.get(id);

    }


    // ----------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------

    constructor(
      containerOrOptions = {},
      options = {}
    ) {

      let container;
      let mapOptions;


      // --------------------------------------------------------
      // Existing container by ID
      // --------------------------------------------------------

      if (
        typeof containerOrOptions === "string"
      ) {

        container =
          document.getElementById(
            containerOrOptions
          );


        if (!container) {

          throw new Error(
            `WebGeoDS.Map: element "${containerOrOptions}" not found.`
          );

        }


        mapOptions = {
          ...options
        };

      }


      // --------------------------------------------------------
      // Existing HTMLElement
      // --------------------------------------------------------

      else if (
        containerOrOptions instanceof HTMLElement
      ) {

        container =
          containerOrOptions;

        mapOptions = {
          ...options
        };

      }


      // --------------------------------------------------------
      // Automatic container
      //
      // new WebGeoDS.Map({
      //   height: "500px"
      // })
      // --------------------------------------------------------

      else {

        mapOptions = {
          ...containerOrOptions
        };


        container =
          document.createElement("div");


        container.className =
          "webgeods-map-container";


        container.style.width =
          mapOptions.width ??
          "100%";


        container.style.height =
          mapOptions.height ??
          "500px";

      }


      // --------------------------------------------------------
      // Ensure the container has an id: an auto-created div (the
      // "automatic container" branch above) has none by default,
      // which would make it unreachable via find() below — auto-
      // assign one instead of leaving it unregistered.
      // --------------------------------------------------------

      if (!container.id) {

        container.id =
          `webgeods-map-${++_autoIdCounter}`;

      }


      // --------------------------------------------------------
      // Store
      // --------------------------------------------------------

      this.options =
        mapOptions;


      this.element =
        container;


      this.element.classList.add(
        "webgeods-map-container"
      );


      _instances.set(
        this.element.id,
        this
      );


      // --------------------------------------------------------
      // Start asynchronously
      // --------------------------------------------------------

      this.isReady =
        this._initialize();

    }


    // ==========================================================
    // Initialization
    // ==========================================================

    async _initialize() {

      const {
        Map,
        LngLatBounds
      } =
        await loadMapLibre();


      this._LngLatBounds =
        LngLatBounds;


      const {

        style =
          DEFAULT_STYLE,

        center =
          [12.4964, 41.9028],

        zoom =
          5,

        // How long ready()/isReady waits for the "load" event before
        // giving up — see the try/catch below for why this exists:
        // without it, a style that never finishes loading (bad URL,
        // network failure, ...) left ready() pending forever, with no
        // way for calling code — including a future R/Python bridge
        // awaiting readiness before dispatching commands — to detect
        // the failure. 20s is generous for a style fetch; override via
        // `new WebGeoDS.Map(..., { readyTimeout: ms })` if needed.
        readyTimeout =
          20000,

        ...mapOptions

      } =
        this.options;


      try {

        this.map =
          new Map({

            container:
              this.element,

            style,

            center,

            zoom,

            ...mapOptions

          });


        // ------------------------------------------------------
        // MapLibre errors
        // ------------------------------------------------------

        this.map.on(
          "error",
          event => {

            console.warn(
              "WebGeoDS.Map — MapLibre error:",
              event.error ?? event
            );

          }
        );


        // ------------------------------------------------------
        // Automatic resize
        // ------------------------------------------------------

        if (
          typeof ResizeObserver !==
          "undefined"
        ) {

          this._resizeObserver =
            new ResizeObserver(() => {

              if (this.map) {

                this.map.resize();

              }

            });


          this._resizeObserver.observe(
            this.element
          );

        }


        // ------------------------------------------------------
        // Wait until MapLibre is ready, or give up after
        // readyTimeout instead of hanging forever.
        // ------------------------------------------------------

        await new Promise(
          (resolve, reject) => {

            const timeoutId =
              setTimeout(() => {

                reject(
                  new Error(
                    `WebGeoDS.Map: style did not finish loading within ${readyTimeout}ms.`
                  )
                );

              }, readyTimeout);


            this.map.once(
              "load",
              () => {

                clearTimeout(
                  timeoutId
                );

                resolve();

              }
            );

          }
        );


        this.map.resize();


        // ------------------------------------------------------
        // Snapshot the basemap's OWN source ids, right after "load"
        // (confirmed to fire only once the style — and everything it
        // declares, including its sources — has fully loaded, so this
        // can't race a basemap source that's still being registered).
        // Lets tableCell()'s "auto" mode (below) tell "a source the
        // basemap style already came with" apart from "a source a
        // caller added afterwards", without needing every caller to
        // route their addGeoJSON()/setGeoJSON() calls through some
        // extra registration step. Verified empirically that the
        // default OpenFreeMap Positron style alone already has two
        // (`openmaptiles`, `ne2_shaded`), not zero — a naive "just
        // listen for any new source" would otherwise misfire on those.
        // ------------------------------------------------------

        this._basemapSourceIds =
          new Set(
            Object.keys(
              this.map.getStyle().sources ??
              {}
            )
          );


        return this;

      } catch (error) {

        // Failed init: don't leave a half-alive map registered and
        // findable, or a resize observer watching a container whose
        // map will never be ready.
        this._cleanup();

        throw error;

      }

    }


    // ==========================================================
    // Cleanup shared by a failed _initialize() and destroy()
    // ==========================================================

    _cleanup() {

      _instances.delete(
        this.element.id
      );


      if (
        this._resizeObserver
      ) {

        this._resizeObserver.disconnect();

        this._resizeObserver =
          null;

      }


      if (this.map) {

        this.map.remove();

        this.map =
          null;

      }

    }


    // ==========================================================
    // Ready
    // ==========================================================

    async ready() {

      return await this.isReady;

    }


    // ==========================================================
    // Geometry detection
    // ==========================================================

    _detectGeometryType(data) {

      if (!data) {

        return "fill";

      }


      let geometryType = "";


      // FeatureCollection

      if (
        data.type ===
          "FeatureCollection" &&
        Array.isArray(
          data.features
        )
      ) {

        const feature =
          data.features.find(
            feature =>
              feature?.geometry?.type
          );


        geometryType =
          feature?.geometry?.type ??
          "";

      }


      // Feature

      else if (
        data.type === "Feature" &&
        data.geometry
      ) {

        geometryType =
          data.geometry.type;

      }


      // Geometry

      else {

        geometryType =
          data.type ?? "";

      }


      switch (geometryType) {

        case "Point":
        case "MultiPoint":

          return "circle";


        case "LineString":
        case "MultiLineString":

          return "line";


        case "Polygon":
        case "MultiPolygon":

          return "fill";


        default:

          return "fill";

      }

    }


    // ==========================================================
    // Default paint
    // ==========================================================

    _defaultPaint(type) {

      // "Field Atlas" palette (see _brand.yml): moss for area fills,
      // terracotta for points/lines — same roles the design system
      // assigns them (study areas vs. sampled data points), with a
      // paper-colored halo for contrast against the neutral Positron
      // basemap.
      switch (type) {

        case "fill":

          return {

            "fill-color":
              "#42583c",

            "fill-opacity":
              0.45,

            "fill-outline-color":
              "#2a2117"

          };


        case "line":

          return {

            "line-color":
              "#b0522c",

            "line-width":
              3,

            "line-opacity":
              0.85

          };


        case "circle":

          return {

            "circle-radius":
              6,

            "circle-color":
              "#b0522c",

            "circle-stroke-width":
              1,

            "circle-stroke-color":
              "#f3ede1"

          };


        default:

          return {};

      }

    }


    // ==========================================================
    // Stamp feature ids
    //
    // Assigns a deterministic `id` (its index in `features`) to every
    // feature that doesn't already have one — mutates in place, kept
    // as a separate step (not MapLibre's own `generateId: true`
    // source option) because it's uncertain whether
    // source.serialize().data (what getGeoJSON() reads) reflects
    // MapLibre-internal generated ids; stamping here guarantees
    // table() (shared/map.js) and a "click a rendered feature" map
    // handler both see the exact same id getGeoJSON() would return.
    // Preserves any id already present (e.g. from geopandas'
    // __geo_interface__, which sets one from the DataFrame index) —
    // only fills gaps, doesn't renumber everything.
    // ==========================================================

    _stampFeatureIds(
      data
    ) {

      if (
        data?.type === "FeatureCollection" &&
        Array.isArray(data.features)
      ) {

        data.features.forEach(
          (feature, index) => {

            feature.id ??=
              index;

          }
        );

      }

      return data;

    }


    // ==========================================================
    // Add GeoJSON
    // ==========================================================

    async addGeoJSON(
      sourceId,
      data,
      options = {}
    ) {

      await this.ready();


      if (
        this.map.getSource(
          sourceId
        )
      ) {

        throw new Error(
          `WebGeoDS.Map: source "${sourceId}" already exists.`
        );

      }


      this._stampFeatureIds(
        data
      );


      const layerId =
        options.layerId ??
        sourceId;


      const type =
        options.type ??
        this._detectGeometryType(
          data
        );


      const paint =
        options.paint ??
        this._defaultPaint(
          type
        );


      this.map.addSource(
        sourceId,
        {

          type:
            "geojson",

          data

        }
      );


      this.map.addLayer({

        id:
          layerId,

        type,

        source:
          sourceId,

        ...(options.layout
          ? {
              layout:
                options.layout
            }
          : {}),

        paint

      });


      return this;

    }


    // ==========================================================
    // Update GeoJSON
    // ==========================================================

    async updateGeoJSON(
      sourceId,
      data
    ) {

      await this.ready();


      const source =
        this.map.getSource(
          sourceId
        );


      if (!source) {

        throw new Error(
          `WebGeoDS.Map: source "${sourceId}" not found.`
        );

      }


      source.setData(
        data
      );


      return this;

    }


    // ==========================================================
    // Get GeoJSON
    //
    // Reads a geojson source's CURRENT data (post any setData()
    // calls) — via the source's own serialize(), MapLibre's public
    // API for this, not the private `_data` property. Returns null
    // if the source doesn't exist (e.g. before the first
    // addGeoJSON/setGeoJSON call, or after removeGeoJSON).
    // ==========================================================

    getGeoJSON(
      sourceId
    ) {

      const source =
        this.map.getSource(
          sourceId
        );

      return source ?
        source.serialize().data :
        null;

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
    // Requires shared/table.js on the page — always true for blog/
    // (loaded on every page via _quarto.yml's include-after-body) but
    // NOT for lessons/ (no table.js entry there) even though both sync
    // the same shared/map.js — checked explicitly so a lessons/ page
    // calling this fails with a clear message instead of a bare
    // "Cannot read properties of undefined".
    // ==========================================================

    table(
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

    }


    // ==========================================================
    // tableCell(sourceIds, containerId, Generators, options)
    //
    // `containerId` is optional: omit it (or pass null/undefined) and
    // tableCell() creates its OWN <div> once, the same idiom as this
    // class's own constructor (`new WebGeoDS.Map({...})` with no id
    // auto-creates its container) — no hand-written `<div id="...">`
    // needed elsewhere in the page. The cell then yields that element
    // on every render, so a plain (non `output: false`) {ojs} cell
    // assigning `tableCell(...)` displays it automatically via
    // Observable's own "a cell whose value is a DOM Node gets shown"
    // convention — same SAME element reference every time, just
    // rebuilt in place by shared/table.js's render(), so it never
    // needs to "move". Passing an explicit string still works exactly
    // as before (looked up via getElementById inside
    // table()/Table.render()).
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
    // ==========================================================

    tableCell(
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

      const SELECTION_SOURCE_ID =
        "__webgeods_selection";

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
        (feature) => {

          const type =
            this._detectGeometryType({
              type: "FeatureCollection",
              features: [feature]
            });

          return type === "line" ?
            { "line-color": "#ffeb3b", "line-width": 6 } :
            type === "circle" ?
              { "circle-color": "#ffeb3b", "circle-radius": 8 } :
              { "fill-color": "#ffeb3b", "fill-opacity": 0.6 };

        };

      return Generators.observe((change) => {

        let selectedKey =
          null;

        const render =
          async () => {

            // A selected feature can disappear out from under the
            // selection (e.g. the page's own "Reset map and table"
            // button empties the tracked source it came from) — drop
            // a selection that no longer resolves to anything instead
            // of leaving a stale overlay highlighted on the map.
            if (
              selectedKey !== null &&
              !findFeatureByKey(selectedKey)
            ) {

              selectedKey =
                null;

              await this.removeGeoJSON(
                SELECTION_SOURCE_ID
              );

            }

            await this.table(
              trackedIds(),
              container,
              { ...options, selectedKey, onRowClick: (row) => selectByKey(row.__key) }
            );

            // The SAME container every time (string id or the element
            // created above) — see the doc comment for why this makes
            // a plain {ojs} cell auto-display it correctly.
            change(container);

          };

        const selectByKey =
          async (key) => {

            if (key === selectedKey) {

              selectedKey =
                null;

              await this.removeGeoJSON(
                SELECTION_SOURCE_ID
              );

            } else {

              const feature =
                findFeatureByKey(key);

              if (!feature) {

                return;

              }

              selectedKey =
                key;

              await this.setGeoJSON(
                SELECTION_SOURCE_ID,
                { type: "FeatureCollection", features: [feature] },
                { paint: selectionPaint(feature) }
              );

              await this.fitToData(
                feature
              );

            }

            await render();

          };

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

              if (selectedKey !== null) {

                selectByKey(
                  selectedKey
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

        return () => {

          this.map.off("sourcedata", sourceHandler);
          this.map.off("click", clickHandler);

        };

      });

    }


    // ==========================================================
    // Set GeoJSON
    //
    // Create if necessary, otherwise update.
    //
    // If the source already exists but the new data's geometry
    // family doesn't match the layer's current MapLibre type (e.g.
    // the layer was created "fill" for polygons and the new data is
    // LineString), a plain source.setData() would silently draw
    // nothing — a "fill" layer never renders LineString features.
    // Detected via the same _detectGeometryType() addGeoJSON() itself
    // uses, so recreate the layer (removeGeoJSON() + addGeoJSON())
    // instead of just updating in place. This replaces what used to
    // be a hand-written "ensure_layer()" on the Python/R side of the
    // old calls-queue bridge — now a generic capability here, not
    // specific to any one page's data.
    // ==========================================================

    async setGeoJSON(
      sourceId,
      data,
      options = {}
    ) {

      await this.ready();


      const source =
        this.map.getSource(
          sourceId
        );


      if (source) {

        const layerId =
          options.layerId ??
          sourceId;

        const existingLayer =
          this.map.getLayer(
            layerId
          );

        const newType =
          options.type ??
          this._detectGeometryType(
            data
          );

        if (
          existingLayer &&
          existingLayer.type !== newType
        ) {

          await this.removeGeoJSON(
            sourceId,
            layerId
          );

          await this.addGeoJSON(
            sourceId,
            data,
            options
          );

        } else {

          source.setData(
            this._stampFeatureIds(
              data
            )
          );

        }

      }

      else {

        await this.addGeoJSON(
          sourceId,
          data,
          options
        );

      }


      return this;

    }


    // ==========================================================
    // Remove GeoJSON
    // ==========================================================

    async removeGeoJSON(
      sourceId,
      layerId = sourceId
    ) {

      await this.ready();


      if (
        this.map.getLayer(
          layerId
        )
      ) {

        this.map.removeLayer(
          layerId
        );

      }


      if (
        this.map.getSource(
          sourceId
        )
      ) {

        this.map.removeSource(
          sourceId
        );

      }


      return this;

    }


    // ==========================================================
    // addMarkers(sourceId, options) / clearMarkers(sourceId)
    //
    // Part of the JS-first visualization layer: R/Python answer "what
    // is this data" (plain GeoJSON, optionally with WebGeoDS diagnostic
    // properties like `valid`/`reason`/`location` — a convention, not
    // a requirement `map.js` enforces anywhere), JS/OJS answers "what
    // should the user see". Deliberately generic — NOT
    // "showErrors()": this method has no notion of "error", the
    // calling page decides what a marker means via `options.filter`.
    //
    // options.property — shorthand: use `properties[property]` as the
    // marker's [lng, lat] (a marker is placed for every feature where
    // that property isn't null/undefined). options.filter/position —
    // functions, for anything the shorthand doesn't cover:
    // filter(feature) => bool, position(feature) => [lng, lat].
    // options.color — passed straight to `maplibregl.Marker`.
    //
    // Clears this source's own previous markers first (not other
    // sources') — same "create if missing, else replace" shape used
    // throughout this class, so a reactive OJS cell can call this on
    // every update without accumulating stale markers.
    // ==========================================================

    addMarkers(
      sourceId,
      options = {}
    ) {

      const {
        property,
        filter,
        position,
        color = "#e05252"
      } = options;

      const pos =
        position ??
        (property ?
          (feature) => feature.properties?.[property] :
          null);

      if (!pos) {

        throw new Error(
          "WebGeoDS.Map: addMarkers() needs options.property or options.position."
        );

      }

      const filterFn =
        filter ??
        ((feature) => pos(feature) != null);

      this.clearMarkers(sourceId);

      const features =
        this.getGeoJSON(sourceId)?.features ??
        [];

      const markers =
        features
          .filter(filterFn)
          .map((feature) =>
            new window.maplibregl.Marker({ color })
              .setLngLat(pos(feature))
              .addTo(this.map)
          );

      this._markers ??=
        new Map();

      this._markers.set(
        sourceId,
        markers
      );

      return this;

    }

    clearMarkers(
      sourceId
    ) {

      const markers =
        this._markers?.get(sourceId);

      if (markers) {

        markers.forEach(
          (marker) => marker.remove()
        );

        this._markers.delete(sourceId);

      }

      return this;

    }


    // ==========================================================
    // highlight(sourceId, featureIds, options) / clearHighlights(sourceId)
    //
    // A DEDICATED overlay layer (`${sourceId}__highlight`), not a
    // mutation of the base layer's own paint/filter — undoing a paint
    // override in place would mean reconstructing whatever the paint
    // was before, which this class doesn't track. An extra layer
    // needs no such bookkeeping: clearHighlights() just removes it.
    //
    // Matches features by their GeoJSON top-level `id` (MapLibre's own
    // `["id"]` expression), not a properties key — the standard
    // MapLibre way to identify a feature, not a WebGeoDS convention.
    // Layer type/paint default to whatever `_detectGeometryType()`
    // already infers for this source's data (fill/line/circle), same
    // as `addGeoJSON()` uses — overridable via options.paint.
    // ==========================================================

    highlight(
      sourceId,
      featureIds,
      options = {}
    ) {

      const highlightLayerId =
        `${sourceId}__highlight`;

      const layerType =
        options.type ??
        this._detectGeometryType(
          this.getGeoJSON(sourceId)
        );

      const paint =
        options.paint ??
        (layerType === "line" ?
          { "line-color": "#ffeb3b", "line-width": 6 } :
          layerType === "circle" ?
            { "circle-color": "#ffeb3b", "circle-radius": 8 } :
            { "fill-color": "#ffeb3b", "fill-opacity": 0.6 });

      const filter =
        ["in", ["id"], ["literal", featureIds]];

      if (
        this.map.getLayer(
          highlightLayerId
        )
      ) {

        this.map.setFilter(
          highlightLayerId,
          filter
        );

      } else {

        this.map.addLayer({

          id:
            highlightLayerId,

          type:
            layerType,

          source:
            sourceId,

          paint,

          filter

        });

      }

      return this;

    }

    clearHighlights(
      sourceId
    ) {

      const highlightLayerId =
        `${sourceId}__highlight`;

      if (
        this.map.getLayer(
          highlightLayerId
        )
      ) {

        this.map.removeLayer(
          highlightLayerId
        );

      }

      return this;

    }


    // ==========================================================
    // Calculate GeoJSON bounds
    // ==========================================================

    getBounds(data) {

      const bounds =
        new this._LngLatBounds();


      const visit =
        coordinates => {

          // Coordinate [lng, lat]

          if (
            Array.isArray(
              coordinates
            ) &&
            typeof coordinates[0] ===
              "number" &&
            typeof coordinates[1] ===
              "number"
          ) {

            bounds.extend(
              coordinates
            );

            return;

          }


          // Nested coordinates

          if (
            Array.isArray(
              coordinates
            )
          ) {

            for (
              const child
                of coordinates
            ) {

              visit(child);

            }

          }

        };


      const visitGeometry =
        geometry => {

          if (
            geometry?.coordinates
          ) {

            visit(
              geometry.coordinates
            );

          }

        };


      if (
        data?.type ===
        "FeatureCollection"
      ) {

        for (
          const feature
            of data.features ?? []
        ) {

          visitGeometry(
            feature.geometry
          );

        }

      }


      else if (
        data?.type ===
        "Feature"
      ) {

        visitGeometry(
          data.geometry
        );

      }


      else if (
        data?.coordinates
      ) {

        visit(
          data.coordinates
        );

      }


      return bounds;

    }


    // ==========================================================
    // Fit map to GeoJSON
    // ==========================================================

    async fitToData(
      data,
      options = {}
    ) {

      await this.ready();


      const bounds =
        this.getBounds(
          data
        );


      if (
        bounds.isEmpty()
      ) {

        return this;

      }


      this.map.fitBounds(
        bounds,
        {

          padding:
            options.padding ??
            40,

          duration:
            options.duration ??
            1000,

          maxZoom:
            options.maxZoom ??
            15,

          ...options

        }
      );


      return this;

    }


    // ==========================================================
    // Resize
    // ==========================================================

    async resize() {

      await this.ready();

      this.map.resize();

      return this;

    }


    // ==========================================================
    // Destroy
    // ==========================================================

    destroy() {

      // Also unregisters from find() — see _cleanup(), shared with
      // the failed-init path in _initialize().
      this._cleanup();

    }

  }


  // ============================================================
  // Public WebGeoDS API
  // ============================================================

  window.WebGeoDS.Map =
    WebGeoDSMap;


})();
/**
 * WebGeoDS.Map
 *
 * MapLibre GL JS wrapper: constructor/lifecycle, vector geometry CRUD
 * (addGeoJSON/setGeoJSON/getGeoJSON/removeGeoJSON), highlight/bounds/
 * fit, markers. Raster rendering (setRasterImage() and friends) and
 * the table/cross-link engine (table()/tableCell()) are separate
 * files that extend this same class via prototype augmentation --
 * see shared/map-raster.js and shared/map-table.js, both of which
 * must load AFTER this file.
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

  // _tableCellCounter/_tableSelections used to live here too, but
  // both are read AND written from shared/map-table.js (tableCell())
  // as well as from this class's own static findTableSelection() --
  // promoted to real static class fields (WebGeoDSMap._tableCellCounter
  // / WebGeoDSMap._tableSelections, declared in the class body below)
  // so both files see the exact same state, not two independent
  // copies by accident.


  // ============================================================
  // designToken(name, fallback) — read a CSS custom property
  // ============================================================
  //
  // MapLibre's paint expressions need a real color string, not a CSS
  // var() reference — it renders via WebGL/canvas, not the DOM/CSSOM,
  // so it never resolves var() itself the way a stylesheet rule
  // would. Before this, the palette below was duplicated as literal
  // hex, hand-copied from shared/styles.css's :root block and already
  // found to have drifted from it in one spot (addMarkers()'s default
  // marker color happened to still match --dataviz-invalid, by luck,
  // not by reference) — see roadmap-acquisizione.md's "Field Atlas"
  // audit. Reading the custom property directly, on every call rather
  // than caching, means a future dark-mode toggle (redefining these
  // under prefers-color-scheme/a [data-theme] attribute) needs no
  // extra invalidation here — this always sees the value that's live
  // right now. Falls back to the pre-fix literal only if the property
  // is somehow unset (styles.css not loaded yet).
  function designToken(name, fallback) {

    const value =
      getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();

    return value || fallback;

  }


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
    // _tableCellCounter/_tableSelections — state for shared/
    // map-table.js's tableCell(), which lives in a separate file but
    // reads/writes these as WebGeoDSMap._tableCellCounter/
    // WebGeoDSMap._tableSelections. Declared here (not there) because
    // findTableSelection() below needs them to exist even on a page
    // that never loads map-table.js at all.
    //
    // _tableCellCounter: one per tableCell() call, not per
    // WebGeoDSMap instance -- keys a per-call selection overlay
    // source so two tableCell() calls on the SAME map (e.g. one per
    // language, each tracking its own source) don't share one
    // overlay and clobber each other's highlight; also auto-names a
    // call's own _tableSelections entry when the caller doesn't give
    // one an explicit id.
    //
    // _tableSelections: the public entry point for an external
    // consumer (a Vega-Lite chart, built for the map<->table
    // cross-link work -- see roadmap-acquisizione.md) to join a
    // SPECIFIC tableCell() call's row selection: keyed by that call's
    // id (explicit `options.id`, or an auto-generated one), not
    // global, because a page can have more than one tableCell() live
    // at once (e.g. one per language) each with its own independent
    // selection. Populated/cleared by tableCell() itself, looked up
    // via findTableSelection() below -- same find-by-id idiom as
    // _instances/find() above, deliberately, for a consumer that
    // isn't itself an {ojs} cell able to just reference a variable.
    // ----------------------------------------------------------

    static _tableCellCounter = 0;
    static _tableSelections = new Map();


    // ----------------------------------------------------------
    // findTableSelection(id) — look up a live tableCell() call's
    // selection controller by its id (see tableCell()'s own doc
    // comment for the full story). Returns
    // { select(key), selectMany(keys), getSelectedKey(),
    // getSelectedKeys(), element } or undefined if no tableCell() with
    // that id is currently mounted. `select(key)` mirrors clicking
    // that row/feature by hand — same toggle-off-if-already-selected
    // behavior; `selectMany(keys)` is the same mechanism for selecting
    // several features at once (e.g. every point in a class); `element`
    // is the same container tableCell() returned, the thing to
    // addEventListener() SELECTION_CHANGE_EVENT on.
    // ----------------------------------------------------------

    static findTableSelection(id) {

      return WebGeoDSMap._tableSelections.get(id);

    }


    // ----------------------------------------------------------
    // Event name dispatched on a tableCell() call's container
    // whenever ITS selection changes, from ANY cause (a map click, a
    // table row click, or another consumer calling .select()/
    // .selectMany()) — event detail is `{ key, keys }`: `key` is the
    // single selected key, or null when the selection is empty OR
    // holds more than one (kept for existing single-select-only
    // consumers); `keys` is the full array either way.
    // A named constant instead of a bare string literal so a distant
    // caller (a Vega-Lite chart cell) doesn't have to retype/guess it.
    // ----------------------------------------------------------

    static SELECTION_CHANGE_EVENT = "webgeods:selectionchange";


    // DEFAULT_RASTER_RAMP / MAX_RASTER_PREVIEW_DIM: see
    // shared/map-raster.js, which sets both as static properties on
    // this class (WebGeoDSMap.DEFAULT_RASTER_RAMP = ...) rather than
    // declaring them here — same file that owns the raster methods
    // that use them.


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

      // "Field Atlas" palette (see _brand.yml, read live via
      // designToken() — see its own comment for why): moss for area
      // fills, terracotta for points/lines — same roles the design
      // system assigns them (study areas vs. sampled data points),
      // with a paper-colored halo for contrast against the neutral
      // Positron basemap.
      switch (type) {

        case "fill":

          return {

            "fill-color":
              designToken("--muschio", "#42583c"),

            "fill-opacity":
              0.45,

            "fill-outline-color":
              designToken("--inchiostro", "#2a2117")

          };


        case "line":

          return {

            "line-color":
              designToken("--terracotta", "#b0522c"),

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
              designToken("--terracotta", "#b0522c"),

            "circle-stroke-width":
              1,

            "circle-stroke-color":
              designToken("--carta", "#f3ede1")

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


    // table()/tableCell(): see shared/map-table.js, which adds
    // them to this class via prototype augmentation -- the map<->
    // table cross-link engine, split out as the single largest
    // block in this file.


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

          // Same layer, same geometry type -- addGeoJSON() is never
          // reached, so options.paint/layout must be applied here
          // too, or a caller re-styling an already-added layer (e.g.
          // spatial-clustering-explorer.qmd going from the neutral
          // preview paint to per-cluster colors on Compute, same
          // source, same "circle" type) silently keeps the OLD paint
          // forever. Guarded on options.paint/layout being present so
          // a caller that omits them (e.g. geojson-shapefile-
          // validator.qmd's repair step, which intentionally keeps
          // whatever paint diagnose already set) is unaffected.
          if (
            existingLayer &&
            options.paint
          ) {

            for (
              const [key, value]
              of Object.entries(options.paint)
            ) {

              this.map.setPaintProperty(
                layerId,
                key,
                value
              );

            }

          }

          if (
            existingLayer &&
            options.layout
          ) {

            for (
              const [key, value]
              of Object.entries(options.layout)
            ) {

              this.map.setLayoutProperty(
                layerId,
                key,
                value
              );

            }

          }

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


    // Raster methods (_sampleRasterRamp, _renderRasterCanvas,
    // _downsampleRasterForPreview, setRasterImage, removeRasterImage):
    // see shared/map-raster.js, which adds them to this class via
    // prototype augmentation -- fully self-contained, no shared
    // state needed with the rest of this file.

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
        color = designToken("--dataviz-invalid", "#e05252")
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

      const selection =
        designToken("--dataviz-selection", "#ffeb3b");

      const paint =
        options.paint ??
        (layerType === "line" ?
          { "line-color": selection, "line-width": 6 } :
          layerType === "circle" ?
            { "circle-color": selection, "circle-radius": 8 } :
            { "fill-color": selection, "fill-opacity": 0.6 });

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


      // getBounds()'s own bounds.extend(coordinates) constructs a
      // real MapLibre LngLat internally, which THROWS immediately on
      // an out-of-range latitude (must be -90..90) — not a
      // hypothetical case: a file whose CRS doesn't match its actual
      // coordinates (e.g. Web Mercator meters read as if they were
      // lon/lat degrees — see geospatial-file-inspection.qmd's own
      // CRS-mismatch example) produces exactly this. Every caller of
      // fitToData() ultimately reads an uploaded file's own
      // coordinates, so this is a real, reachable failure for any of
      // them, not just that one teaching example. Caught here once,
      // for every caller, instead of wrapping each call site
      // individually: "can't zoom to this" is a reasonable no-op for
      // a zoom-to-fit helper, not a reason to break whatever reactive
      // cell called it.
      let bounds;

      try {

        bounds =
          this.getBounds(
            data
          );

      } catch (err) {

        console.warn(
          `WebGeoDS.Map: fitToData() couldn't compute bounds (${err.message || err}) — leaving the map where it is.`
        );

        return this;

      }


      if (
        bounds.isEmpty()
      ) {

        return this;

      }


      try {

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

      } catch (err) {

        console.warn(
          `WebGeoDS.Map: fitToData() couldn't fit to bounds (${err.message || err}) — leaving the map where it is.`
        );

      }


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

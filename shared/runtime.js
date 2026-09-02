/**
 * WebGeoDS.Runtime
 *
 * Runtime Manager — handles exclusively the runtime lifecycle:
 *
 *   - Pyodide
 *   - WebR
 *
 * Contains no API for executing code. That is implemented in:
 *
 *   - python.js
 *   - r.js
 *
 * Runtimes are loaded lazily, only once each:
 *
 *   WebGeoDS.Runtime.python() -> loads (or returns) the Python worker
 *   WebGeoDS.Runtime.r()      -> loads (or returns) WebR
 *
 * Exposes:
 *
 *   window.WebGeoDS.Runtime        (shared singleton instance)
 *   window.WebGeoDS.RuntimeManager (class, for custom instances)
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

  // Versions kept only here: a future upgrade touches a single
  // line. Verify them empirically (Network tab / release notes)
  // before changing them, as was done for the CodeMirror versions.
  const DEFAULT_CONFIG = {

    python: {
      // Self-hosted on GitHub Pages (DSwing/webgeods-assets) instead
      // of cdn.jsdelivr.net: same core files plus the full geopandas
      // dependency closure (16 wheels — geopandas, shapely, fiona,
      // pyproj, pandas, numpy and their own dependencies), laid out
      // flat exactly like jsdelivr's own folder so pyodide-lock.json
      // resolution and `pyodide.loadPackage(["geopandas"])` keep
      // working unmodified — nothing in python.js/pythonWorkerEntry()
      // needed to change for this.
      indexURL:
        "https://dswing.github.io/webgeods-assets/pyodide/v0.29.4/"
      // Other keys in here (e.g. packages, stdLibURL) are passed to
      // loadPyodide() as-is — see pythonWorkerEntry() below. A
      // custom `stdout`/`stderr` doesn't make sense here: capture
      // happens per-execution in pythonWorkerEntry(), not at the
      // instance level.
    },

    r: {
      // Self-hosted on GitHub Pages (DSwing/webgeods-assets) instead
      // of webr.r-wasm.org/repo.r-wasm.org: `url` below is where the
      // JS glue module itself is imported from; `baseUrl`/`repoUrl`
      // (passed to the WebR constructor in _loadR()) are webR's own
      // documented options for where it fetches its WASM/data files
      // and R packages respectively — mirrored 1:1 from real captured
      // network requests, including the sf/geojsonsf/terra dependency
      // closure, so `webr.installPackages(["sf","geojsonsf","terra"])`
      // keeps working unmodified.
      //
      // Pinned to v0.4.3 (R 4.4.2, ABI contrib/4.4) rather than the
      // newer v0.6.0 (R 4.6.0, contrib/4.6): terra 1.9-27 — the
      // version webR 0.6.0 installs — fails to load its namespace on
      // webR 0.6.0/0.5.4 with
      // `TypeError: resolved is not a function` (open upstream bug,
      // r-wasm/webr#621: 18 additional PROJ symbols terra 1.9-27
      // imports that don't resolve in the WASM binding). Verified
      // directly against the official webR build, not just the issue
      // report. terra 1.8-42 on webR 0.4.3 loads without this problem.
      // Revert to a newer webR once that issue is closed upstream.
      url:
        "https://dswing.github.io/webgeods-assets/webr/v0.4.3/webr.mjs",
      baseUrl:
        "https://dswing.github.io/webgeods-assets/webr/v0.4.3/",
      repoUrl:
        "https://dswing.github.io/webgeods-assets/webr/repo/"
      // `channelType` is forced to PostMessage in _loadR() below
      // (needs `ChannelType` imported from webr.mjs, not available
      // here) — see the comment there for why.
    }

  };


  // ============================================================
  // Python worker — body executed INSIDE the dedicated Web Worker
  // ============================================================
  //
  // Unlike webR (which always runs R in its own worker regardless of
  // `channelType`), Pyodide has no automatic worker-offload — running
  // it on the main thread would let a heavy or infinite-loop student
  // script freeze the whole page. Hosting it in a dedicated worker
  // keeps the UI responsive and gives terminatePython() a real,
  // immediate `worker.terminate()` to call.
  //
  // The function body is serialized via `.toString()` into a Blob
  // (see _loadPython()) instead of living in its own .js file, so
  // the page stays one self-contained HTML file under
  // `embed-resources: true`. Consequence: the body can't close over
  // any outer variable — once it runs inside the worker it has no
  // access to runtime.js's scope, only to whatever arrives via
  // postMessage.
  //
  // Message protocol (plain postMessage — a PyProxy can't cross the
  // worker boundary, it's converted first by toTransferable()):
  //
  //   → { type: "init", config }
  //   ← { type: "ready" } | { type: "init-error", message }
  //
  //   → { type: "run", id, code, packages, micropipUrls }
  //   ← { type: "result", id, result, stdout } | { type: "error", id, message }
  //
  //   micropipUrls: absolute wheel URLs (already resolved against
  //   indexURL by python.js — this file has no outer-scope access to
  //   it) for packages not in Pyodide's own curated index
  //   (pyodide-lock.json). Installed via micropip.install(urls)
  //   rather than by name: a name-based install resolves any
  //   dependency missing from micropip's explicit list against
  //   pypi.org over the network — exactly what vendoring exists to
  //   avoid. Dependencies that ARE in the local index (jinja2,
  //   pydantic, ...) still resolve from there automatically; only the
  //   ones that aren't need an explicit URL.
  function pythonWorkerEntry() {

    "use strict";

    let pyodide =
      null;

    // Sequential queue: without this, two "run" messages arriving
    // close together (e.g. two cells on the same page run almost
    // simultaneously) would have their respective awaits interleave
    // — pyodide.setStdout() is shared mutable state on the same
    // instance — corrupting the stdout capture of one or the other
    // execution.
    let queue =
      Promise.resolve();

    const enqueue = (task) => {

      const result =
        queue.then(task, task);

      queue =
        result.then(() => {}, () => {});

      return result;

    };

    // A PyProxy (NumPy array, pandas DataFrame, any Python object
    // instance...) can't cross postMessage — structured clone rejects
    // it with a DataCloneError. `.toJs()` converts native Python
    // containers (dict/list/set) to JS; anything else falls back to
    // `String(value)` (Python's str()/repr()), which is always
    // transferable.
    //
    // pandas.DataFrame/geopandas.GeoDataFrame are neither native
    // containers nor buffer-protocol like an ndarray, so `.toJs()`
    // throws on both and they'd hit that string fallback — a
    // space-aligned text table for pandas, and geometry as literal
    // "POINT (...)" text for geopandas. The two functions below
    // intercept these two cases before the generic fallback, so they
    // come out as structured data instead.
    const hasCallableAttr = (obj, name) => {
      try {
        return typeof obj[name] === "function";
      } catch (err) {
        // A Python attribute access can throw on a PyProxy; treat
        // that as "attribute absent" rather than propagating.
        return false;
      }
    };

    const hasDefinedAttr = (obj, name) => {
      try {
        return typeof obj[name] !== "undefined";
      } catch (err) {
        return false;
      }
    };

    // geopandas.GeoDataFrame/GeoSeries: recognized by duck-typing on
    // .crs (absent on a plain pandas DataFrame) plus .to_json (which
    // geopandas overrides to emit real GeoJSON, not repr() text).
    //
    // GeoDataFrame.to_json() does not reproject — it writes
    // coordinates in whatever CRS the frame currently has. Since this
    // runs automatically for any cell that returns a GeoDataFrame
    // (the author never opts in), a non-WGS84 CRS would otherwise
    // produce GeoJSON that looks fine but places points in the wrong
    // spot on a MapLibre map (which expects WGS84 lon/lat). So: if a
    // CRS is set, reproject to EPSG:4326 first (a no-op if it already
    // is); if reprojection fails, still return the original value —
    // wrong-CRS GeoJSON beats no GeoJSON.
    const tryGeoDataFrameToGeoJson = (value) => {
      if (
        !hasDefinedAttr(value, "crs") ||
        !hasCallableAttr(value, "to_json")
      ) {
        return undefined;
      }
      let geoValue = value;
      if (
        value.crs !== null &&
        value.crs !== undefined &&
        hasCallableAttr(value, "to_crs")
      ) {
        try {
          geoValue = value.to_crs("EPSG:4326");
        } catch (err) {
          // Reprojection failed: fall back to the original value
          // instead of failing the whole cell over a
          // projection-only issue — see comment above.
        }
      }
      try {
        return JSON.parse(geoValue.to_json());
      } catch (err) {
        return undefined;
      }
    };

    // pandas.DataFrame: recognized by .to_dict + .columns (a Series
    // has .to_dict() but not .columns, so it correctly falls through
    // to the generic .toJs() path instead). "records" orientation
    // gives an array of row objects — the natural JS shape for
    // tabular data. The result is still a PyProxy (a list of dicts),
    // so it's handed to the existing .toJs() conversion below rather
    // than reimplemented here.
    const tryDataFrameToRecords = (value) => {
      if (
        !hasCallableAttr(value, "to_dict") ||
        !hasDefinedAttr(value, "columns")
      ) {
        return undefined;
      }
      try {
        return value.to_dict("records");
      } catch (err) {
        return undefined;
      }
    };

    // Text representation shown in the cell's output box, kept
    // separate from the value toTransferable() converts for
    // onRun/OJS — so the box can show the familiar column-aligned
    // table (.toString() on a DataFrame/GeoDataFrame PyProxy calls
    // Python's str()) while the returned value stays the
    // JS-structured form (records / GeoJSON) usable for reactivity
    // and mapping. Called on the original value, before
    // toTransferable() replaces it. See result() in code-cell.js for
    // where displayText is consumed.
    const captureDisplayText = (value) => {

      if (
        value === undefined ||
        value === null ||
        typeof value !== "object"
      ) {
        return undefined;
      }

      const isDataFrame =
        hasCallableAttr(value, "to_dict") &&
        hasDefinedAttr(value, "columns");

      const isGeoDataFrame =
        hasDefinedAttr(value, "crs") &&
        hasCallableAttr(value, "to_json");

      if (!isDataFrame && !isGeoDataFrame) {
        return undefined;
      }

      try {
        return value.toString();
      } catch (err) {
        return undefined;
      }

    };

    const toTransferable = (value) => {

      if (value === undefined || value === null) {
        return value;
      }

      if (typeof value === "object") {

        const geojson = tryGeoDataFrameToGeoJson(value);
        if (geojson !== undefined) {
          return geojson;
        }

        const records = tryDataFrameToRecords(value);
        if (records !== undefined) {
          value = records;
        }

      }

      if (
        typeof value === "object" &&
        typeof value.toJs === "function"
      ) {

        try {

          value =
            value.toJs({ dict_converter: Object.fromEntries });

          if (ArrayBuffer.isView(value)) {
            value = Array.from(value);
          }

        } catch (err) {

          return String(value);

        }

      }

      try {

        structuredClone(value);
        return value;

      } catch (err) {

        return String(value);

      }

    };

    const runOnce = async ({ id, code, packages, micropipUrls }) => {

      try {

        if (packages && packages.length) {
          await pyodide.loadPackage(packages);
        }

        if (micropipUrls && micropipUrls.length) {
          await pyodide.loadPackage("micropip");
          const micropip = pyodide.pyimport("micropip");
          await micropip.install(micropipUrls);
        }

        const stdout =
          [];

        pyodide.setStdout({
          batched: (line) => stdout.push(line)
        });

        let result;

        try {

          result =
            await pyodide.runPythonAsync(code);

        } finally {

          pyodide.setStdout();

        }

        // Captured on `result` BEFORE toTransferable() below — see
        // the comment on captureDisplayText() for why the two stay
        // independent from here on.
        const displayText =
          captureDisplayText(result);

        self.postMessage({
          type: "result",
          id,
          result: toTransferable(result),
          displayText,
          stdout
        });

      } catch (err) {

        self.postMessage({
          type: "error",
          id,
          message: err && err.message ? err.message : String(err)
        });

      }

    };

    self.addEventListener("message", (event) => {

      const msg =
        event.data;

      if (!msg) {
        return;
      }

      if (msg.type === "init") {

        (async () => {

          try {

            const indexURL =
              msg.config.indexURL;

            const moduleURL =
              indexURL + "pyodide.mjs";

            const pyodideModule =
              await import(moduleURL);

            pyodide =
              await pyodideModule.loadPyodide(msg.config);

            self.postMessage({ type: "ready" });

          } catch (err) {

            self.postMessage({
              type: "init-error",
              message: err && err.message ? err.message : String(err)
            });

          }

        })();

        return;

      }

      if (msg.type === "run") {
        enqueue(() => runOnce(msg));
        return;
      }

      if (msg.type === "writeFile") {
        // Same queue as "run": a writeFile immediately followed by a
        // run() call that reads that path (the actual use case — a
        // user-uploaded file consumed by the cell right after) must
        // complete first, not interleave.
        enqueue(() => {
          try {
            pyodide.FS.writeFile(msg.path, new Uint8Array(msg.data));
            self.postMessage({ type: "result", id: msg.id, result: null, stdout: [] });
          } catch (err) {
            self.postMessage({
              type: "error",
              id: msg.id,
              message: err && err.message ? err.message : String(err)
            });
          }
        });
        return;
      }

      if (msg.type === "deleteFile") {
        // Best-effort cleanup (e.g. an older /uploaded.geojson left
        // over from a previous upload, which would otherwise shadow a
        // newly uploaded shapefile at a different path) — a missing
        // file is not an error here, unlike writeFile's failures.
        enqueue(() => {
          try {
            pyodide.FS.unlink(msg.path);
          } catch (err) {
            // Ignored: the file may simply not exist.
          }
          self.postMessage({ type: "result", id: msg.id, result: null, stdout: [] });
        });
        return;
      }

    });

  }


  // ============================================================
  // RuntimeManager
  // ============================================================

  class RuntimeManager extends EventTarget {


    // ----------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------

    constructor(
      config = {}
    ) {

      super();


      this.config = {

        python: {
          ...DEFAULT_CONFIG.python,
          ...(config.python ?? {})
        },

        r: {
          ...DEFAULT_CONFIG.r,
          ...(config.r ?? {})
        }

      };


      // Runtime instances
      //
      // `_python` is a Web Worker (no longer the direct Pyodide
      // instance — see pythonWorkerEntry()/_loadPython()); `_r`
      // stays the WebR instance returned by `new WebR(...).init()`,
      // which already manages its own worker internally.

      this._python =
        null;

      this._r =
        null;


      // Loading promises
      //
      // It's important to keep the Promise:
      //
      // request 1 ─┐
      // request 2 ─┼──> same initialization
      // request 3 ─┘
      //
      this._pythonPromise =
        null;

      this._rPromise =
        null;


      // State

      this._status = {
        python: "idle",
        r: "idle"
      };

    }


    // ----------------------------------------------------------
    // Observable state
    //
    // Every transition emits a "statuschange" event — enables
    // building a reactive gate (e.g. Generators.observe in OJS)
    // instead of polling status(). python.js relies on this same
    // event to notice when the Python worker gets terminated and
    // clean up any pending requests.
    // ----------------------------------------------------------

    _setStatus(
      runtime,
      status
    ) {

      this._status[runtime] =
        status;

      this.dispatchEvent(
        new CustomEvent("statuschange", {
          detail: { runtime, status }
        })
      );

    }


    // ==========================================================
    // PYTHON / PYODIDE (in a dedicated Web Worker)
    // ==========================================================

    async python() {

      // Runtime already ready
      if (this._python) {
        return this._python;
      }

      // Runtime currently loading
      if (this._pythonPromise) {
        return this._pythonPromise;
      }

      this._setStatus(
        "python",
        "loading"
      );

      this._pythonPromise =
        this._loadPython();

      try {

        this._python =
          await this._pythonPromise;

        this._setStatus(
          "python",
          "ready"
        );

        return this._python;

      } catch (error) {

        this._setStatus(
          "python",
          "error"
        );

        // Allow a retry after an error
        this._pythonPromise =
          null;

        throw error;

      }

    }


    async _loadPython() {

      // pythonWorkerEntry is serialized and wrapped in a Blob: see
      // the comment above its definition for why this pattern is
      // used instead of a separate .js file.
      const workerSource =
        "(" + pythonWorkerEntry.toString() + ")();";

      const workerBlob =
        new Blob(
          [workerSource],
          { type: "application/javascript" }
        );

      const workerURL =
        URL.createObjectURL(workerBlob);

      const worker =
        new Worker(workerURL);

      try {

        await new Promise((resolve, reject) => {

          const onMessage = (event) => {

            const msg =
              event.data;

            if (!msg) {
              return;
            }

            if (msg.type === "ready") {
              worker.removeEventListener("message", onMessage);
              resolve();
            } else if (msg.type === "init-error") {
              worker.removeEventListener("message", onMessage);
              reject(
                new Error(
                  msg.message ||
                  "Pyodide initialization failed in the worker."
                )
              );
            }

          };

          worker.addEventListener("message", onMessage);

          worker.addEventListener(
            "error",
            (event) => {
              reject(
                new Error(
                  event.message ||
                  "Error in the Python worker."
                )
              );
            },
            { once: true }
          );

          worker.postMessage({
            type: "init",
            config: this.config.python
          });

        });

        return worker;

      } catch (err) {

        // Init failed: nothing will keep a reference to this worker
        // anymore — terminate it explicitly instead of leaving it
        // alive and unusable in the background.
        worker.terminate();
        throw err;

      } finally {

        // The Blob has already been read by the worker at this
        // point (successfully or not): revoke the URL to free the
        // browser's internal entry. Doesn't terminate the worker
        // itself.
        URL.revokeObjectURL(workerURL);

      }

    }


    // ==========================================================
    // R / WEBR
    // ==========================================================

    async r() {

      // Runtime already ready
      if (this._r) {
        return this._r;
      }

      // Runtime currently loading
      if (this._rPromise) {
        return this._rPromise;
      }

      this._setStatus(
        "r",
        "loading"
      );

      this._rPromise =
        this._loadR();

      try {

        this._r =
          await this._rPromise;

        this._setStatus(
          "r",
          "ready"
        );

        return this._r;

      } catch (error) {

        this._setStatus(
          "r",
          "error"
        );

        // Allow a retry after an error
        this._rPromise =
          null;

        throw error;

      }

    }


    async _loadR() {

      // `url` is only used by our loader (which file to import) —
      // it must not be passed to the WebR constructor, hence the
      // explicit exclusion via destructuring.
      const {
        url,
        ...webROptions
      } =
        this.config.r;

      // WebR is imported only when requested.
      const { WebR, ChannelType } =
        await import(url);

      // Force PostMessage instead of leaving webR's auto-detect in
      // charge: Teachable disallows custom headers, so auto-detect
      // would land on PostMessage there anyway — forcing it makes
      // local dev match production instead of silently picking
      // SharedArrayBuffer whenever the dev environment happens to be
      // cross-origin isolated. (Multi-line R output loss was once
      // wrongly blamed on this channel; the real cause was
      // `shelter.captureR()`'s `withAutoprint: false` default, fixed
      // in r.js — unrelated to which channel is used.)
      const webR =
        new WebR({
          ...webROptions,
          channelType: webROptions.channelType ?? ChannelType.PostMessage
        });

      await webR.init();

      return webR;

    }


    // ==========================================================
    // STATUS
    // ==========================================================

    status() {

      return {
        python: this._status.python,
        r: this._status.r
      };

    }


    isPythonReady() {

      return this._status.python === "ready";

    }


    isRReady() {

      return this._status.r === "ready";

    }


    // ==========================================================
    // TERMINATE PYTHON
    // ==========================================================

    terminatePython() {

      if (!this._python) {
        return;
      }

      // `_python` is a real Web Worker: terminate() kills it
      // immediately — no SharedArrayBuffer/cross-origin isolation
      // needed, which makes this the mechanism a "stop" button can
      // hang off for a stuck execution. python.js listens for the
      // "statuschange" event this triggers to reject any pending
      // request.
      this._python.terminate();

      this._python =
        null;

      this._pythonPromise =
        null;

      this._setStatus(
        "python",
        "idle"
      );

    }


    // ==========================================================
    // TERMINATE R
    // ==========================================================

    terminateR() {

      if (!this._r) {
        return;
      }

      /*
       * WebR officially exposes close(), which closes
       * the communication channel.
       */
      try {

        this._r.close();

      } finally {

        this._r =
          null;

        this._rPromise =
          null;

        this._setStatus(
          "r",
          "idle"
        );

      }

    }


    // ==========================================================
    // TERMINATE EVERYTHING
    // ==========================================================

    terminateAll() {

      this.terminatePython();
      this.terminateR();

    }

  }


  // ============================================================
  // Public WebGeoDS API
  // ============================================================

  // The class stays available for anyone who needs a custom
  // instance (e.g. a different configuration for a specific page,
  // instead of the shared singleton).
  window.WebGeoDS.RuntimeManager =
    RuntimeManager;

  // Global singleton — the one python.js/r.js/code-cell.js will
  // normally use.
  window.WebGeoDS.Runtime =
    new RuntimeManager();


})();
/**
 * WebGeoDS.Python
 *
 * Python execution API on top of WebGeoDS.Runtime. Pyodide runs inside
 * a dedicated Web Worker (see pythonWorkerEntry() in runtime.js); this
 * file wraps that worker's message protocol — sending the code and
 * matching each response back to its caller — so no cell has to
 * reimplement it.
 *
 * Does not handle lifecycle (that's runtime.js's job, which creates
 * and terminates the worker) nor editor/UI (that's code-cell.js's
 * job).
 *
 * Exposes:
 *
 *   window.WebGeoDS.Python.run(code) -> Promise<{ result, stdout }>
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
  // Correlating worker responses
  // ============================================================

  // A single Python worker per page (WebGeoDS.Runtime singleton): we
  // just need to remember which worker instance the listener is
  // already attached to, and re-attach it if runtime.js creates a new
  // one after a terminatePython() followed by a new execution.
  let attachedWorker =
    null;

  let nextRequestId =
    0;

  const pending =
    new Map();


  const ensureListener = (worker) => {

    if (attachedWorker === worker) {
      return;
    }

    attachedWorker =
      worker;

    worker.addEventListener("message", (event) => {

      const msg =
        event.data;

      if (
        !msg ||
        msg.id === undefined ||
        !pending.has(msg.id)
      ) {
        return;
      }

      const { resolve, reject } =
        pending.get(msg.id);

      pending.delete(msg.id);

      if (msg.type === "error") {
        reject(new Error(msg.message));
      } else {
        resolve({
          result: msg.result,
          displayText: msg.displayText,
          stdout: msg.stdout || []
        });
      }

    });

  };


  // If the Python worker gets terminated
  // (WebGeoDS.Runtime.terminatePython() or terminateAll(), e.g. from
  // a future "stop" button) no pending request will ever receive a
  // response again: without this, the Promise returned by run() —
  // and thus the Run button of the cell that invoked it — would stay
  // stuck forever. We piggyback on the "statuschange" event already
  // exposed by runtime.js instead of introducing a new communication
  // channel between the two files.
  window.WebGeoDS.Runtime.addEventListener("statuschange", (event) => {

    const { runtime, status } =
      event.detail;

    if (runtime !== "python" || status !== "idle") {
      return;
    }

    if (pending.size > 0) {

      const error =
        new Error(
          "Python worker terminated before execution completed."
        );

      for (const { reject } of pending.values()) {
        reject(error);
      }

      pending.clear();

    }

    attachedWorker =
      null;

  });


  // ============================================================
  // micropip packages
  // ============================================================
  //
  // Packages not in Pyodide's own curated index (pyodide-lock.json —
  // covers "packages" below via pyodide.loadPackage) are installed
  // via micropip instead. A bare `micropip.install("name")` would
  // resolve any of ITS OWN dependencies missing from this explicit
  // list against pypi.org over the network — exactly the external
  // dependency this project vendors everything to avoid. So each
  // entry here must list every non-indexed wheel in the closure by
  // exact filename (resolved to a full URL against indexURL below);
  // dependencies that ARE in the local index (jinja2, pydantic,
  // pydantic_core, markupsafe, typing_extensions, typing_inspection,
  // annotated_types — vendored alongside geopandas, see
  // vendor-pyodide.sh) still resolve from there automatically, no URL
  // needed for those. Empty for now — no page currently requests a
  // micropip-only package; the mechanism (this map +
  // resolveMicropipUrls() + the `#| micropip:` cell option) stays
  // generic and ready for a future one.
  const MICROPIP_PACKAGES = {};

  function resolveMicropipUrls(names) {

    const indexURL =
      window.WebGeoDS.Runtime.config.python.indexURL;

    return names.flatMap((name) => {

      const files =
        MICROPIP_PACKAGES[name];

      if (!files) {
        throw new Error(
          `WebGeoDS.Python: unknown micropip package "${name}".`
        );
      }

      return files.map((file) => indexURL + file);

    });

  }


  // ============================================================
  // run
  // ============================================================

  /**
   * Runs Python code on the shared worker, capturing stdout
   * (print()) together with the value returned by the last
   * expression.
   *
   * @param {string} code Python code to run.
   * @param {object} [options]
   * @param {string[]} [options.packages] Packages to load before
   *   execution (e.g. `["geopandas", "shapely"]`). Not really
   *   optional: `runPythonAsync` does not auto-load packages imported
   *   by the code — a bare `import numpy as np` with no `packages`
   *   raises `ModuleNotFoundError`. Always declare what the code
   *   needs.
   * @param {string[]} [options.micropip] Packages not in Pyodide's own
   *   index, installed via micropip from vendored wheel URLs — see
   *   MICROPIP_PACKAGES above for the supported names.
   * @returns {Promise<{ result: unknown, displayText: string|undefined, stdout: string[] }>}
   *   result: the last expression's value. Already converted to a
   *   transferable structure on the worker side (see
   *   toTransferable() in runtime.js) — a PyProxy (e.g. a NumPy
   *   ndarray) couldn't cross postMessage as-is.
   *   displayText: only set for pandas.DataFrame/geopandas.GeoDataFrame
   *   (see captureDisplayText() in runtime.js) — Python's own str()
   *   text, the same aligned table a real Python REPL would print,
   *   captured before `result` above was converted. undefined for
   *   every other value; code-cell.js falls back to formatting
   *   `result` itself when this is undefined.
   *   stdout: lines printed during execution, in order.
   */
  async function run(code, { packages, micropip } = {}) {

    const worker =
      await window.WebGeoDS.Runtime.python();

    ensureListener(worker);

    const id =
      nextRequestId++;

    const micropipUrls =
      micropip && micropip.length
        ? resolveMicropipUrls(micropip)
        : undefined;

    return new Promise((resolve, reject) => {

      pending.set(id, { resolve, reject });

      worker.postMessage({
        type: "run",
        id,
        code,
        packages,
        micropipUrls
      });

    });

  }


  // ============================================================
  // writeFile
  // ============================================================

  /**
   * Writes bytes into Pyodide's virtual filesystem (MEMFS), so a
   * later run() call can read them back with a normal `open(path)` —
   * e.g. `geopandas.read_file(path)` on a user-uploaded GeoJSON.
   * Shares the same sequential worker queue as run(), so a writeFile
   * immediately followed by a run() reading that path is guaranteed
   * to see the file already written.
   * @param {string} path Absolute path inside the worker's MEMFS
   *   (e.g. "/uploaded.geojson").
   * @param {Uint8Array} data
   * @returns {Promise<void>}
   */
  async function writeFile(path, data) {

    const worker =
      await window.WebGeoDS.Runtime.python();

    ensureListener(worker);

    const id =
      nextRequestId++;

    await new Promise((resolve, reject) => {

      pending.set(id, { resolve, reject });

      worker.postMessage({
        type: "writeFile",
        id,
        path,
        data
      });

    });

  }


  // ============================================================
  // deleteFile
  // ============================================================

  /**
   * Best-effort delete of a path in Pyodide's virtual filesystem —
   * used to clean up a stale upload (e.g. an old /uploaded.geojson)
   * before writing a new one at a different path, so the old file
   * can't shadow the new upload in a "try this path, then that one"
   * read loop. A missing file is not an error (mirrors runtime.js's
   * worker-side handling).
   * @param {string} path
   * @returns {Promise<void>}
   */
  async function deleteFile(path) {

    const worker =
      await window.WebGeoDS.Runtime.python();

    ensureListener(worker);

    const id =
      nextRequestId++;

    await new Promise((resolve, reject) => {

      pending.set(id, { resolve, reject });

      worker.postMessage({
        type: "deleteFile",
        id,
        path
      });

    });

  }


  // ============================================================
  // Public WebGeoDS API
  // ============================================================

  window.WebGeoDS.Python = {
    run,
    writeFile,
    deleteFile
  };


})();
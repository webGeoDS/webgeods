/**
 *  WebGeoDS.R
 *  R execution API on top of WebGeoDS.Runtime.
 *  Wraps WebR management, shelter creation for memory handling,
 *  output stream capture (stdout/stderr) and package installation.
 *  Does not handle lifecycle (that's runtime.js's job) nor editor/UI
 *  (that's code-cell.js's job).
 *  Exposes:
 *  window.WebGeoDS.R.run(code, { packages }) -> Promise<{ result, stdout }>
 *  No ES module syntax is used so the file can be included
 *  directly by Quarto in the generated HTML.
 */
(() => {
  "use strict";

  // ============================================================
  // Namespace
  // ============================================================
  window.WebGeoDS = window.WebGeoDS || {};

  // ============================================================
  // Helper: RObject (webR proxy) -> native JS value
  // ============================================================
  /**
   * Zips a webR descriptor's names/values into a flat JS object,
   * using the index as key for unnamed elements (a partially-named
   * R list) instead of risking collisions on "".
   * @param {Array<string|null>} names
   * @param {Array<*>} values Already-converted values (not raw descriptors).
   * @returns {object}
   */
  function zipNamesValues(names, values) {
    const obj = {};
    values.forEach((value, i) => {
      const rawName = Array.isArray(names) ? names[i] : undefined;
      const key =
        (rawName !== null && rawName !== undefined && rawName !== "")
          ? rawName
          : String(i);
      obj[key] = value;
    });
    return obj;
  }

  /**
   * Recursively converts the raw descriptor returned by
   * RObject.toJs() ({type, names, values, ...}) into a "natural" JS
   * value: NULL becomes JS `null`; a named list/vector becomes a flat
   * JS object via zipNamesValues (names would otherwise be silently
   * dropped); an unnamed single-element atomic vector collapses to a
   * scalar.
   *
   * For a data.frame this gives a columnar shape —
   * {name: ["Rome","Milan"], population: [...]} — not row-wise
   * records: .toJs() only exposes R's internal column-wise list
   * structure, and transposing to rows would need the `class`/
   * `row.names` attributes it doesn't include here.
   *
   * For an sf object the "geometry" column stays raw coordinates,
   * with no geometry type or CRS attached — see the
   * conv-r-sf-geojson cell in test-architettura.qmd §16 for the
   * recommended pattern (explicit conversion on the R side) when
   * clean GeoJSON is needed instead.
   *
   * @param {*} raw The value returned by RObject.toJs() (or a nested
   *   descriptor within it).
   * @returns {*}
   */
  function convertRawRValue(raw) {
    if (!raw || typeof raw !== "object") {
      return raw;
    }

    const { type, names, values } = raw;

    if (type === "null") {
      return null;
    }

    if (!Array.isArray(values)) {
      // Unrecognized shape (e.g. an R closure, a non-convertible
      // "language object"): return the descriptor as-is instead of
      // risking silent data loss.
      return raw;
    }

    const convertedValues =
      values.map((value) =>
        (value && typeof value === "object" && "type" in value)
          ? convertRawRValue(value)
          : value
      );

    const hasNames =
      Array.isArray(names) &&
      names.some((name) => name !== null && name !== undefined && name !== "");

    if (hasNames) {
      return zipNamesValues(names, convertedValues);
    }

    if (type === "list") {
      return convertedValues;
    }

    // Unnamed atomic vector (character/double/integer/logical/...):
    // unchanged historical behavior — a single element collapses to
    // a scalar, otherwise it stays an array.
    return convertedValues.length === 1 ? convertedValues[0] : convertedValues;
  }

  /**
   * Converts an RObject/RProxy to a native JS value — see
   * convertRawRValue() for the actual conversion logic. Used both
   * for the final value (capture.result) and — see run() below —
   * for the fields of an R condition (message()/warning()), which in
   * webR arrive as an RObject rather than an already-ready string.
   * @param {*} rObj webR RObject/RProxy (must expose .toJs()).
   * @returns {Promise<*>}
   */
  async function rObjectToNativeJs(rObj) {
    if (!rObj || typeof rObj.toJs !== "function") {
      return rObj;
    }
    const raw = await rObj.toJs();
    return convertRawRValue(raw);
  }

  /**
   * Extracts the `message` field from an R condition
   * (list(message=..., call=...)) — entry.data for the
   * "message"/"warning"/"error" entries of capture.output.
   * Deliberately reads only the "message" field via `pluck("message")`
   * instead of converting the whole condition with `.toJs()`: the
   * condition's `call` field is an R "language object" that generic
   * `.toJs()` can't serialize, and would fail the whole conversion.
   * @param {*} rObj The condition's RObject (entry.data).
   * @returns {Promise<string|undefined>}
   */
  async function extractConditionMessage(rObj) {
    if (!rObj) {
      return undefined;
    }
    if (typeof rObj === "string") {
      return rObj;
    }
    if (typeof rObj.pluck !== "function") {
      return undefined;
    }
    const msgObj = await rObj.pluck("message");
    if (!msgObj) {
      return undefined;
    }
    const msg = await rObjectToNativeJs(msgObj);
    return typeof msg === "string" ? msg : undefined;
  }

  // ============================================================
  // run
  // ============================================================
  /**
   * Runs R code on the shared runtime, capturing stdout and stderr
   * separately, together with the value evaluated from the last
   * expression.
   * @param {string} code R code to run.
   * @param {object} [options]
   * @param {string[]} [options.packages] Packages to load explicitly before execution (e.g. ["sf", "dplyr"]).
   * @returns {Promise<{ result: unknown, stdout: string[], stderr: string[] }>}
   *   result: the last expression's value, converted to a native JS
   *   shape. stdout: "normal" output lines (cat(), print(),
   *   auto-print). stderr: message()/warning() lines, kept separate
   *   from stdout so code-cell.js can show them in their own block.
   */
  async function run(code, { packages } = {}) {
    // 1. Retrieve the singleton WebR instance from our Runtime Manager
    const webr = await window.WebGeoDS.Runtime.r();

    // 2. If specified, load/install the requested packages
    if (packages && packages.length > 0) {
      await webr.installPackages(packages);
    }

    // 3. Create a temporary Shelter for automatic memory management
    const shelter = await new webr.Shelter();

    // If terminateR()/terminateAll() closes the worker mid-execution
    // (e.g. "Terminate R" pressed while running), shelter.captureR()
    // may never resolve or reject on its own. Race it against the
    // "statuschange" event so the cell's Run button doesn't stay
    // disabled forever (same fix as python.js). Not a true
    // mid-execution interrupt — just a clean shutdown detected and
    // turned into a normal error.
    let onStatusChange;
    const terminated = new Promise((_, reject) => {
      onStatusChange = (event) => {
        const { runtime, status } = event.detail;
        if (runtime === "r" && status === "idle") {
          reject(new Error("R worker terminated before execution completed."));
        }
      };
      window.WebGeoDS.Runtime.addEventListener("statuschange", onStatusChange);
    });

    try {
      // 4. Run the code capturing console output, racing against a
      // possible external termination.
      // `withAutoprint: true` is required: shelter.captureR() defaults
      // to false, which means a value that's visible but not
      // explicitly printed (e.g. a cell's last line `1:5`, or an
      // auto-printed `sf` table) never reaches capture.output — only
      // explicit cat()/print()/message() calls do.
      const capture =
        await Promise.race([
          shelter.captureR(code, { withAutoprint: true }),
          terminated
        ]);

      // 5. Process the output lines, separating stdout from stderr
      //
      // Each element of capture.output is { type, data }, but the
      // shape of `data` depends on `type`: for "stdout"/"stderr" it's
      // already a plain string (a real write on the R connection,
      // captured via sink()). For "message"/"warning"/"error" — R
      // conditions captured via withCallingHandlers() — webR instead
      // gives an RObject, which extractConditionMessage() converts.
      const stdoutLines = [];
      const stderrLines = [];
      if (capture.output && capture.output.length > 0) {
        for (const entry of capture.output) {
          if (entry.data === undefined || entry.data === null) {
            continue;
          }
          if (entry.type === "stdout" || entry.type === "stderr") {
            if (typeof entry.data === "string") {
              // Strip trailing newlines for a clean log
              const cleanData = entry.data.replace(/\r?\n$/, "");
              (entry.type === "stderr" ? stderrLines : stdoutLines).push(cleanData);
            }
          } else {
            // "message"/"warning"/"error": an R condition, not
            // textual stdout/stderr — we still treat it as stderr
            // (that's where it would end up on a real R console
            // too), except "error" which in practice should never
            // arrive here: an unhandled R error fails the whole call
            // further below (catch), it doesn't produce an entry in
            // output.
            const msg = await extractConditionMessage(entry.data);
            if (typeof msg === "string") {
              stderrLines.push(msg.replace(/\r?\n$/, ""));
            }
          }
        }
      }
      // 6. Convert the result (an RObject proxy) to native JavaScript data
      const jsResult =
        capture.result ? await rObjectToNativeJs(capture.result) : null;

      return {
        result: jsResult,
        stdout: stdoutLines,
        stderr: stderrLines
      };

    } catch (err) {
      throw new Error(err.message || err);
    } finally {
      window.WebGeoDS.Runtime.removeEventListener("statuschange", onStatusChange);
      // 7. Purge the shelter to free WebAssembly memory.
      // If the worker was already closed by terminateR(), purge()
      // would fail too: it must not mask the original error nor
      // generate an unhandled rejection.
      try {
        await shelter.purge();
      } catch (purgeErr) {
        // ignored on purpose — see comment above
      }
    }
  }

  // ============================================================
  // writeFile
  // ============================================================
  /**
   * Writes bytes into webR's virtual filesystem, so a later run()
   * call can read them back with a normal path — e.g.
   * `sf::st_read(path)` on a user-uploaded GeoJSON. Unlike Python's
   * worker-message-based writeFile (python.js), webR's own public API
   * already proxies FS calls across its internal worker boundary, so
   * this is a direct call, no message protocol needed here.
   * @param {string} path Absolute path inside webR's filesystem (e.g.
   *   "/uploaded.geojson").
   * @param {Uint8Array} data
   * @returns {Promise<void>}
   */
  async function writeFile(path, data) {
    const webr = await window.WebGeoDS.Runtime.r();
    await webr.FS.writeFile(path, data);
  }

  // ============================================================
  // deleteFile
  // ============================================================
  /**
   * Best-effort delete of a path in webR's virtual filesystem — same
   * purpose as python.js's deleteFile: clean up a stale upload before
   * writing a new one at a different path, so it can't shadow the new
   * upload in a "try this path, then that one" read loop. A missing
   * file is not an error.
   * @param {string} path
   * @returns {Promise<void>}
   */
  async function deleteFile(path) {
    const webr = await window.WebGeoDS.Runtime.r();
    try {
      await webr.FS.unlink(path);
    } catch (err) {
      // Ignored: the file may simply not exist.
    }
  }

  // ============================================================
  // Public WebGeoDS API
  // ============================================================
  window.WebGeoDS.R = { run, writeFile, deleteFile };
})();
/**
 * WebGeoDS.Upload
 *
 * Shared "upload a vector or raster file into both runtimes' virtual
 * filesystems" helper, plus createControl() (the upload button
 * itself — a native <input type="file"> wrapped in a <label>, see
 * below) and loadObservableInputs() (see further below — lives here
 * because this file needed it first for the OLD Inputs.file()-based
 * control, but it's shared more broadly: topology-checker.qmd's
 * threshold sliders still use window.Inputs.range()). What's shared
 * and non-trivial is load()/baseName(): they accept a shapefile
 * (several sidecar files, or a single .zip bundling them) or a single
 * raster file, in addition to a single GeoJSON.
 *
 * A shapefile isn't one file: .shp (geometry) + .dbf (attributes) +
 * .shx (index), often .prj (CRS) — GDAL/OGR (used by both
 * geopandas.read_file() and sf::st_read(), already vendored, no new
 * package needed for either language — Shapefile is a base OGR
 * driver) needs them co-located in the same virtual directory.
 *
 * .tif/.tiff (added 2026-09-06 for the Raster Inspector) is the one
 * genuinely single-file kind — no sidecars, straight to
 * "uploaded.tif". Reading it back needs `rasterio` in Python, not
 * `xarray` alone (verified empirically: `xarray` has no built-in
 * GDAL-backed reader, and `rioxarray` — the package that would give
 * it one — fails to install in Pyodide); `stars` reads it natively in
 * R, no extra package.
 *
 * No ES module syntax so this can be included directly by Quarto.
 */

(() => {

  "use strict";


  window.WebGeoDS =
    window.WebGeoDS || {};


  const ACCEPT =
    ".geojson,.json,.shp,.shx,.dbf,.prj,.cpg,.zip,.tif,.tiff";

  // Same `window.WEBGEODS_ASSET_BASE` convention as map.js's
  // MAPLIBRE_JS_URL/table.js's GRIDJS_JS_URL — see the comment in
  // map.js for why a bare relative path breaks on a page that isn't
  // at the project root (verified the hard way once already, for
  // these exact two files, before this loader existed: a page under
  // /tools/ resolved a relative script src against that subfolder
  // instead of the site root).
  const ASSET_BASE = window.WEBGEODS_ASSET_BASE || "";
  const HTL_JS_URL = ASSET_BASE + "htl.min.js";
  const OBSERVABLE_INPUTS_JS_URL = ASSET_BASE + "observable-inputs.min.js";

  // Generic on purpose: this message is shared by both articles
  // (where the next step is pressing "Run" on a visible code cell)
  // and standalone tools (where it's clicking a Validate/Check
  // button, no visible cell at all) — each page's own surrounding
  // prose already says which, so this only needs to state the fact.
  const DEFAULT_STATUS =
    "No file uploaded yet — you can still try it with the built-in example data.";

  // Every path a page's Python/R "read the uploaded file" try-loop
  // might look for, across all upload kinds this helper supports —
  // used to clean up a stale upload from an EARLIER, different-kind
  // selection before writing the new one (see load() below).
  const ALL_CANDIDATE_NAMES = [
    "uploaded.geojson",
    "uploaded.shp",
    "uploaded.shx",
    "uploaded.dbf",
    "uploaded.prj",
    "uploaded.cpg",
    "uploaded.zip",
    "uploaded.tif"
  ];

  // Lazy-write queue — see load()/ensurePending() below. Keyed by
  // language ("python"/"r"), holding at most one not-yet-written
  // upload per language (a newer load() call simply replaces whatever
  // an older, never-flushed one left here — same "last upload wins"
  // outcome as writing immediately, just without the wasted work of
  // ever performing the superseded write).
  const pendingByLanguage = {
    python: null,
    r: null
  };


  // ============================================================
  // loadObservableInputs() — lazy-loads window.Inputs (Observable
  // Inputs, vendored: shared/observable-inputs.min.js) plus its own
  // runtime dependency window.htl (shared/htl.min.js — the UMD
  // build's global-script branch reads window.htl directly; Quarto's
  // own OJS runtime uses htl internally but never exposes it as a
  // window global, verified empirically). Same "check window first,
  // else create <script> tags, cache the in-flight promise" pattern
  // as map.js's loadMapLibreScript()/table.js's loadGridJs() — kept
  // here rather than folded into a bigger wrapper (unlike Map/Table,
  // there's no natural bigger WebGeoDS function for Inputs.file()/
  // Inputs.range() calls to hide inside; wrapping them just to hide
  // this load step would recreate the createInput() indirection
  // already removed once for being pointless). Callers `await` this
  // directly, then call window.Inputs.* themselves.
  // ============================================================

  // Same "onload fired but the global never actually appeared, retry
  // with a FRESH <script> element" workaround as map.js's own
  // loadMapLibreScript() — verified empirically (this exact bug,
  // this exact loader): the plain single-attempt version above
  // worked in isolation (a blank page, nothing else going on) but
  // reliably failed on the real pages, where several other things
  // (MapLibre, CodeMirror, the Python/R runtimes) are also competing
  // for the main thread right at load time — same root cause map.js
  // already documented for maplibre-gl.js, not specific to
  // display:none this time (these two scripts aren't hidden), just
  // "page busy enough right after load". See map.js's own comment
  // for the full reasoning (delay between retries, cache-busting
  // query string on retries only).
  const MAX_SCRIPT_ATTEMPTS = 8;

  function loadScriptUntil(url, isReady, attempt = 1) {

    if (isReady()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {

      const append =
        attempt === 1
          ? (fn) => fn()
          : (fn) => setTimeout(fn, 150 * (attempt - 1));

      const script =
        document.createElement("script");

      script.src =
        attempt === 1 ?
          url :
          `${url}?retry=${attempt}`;

      script.onload =
        () => {

          if (isReady()) {

            resolve();

          } else if (attempt < MAX_SCRIPT_ATTEMPTS) {

            resolve(loadScriptUntil(url, isReady, attempt + 1));

          } else {

            reject(
              new Error(`WebGeoDS.Upload: ${url} loaded ${attempt} time(s) but the expected global never appeared.`)
            );

          }

        };

      script.onerror =
        () => reject(
          new Error(`WebGeoDS.Upload: failed to load ${url}.`)
        );

      append(() => document.head.appendChild(script));

    });

  }

  let observableInputsPromise = null;

  function loadObservableInputs() {

    if (
      window.Inputs &&
      window.htl
    ) {

      return Promise.resolve();

    }

    if (!observableInputsPromise) {

      // htl before observable-inputs — the latter reads window.htl
      // at its own load time, not lazily on first use.
      observableInputsPromise =
        loadScriptUntil(HTL_JS_URL, () => !!window.htl).then(() =>
          loadScriptUntil(OBSERVABLE_INPUTS_JS_URL, () => !!window.Inputs)
        );

    }

    return observableInputsPromise;

  }


  // ============================================================
  // createControl({ label, variant, onChange }) — the upload button
  // itself: a native <input type="file"> wrapped in a <label>
  // styled as a .webgeods-panel-btn (shared/styles.css). A <label>
  // wrapping its own <input> associates with it natively (no
  // `for`/`id` needed) and opens the file picker on click with no
  // JS, so the <label> becomes the visible "button" and the actual
  // <input> is hidden by CSS. onChange(files) fires with the
  // input's FileList on every "change" (an empty FileList if the
  // picker is cancelled — load() above already treats that as "no
  // selection", unchanged).
  //
  // Previously each page built this itself as `viewof uploadedFiles
  // = { await WebGeoDS.loadObservableInputs(); return
  // window.Inputs.file(...); }` — Observable Inputs' widget, styled
  // to LOOK native via CSS overrides on its own build-hashed
  // markup. Switched away from that: a `viewof` cell turned out to
  // be unsafe to so much as move in Quarto's OJS runtime (see
  // geojson-shapefile-validator.qmd's long comment on this, from
  // when the widget still needed relocating into its panel) — a
  // plain `mutable` + native control, the same pattern already used
  // for every other page-level control here, doesn't have that
  // fragility to begin with, so callers now do
  // `mutable uploadedFiles = null` + `WebGeoDS.Upload.createControl({
  // onChange: (files) => { mutable uploadedFiles = files; } })`
  // instead.
  // ============================================================

  function createControl({ label = "Upload", variant = null, onChange } = {}) {

    const wrapper =
      document.createElement("label");

    wrapper.className = "webgeods-panel-btn";
    if (variant) wrapper.dataset.variant = variant;
    wrapper.textContent = label;

    const input =
      document.createElement("input");

    input.type = "file";
    input.multiple = true;
    input.accept = ACCEPT;

    input.addEventListener("change", () => onChange(input.files));

    wrapper.appendChild(input);

    return wrapper;

  }


  // ============================================================
  // Normalize whatever the upload control yields — a FileList, or
  // (kept for safety, e.g. a single File passed directly) a lone
  // File or null/undefined — into a plain array.
  // ============================================================

  function toFileArray(value) {

    if (!value) {

      return [];

    }

    if (
      typeof FileList !== "undefined" &&
      value instanceof FileList
    ) {

      return [...value];

    }

    return Array.isArray(value) ?
      value :
      [value];

  }


  // ============================================================
  // load(value, { languages }) — validates the selected file(s) and
  // QUEUES them to be written into the given runtimes' virtual
  // filesystems, returning { ok, kind, message } ready to assign
  // straight to a page's `mutable uploadStatus`.
  //
  // Lazy by design (added 2026-09-06): the actual write (reading the
  // File's bytes, deleting stale candidate paths, calling
  // Python/R.writeFile) happens later, in ensurePending(language),
  // called automatically by code-cell.js right before a cell of that
  // language runs — not here. A bilingual article calls load() with
  // no `languages` restriction (needs both eventually), which used to
  // mean EVERY upload was written into BOTH Pyodide's and webR's
  // filesystems immediately, even before the reader picked a language
  // to try. For a large file that's a real cost, not a theoretical
  // one: stress-testing the Raster Inspector article found R's own
  // FS.writeFile() failing outright on files well under Python's
  // ~2GB ceiling once `stars`/`sf` were also loaded — a big part of
  // that gap was this exact "write it to a runtime nobody asked for
  // yet" pattern doubling peak memory for no benefit. Deferring the
  // write to whichever language the reader actually runs doesn't
  // raise R's ceiling, but it removes the needless doubling for the
  // common case (someone tries one language, not both at once).
  //
  // `languages` defaults to ["python", "r"] (both, unchanged from
  // before — the bilingual articles still need both eventually, just
  // not both immediately). A Python-only tool should still pass
  // `{ languages: ["python"] }`: this is what stops such a tool's
  // upload from ever queueing (and therefore ever booting) webR at
  // all — verified empirically, before this change existed, that
  // without it a Python-only tool's upload was silently loading webR
  // in the background too (a Playwright test's console log showed
  // "WebR is using `PostMessage` communication channel" on a page
  // that never otherwise touches R).
  // ============================================================

  async function load(
    value,
    { languages = ["python", "r"] } = {}
  ) {

    const files =
      toFileArray(value);

    if (files.length === 0) {

      return {
        ok: false,
        message: DEFAULT_STATUS
      };

    }

    const byExt =
      (ext) =>
        files.filter((f) =>
          f.name.toLowerCase().endsWith(ext)
        );

    const geojsonFiles =
      files.filter((f) =>
        /\.(geojson|json)$/i.test(f.name)
      );

    const zipFiles =
      byExt(".zip");

    const shpFiles =
      byExt(".shp");

    // .tif/.tiff both write to the same "uploaded.tif" target name —
    // GDAL (rasterio/stars underneath) doesn't care about the actual
    // extension on disk, only the bytes, and every reader try-loop
    // only needs to look for one fixed path either way (same reason
    // geojson/json collapse to one target above).
    const tiffFiles =
      byExt(".tif").concat(byExt(".tiff"));


    let kind;
    let targets;

    if (
      geojsonFiles.length === 1 &&
      files.length === 1
    ) {

      kind = "geojson";
      targets = [[geojsonFiles[0], "uploaded.geojson"]];

    }

    else if (
      zipFiles.length === 1 &&
      files.length === 1
    ) {

      kind = "zip";
      targets = [[zipFiles[0], "uploaded.zip"]];

    }

    else if (
      tiffFiles.length === 1 &&
      files.length === 1
    ) {

      kind = "raster";
      targets = [[tiffFiles[0], "uploaded.tif"]];

    }

    else if (shpFiles.length === 1) {

      // Every selected file (.shp/.dbf/.shx/.prj/.cpg, ...) written
      // under its own extension, all as "uploaded.<ext>" — same base
      // name, so GDAL finds the sidecars next to the .shp.
      kind = "shapefile";
      targets = files.map((f) => [
        f,
        "uploaded" + f.name.slice(f.name.lastIndexOf("."))
      ]);

    }

    else {

      return {
        ok: false,
        message:
          "✗ Selection not recognized: upload a .geojson/.json, " +
          "a .zip containing a shapefile, the " +
          ".shp/.dbf/.shx (and optionally .prj) files of a shapefile " +
          "selected together, or a single .tif/.tiff raster."
      };

    }

    // Every OTHER candidate path needs deleting eventually — a page's
    // Python/R code tries a fixed list of paths in order (geojson,
    // then shapefile, then zip), so a stale file from an EARLIER,
    // different-kind upload (e.g. an old /uploaded.geojson still
    // sitting there after switching to a shapefile) would otherwise
    // silently shadow the new one. Computed now (cheap — just names,
    // no I/O) but only actually deleted inside ensurePending(), right
    // before that language's fresh targets are written — a language
    // that never runs again never needs this to have happened at all.
    const targetNames =
      new Set(targets.map(([, name]) => name));

    const staleNames =
      ALL_CANDIDATE_NAMES.filter((name) => !targetNames.has(name));

    for (const lang of languages) {

      pendingByLanguage[lang] =
        { targets, staleNames };

    }

    const names =
      targets.map(([, name]) => name).join(", ");

    window.WebGeoDS.track?.("file_uploaded", { kind });

    return {
      ok: true,
      kind,
      message: `✓ ${names} uploaded — ready for all the cells below.`
    };

  }


  // ============================================================
  // ensurePending(language) — performs whatever load() queued for
  // this language (stale-path cleanup, then writing this upload's own
  // targets), if anything is still queued. A no-op if nothing's
  // pending — the overwhelmingly common call, since a cell can only
  // run after its own language's queued upload (if any) has already
  // been flushed by an earlier run.
  //
  // Called by code-cell.js right before a cell of this language
  // executes, so page authors never call this directly — a page's own
  // `.qmd` code just calls WebGeoDS.Upload.load(...) and later
  // CodeCell.find(id).run() exactly as before; the deferred write is
  // invisible from that side.
  //
  // Reads each target File's bytes here, not in load() — a language
  // whose cell never runs (a reader who only tries Python on a
  // bilingual page, say) never pays for a second in-memory copy of a
  // large upload it will never use, and each language gets its own
  // fresh Uint8Array from a fresh File.arrayBuffer() call (a File can
  // be read more than once) instead of needing bytes.slice() to avoid
  // two languages fighting over one shared buffer.
  // ============================================================

  async function ensurePending(language) {

    const pending =
      pendingByLanguage[language];

    if (!pending) {

      return;

    }

    // Cleared before awaiting anything below: a second run of the
    // same language's cell that starts before this one finishes must
    // see nothing pending (its file is already being written by this
    // very call), not re-queue the same work.
    pendingByLanguage[language] =
      null;

    const runtime =
      language === "r" ? window.WebGeoDS.R : window.WebGeoDS.Python;

    await Promise.all(
      pending.staleNames.map((name) => runtime.deleteFile("/" + name))
    );

    for (const [file, targetName] of pending.targets) {

      const bytes =
        new Uint8Array(await file.arrayBuffer());

      await runtime.writeFile("/" + targetName, bytes);

    }

  }


  // ============================================================
  // baseName(value) — the original uploaded filename, extension
  // stripped, for naming a downloaded result after it (e.g.
  // "parcels.geojson" -> "parcels"). Used by every standalone tool's
  // download button, not just one, so it lives here rather than
  // being copy-pasted per tool (same threshold already applied to
  // downloadGeoJSON itself, still tool-local since only one uses it
  // so far).
  //
  // Prefers the "main" file (.geojson/.json/.zip/.shp) over a
  // shapefile's sidecars (.dbf/.shx/.prj) when several were selected
  // together — a rough heuristic, not the full kind-classification
  // load() does, good enough for a filename. Returns null for no
  // selection, letting the caller fall back to its own generic name.
  // ============================================================

  function baseName(value) {

    const files =
      toFileArray(value);

    if (files.length === 0) {

      return null;

    }

    const main =
      files.find((f) =>
        /\.(geojson|json|zip|shp)$/i.test(f.name)
      ) ?? files[0];

    return main.name.replace(/\.[^.]+$/, "");

  }


  // ============================================================
  // Public WebGeoDS API
  // ============================================================

  window.WebGeoDS.Upload = {
    load,
    ensurePending,
    baseName,
    createControl,
    accept: ACCEPT,
    defaultStatus: DEFAULT_STATUS
  };

  // Top-level, not namespaced under .Upload: shared by the upload
  // widget AND topology-checker.qmd's threshold sliders, not an
  // upload-specific concern — just implemented here since this file
  // already needed it first.
  window.WebGeoDS.loadObservableInputs =
    loadObservableInputs;


})();

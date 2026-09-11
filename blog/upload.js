/**
 * WebGeoDS.Upload
 *
 * Shared "upload a vector or raster file into both runtimes' virtual
 * filesystems" helper, plus createControl() (the upload button
 * itself — a native <input type="file"> wrapped in a <label>, see
 * below) and createSlider() (see further below — lives here for the
 * same reason createControl() does: a small shared UI primitive with
 * no bigger natural home, used by topology-checker.qmd's threshold
 * sliders and, from here on, any tool needing a distance/threshold
 * slider). What's shared and non-trivial is load()/baseName(): they
 * accept a shapefile (several sidecar files, or a single .zip
 * bundling them) or a single raster file, in addition to a single
 * GeoJSON.
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
 * it one — fails to install in Pyodide); on the R side, `terra` reads
 * it natively — chosen over `stars` (2026-09-07) after `stars` was
 * found to auto-switch to a lazy "proxy" mode above a few hundred MB
 * that breaks a normal per-band read (`terra` doesn't have that
 * failure mode, verified up to the largest size where the shared
 * write step itself still succeeds).
 *
 * No ES module syntax so this can be included directly by Quarto.
 */

(() => {

  "use strict";


  window.WebGeoDS =
    window.WebGeoDS || {};


  // Split by kind, not one list for every tool: .tif/.tiff is
  // registered at the OS level as an image type (image/tiff — the
  // same family as a phone photo, not just GeoTIFF), and on mobile
  // that makes the native file picker offer Photo Library/Camera
  // alongside Files. Every tool used to share ONE combined list, so
  // even a purely vector tool (which never reads a raster) still
  // triggered that photo-picker behavior — narrowing vector tools'
  // accept to drop .tif/.tiff entirely removes the trigger for them.
  // Raster tools still need it (can't drop what they actually read);
  // image/tiff is added explicitly alongside the extensions there —
  // standard practice (MDN), giving the browser an unambiguous MIME
  // type instead of making it infer one from the extension — but this
  // doesn't remove the browser's own tendency to also offer Photos
  // for a genuinely image-typed accept list, which is OS/browser
  // behavior outside this page's control, not something markup alone
  // guarantees away.
  const VECTOR_ACCEPT =
    ".geojson,.json,.shp,.shx,.dbf,.prj,.cpg,.zip";

  const RASTER_ACCEPT =
    ".tif,.tiff,image/tiff";

  // navigator.deviceMemory (Chromium only — undefined in Firefox/
  // Safari, never treated as "low" when absent) reports a coarse,
  // ROUNDED device-capability tier (0.25/0.5/1/2/4/8 GB), not live
  // available RAM — it can't detect transient pressure from other
  // open tabs/apps (that's what actually caused the fatal Pyodide
  // crash investigated 2026-09-10, see roadmap-acquisizione.md), only
  // flag a genuinely low-spec device up front. Complementary to, not
  // a fix for, that crash — real recovery from it is
  // runtime.js's post-init worker error listener. <= 2 catches the
  // three lowest reported tiers (0.25/0.5/1/2).
  const LOW_DEVICE_MEMORY_GB = 2;
  const lowMemoryWarning =
    typeof navigator !== "undefined" &&
    typeof navigator.deviceMemory === "number" &&
    navigator.deviceMemory <= LOW_DEVICE_MEMORY_GB
      ? ` ⚠️ This browser reports limited memory (~${navigator.deviceMemory}GB) — Python/R may run slowly or fail to start, especially with larger files. Closing other tabs first can help.`
      : "";

  // Generic on purpose: this message is shared by both articles
  // (where the next step is pressing "Run" on a visible code cell)
  // and standalone tools (where it's clicking a Validate/Check
  // button, no visible cell at all) — each page's own surrounding
  // prose already says which, so this only needs to state the fact.
  const DEFAULT_STATUS =
    "No file uploaded yet — you can still try it with the built-in example data." +
    lowMemoryWarning;

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
  // createSlider([min, max], { value, step, label, id }) — a plain
  // native <input type="range"> with a label and a live value
  // display, in one wrapper element (shared/styles.css:
  // .webgeods-slider). Replaces Observable Inputs' Inputs.range()
  // (removed 2026-09-11, along with its vendored runtime dependency
  // htl.min.js — both existed in this project only to support this
  // one widget, unused anywhere else by the time this was written):
  // no async load step before the control can be created, no extra
  // library, same "vanilla DOM, no library" choice table.js already
  // made for its own table renderer.
  //
  // The wrapper's inner <input> carries `id` directly (not set by
  // the caller afterward) — read its live value exactly like any
  // other input, e.g. `document.getElementById(id).value`, same
  // read-by-id pattern every caller already used with Inputs.range().
  // ============================================================

  function createSlider([min, max], { value, step = 1, label, id } = {}) {

    const wrapper =
      document.createElement("span");

    wrapper.className =
      "webgeods-slider";

    const labelEl =
      document.createElement("span");

    labelEl.className =
      "webgeods-slider-label";

    labelEl.textContent =
      `${label}:`;

    const input =
      document.createElement("input");

    input.type = "range";
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);

    const valueEl =
      document.createElement("span");

    valueEl.className =
      "webgeods-slider-value";

    valueEl.textContent =
      String(value);

    input.addEventListener("input", () => {
      valueEl.textContent = input.value;
    });

    wrapper.append(labelEl, input, valueEl);

    return wrapper;

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

  function createControl({ label = "Upload", variant = null, onChange, kind = "vector" } = {}) {

    const wrapper =
      document.createElement("label");

    wrapper.className = "webgeods-panel-btn";
    if (variant) wrapper.dataset.variant = variant;
    wrapper.textContent = label;

    const input =
      document.createElement("input");

    input.type = "file";
    input.multiple = true;
    input.accept = kind === "raster" ? RASTER_ACCEPT : VECTOR_ACCEPT;

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
    // GDAL (rasterio/terra underneath) doesn't care about the actual
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
    accept: VECTOR_ACCEPT,
    rasterAccept: RASTER_ACCEPT,
    defaultStatus: DEFAULT_STATUS
  };

  // Top-level, not namespaced under .Upload: createSlider() is a
  // generic UI primitive, not an upload-specific concern — just
  // implemented here since this file already needed one first (see
  // its own doc comment above).
  window.WebGeoDS.createSlider =
    createSlider;


})();

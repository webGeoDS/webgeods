/**
 * WebGeoDS.Upload
 *
 * Shared "upload a vector file into both runtimes' virtual
 * filesystems" helper — factors out the upload widget that was
 * duplicated identically in topology-fix.qmd and topology-errors.qmd,
 * and extends it to accept a shapefile (several sidecar files, or a
 * single .zip bundling them) in addition to a single GeoJSON.
 *
 * A shapefile isn't one file: .shp (geometry) + .dbf (attributes) +
 * .shx (index), often .prj (CRS) — GDAL/OGR (used by both
 * geopandas.read_file() and sf::st_read(), already vendored, no new
 * package needed for either language — Shapefile is a base OGR
 * driver) needs them co-located in the same virtual directory.
 *
 * No ES module syntax so this can be included directly by Quarto.
 */

(() => {

  "use strict";


  window.WebGeoDS =
    window.WebGeoDS || {};


  const ACCEPT =
    ".geojson,.json,.shp,.shx,.dbf,.prj,.cpg,.zip";

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
    "uploaded.zip"
  ];


  // ============================================================
  // createInput() — the <input> element for a `viewof` cell
  // ============================================================

  function createInput() {

    const input =
      document.createElement("input");

    input.type =
      "file";

    input.multiple =
      true;

    input.accept =
      ACCEPT;

    return input;

  }


  // ============================================================
  // Normalize whatever a `viewof` file input yields — a single
  // File (non-multiple inputs, or some Observable runtimes even
  // with `multiple` set), a FileList, or null/undefined — into a
  // plain array.
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
  // load(value, { languages }) — writes the selected file(s) into
  // the given runtimes' virtual filesystems (window.WebGeoDS.Python/
  // R.writeFile, already existing) and returns { ok, kind, message },
  // ready to assign straight to a page's `mutable uploadStatus`.
  //
  // `languages` defaults to ["python", "r"] (both, unchanged behavior
  // for every existing caller — the bilingual articles need both).
  // A Python-only tool should pass `{ languages: ["python"] }`:
  // Python/R.writeFile() each lazily load their WHOLE runtime first
  // (WebGeoDS.Runtime.python()/.r()) if not already running — verified
  // empirically that without this, uploading a file on a Python-only
  // tool page was silently loading webR in the background too (a
  // Playwright test's console log showed "WebR is using `PostMessage`
  // communication channel" on a page that never otherwise touches R),
  // undermining the whole point of choosing Python-only for speed.
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
          "a .zip containing a shapefile, or the " +
          ".shp/.dbf/.shx (and optionally .prj) files of a shapefile, " +
          "selected together."
      };

    }

    try {

      // Clean up every OTHER candidate path first: a page's Python/R
      // code tries a fixed list of paths in order (geojson, then
      // shapefile, then zip) — without this, a stale file from an
      // EARLIER, different-kind upload (e.g. an old /uploaded.geojson
      // still sitting there after the user switches to uploading a
      // shapefile instead) would silently shadow the new one, since
      // it's still the first path found to exist. Verified empirically
      // this actually happens without the cleanup.
      const targetNames =
        new Set(targets.map(([, name]) => name));

      const staleNames =
        ALL_CANDIDATE_NAMES.filter((name) => !targetNames.has(name));

      const runtimesFor =
        (fn) =>
          languages
            .map((lang) => lang === "r" ? window.WebGeoDS.R : window.WebGeoDS.Python)
            .map(fn);

      await Promise.all(
        staleNames.flatMap((name) =>
          runtimesFor((runtime) => runtime.deleteFile("/" + name))
        )
      );

      for (const [file, targetName] of targets) {

        const bytes =
          new Uint8Array(await file.arrayBuffer());

        await Promise.all(
          runtimesFor((runtime) => runtime.writeFile("/" + targetName, bytes.slice()))
        );

      }

    } catch (err) {

      return {
        ok: false,
        message: `✗ Error during upload: ${err.message || err}`
      };

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
    createInput,
    load,
    baseName,
    defaultStatus: DEFAULT_STATUS
  };


})();

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

  const DEFAULT_STATUS =
    "No file uploaded yet — you can still press \"Run\" on the cells below to try it with example data.";

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
  // load(value) — writes the selected file(s) into BOTH runtimes'
  // virtual filesystems (window.WebGeoDS.Python/R.writeFile,
  // already existing) and returns { ok, kind, message }, ready to
  // assign straight to a page's `mutable uploadStatus`.
  // ============================================================

  async function load(
    value
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

      await Promise.all(
        staleNames.flatMap((name) => [
          window.WebGeoDS.Python.deleteFile("/" + name),
          window.WebGeoDS.R.deleteFile("/" + name)
        ])
      );

      for (const [file, targetName] of targets) {

        const bytes =
          new Uint8Array(await file.arrayBuffer());

        await Promise.all([
          window.WebGeoDS.Python.writeFile("/" + targetName, bytes.slice()),
          window.WebGeoDS.R.writeFile("/" + targetName, bytes.slice())
        ]);

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
  // Public WebGeoDS API
  // ============================================================

  window.WebGeoDS.Upload = {
    createInput,
    load,
    defaultStatus: DEFAULT_STATUS
  };


})();

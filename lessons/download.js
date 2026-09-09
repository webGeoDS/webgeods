/**
 * WebGeoDS.downloadBlob(bytesOrString, filename, mimeType, options)
 *
 * Trigger a browser download for in-memory content — a Blob + a
 * temporary <a download> is enough, no library needed. Promoted here
 * once a second tool (topology-checker.qmd) ended up with its own
 * near-duplicate of the exact function geojson-shapefile-validator.qmd
 * already had — that page's own comment said as much: "if a second
 * tool ends up duplicating this same function, that's the point to
 * move it into a shared file, not before."
 *
 * `bytesOrString` — a string (e.g. `JSON.stringify(geojson)`) or
 * binary content (a Uint8Array — e.g. a zipped shapefile decoded from
 * base64, see geojson-shapefile-validator.qmd's downloadButton).
 * Passed straight to `new Blob([bytesOrString], { type: mimeType })`.
 *
 * `options.tool` — included in the "download_clicked" tracking event
 * (WebGeoDS.track(), shared/runtime.js) so GoatCounter can tell which
 * tool a download came from; omit it and the event still fires, just
 * without that field.
 *
 * No ES module syntax so this can be included directly by Quarto.
 */

(() => {

  "use strict";


  window.WebGeoDS =
    window.WebGeoDS || {};


  function downloadBlob(
    bytesOrString,
    filename,
    mimeType,
    { tool } = {}
  ) {

    window.WebGeoDS.track?.(
      "download_clicked",
      { tool, filename }
    );

    const blob =
      new Blob(
        [bytesOrString],
        { type: mimeType }
      );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href =
      url;

    a.download =
      filename;

    a.click();

    URL.revokeObjectURL(
      url
    );

  }


  window.WebGeoDS.downloadBlob =
    downloadBlob;


})();

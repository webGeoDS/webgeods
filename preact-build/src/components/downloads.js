// What the "⬇ Download" button does: the features as GeoJSON, or, when
// the upload was a shapefile and the page has an export cell for it, a
// zipped shapefile from that cell (it runs on demand and returns the zip
// base64-encoded), so the download matches the format that came in.
//
// options: { getFeatures, getBaseName, filenameSuffix, defaultFilename,
//   mimeType, tool, uploadKind,
//   shapefile: { cellId, filenameSuffix, defaultFilename } }
// Nothing to download (getFeatures() returns nothing): no-op.
export async function downloadFeatures({
  getFeatures, getBaseName, filenameSuffix, defaultFilename,
  mimeType = "application/geo+json", tool, uploadKind, shapefile
}) {

  const W = window.WebGeoDS;
  const asShapefile = !!shapefile && (uploadKind === "zip" || uploadKind === "shapefile");
  const features = asShapefile ? null : getFeatures();
  if (!asShapefile && !features) return;
  const base = getBaseName?.() ?? null;

  if (asShapefile) {
    await W.CodeCell.find(shapefile.cellId).run();
    const base64 = document.getElementById(shapefile.cellId).value;
    W.downloadBlob(W.base64ToBytes(base64),
      base ? `${base}${shapefile.filenameSuffix}` : shapefile.defaultFilename, "application/zip", { tool });
  } else {
    W.downloadBlob(JSON.stringify(features, null, 2),
      base ? `${base}${filenameSuffix}` : defaultFilename, mimeType, { tool });
  }

}

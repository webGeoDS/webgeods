#!/usr/bin/env bash
# Downloads the MapLibre GL JS UMD bundle (the official build, sets
# `window.maplibregl` — not the ESM build) + its CSS, verifies basic
# integrity, and stages both in TARGET_DIR.
#
# Usage:
#   ./vendor-maplibre.sh <target-dir> [version]
#
# Example (reproduces the current vendored files):
#   ./vendor-maplibre.sh shared 4.7.1
#
# After running: verify with run-smoke-test.sh, then sync/commit as
# usual — this script never touches git or any remote.
set -euo pipefail

TARGET_DIR="${1:?Usage: ./vendor-maplibre.sh <target-dir> [version]}"
VERSION="${2:-4.7.1}"

SOURCE="https://unpkg.com/maplibre-gl@${VERSION}/dist"

mkdir -p "$TARGET_DIR"

echo "==> Downloading MapLibre GL JS ${VERSION} (UMD build)"
curl -s --compressed -o "$TARGET_DIR/maplibre-gl.js" "$SOURCE/maplibre-gl.js"
curl -s --compressed -o "$TARGET_DIR/maplibre-gl.css" "$SOURCE/maplibre-gl.css"

echo "==> Verifying file integrity"
fail=0

# Plain text UMD JS, not a fixed binary magic — check it looks like the
# real thing (a size sanity floor + the expected header comment) rather
# than an error page or an empty/truncated download.
js_size="$(wc -c < "$TARGET_DIR/maplibre-gl.js")"
if [ "$js_size" -lt 400000 ]; then
  echo "  ✗ maplibre-gl.js: suspiciously small ($js_size bytes, expected ~800KB)"
  fail=1
elif ! head -c 200 "$TARGET_DIR/maplibre-gl.js" | grep -q "MapLibre GL JS"; then
  echo "  ✗ maplibre-gl.js: missing expected header comment — got something else"
  fail=1
else
  echo "  ✓ maplibre-gl.js ($js_size bytes)"
fi

css_size="$(wc -c < "$TARGET_DIR/maplibre-gl.css")"
if [ "$css_size" -lt 30000 ]; then
  echo "  ✗ maplibre-gl.css: suspiciously small ($css_size bytes, expected ~65KB)"
  fail=1
elif ! grep -q "maplibregl" "$TARGET_DIR/maplibre-gl.css"; then
  echo "  ✗ maplibre-gl.css: missing expected 'maplibregl' class prefix"
  fail=1
else
  echo "  ✓ maplibre-gl.css ($css_size bytes)"
fi

echo ""
if [ "$fail" -ne 0 ]; then
  echo "FAILED: one or more files did not pass integrity checks — see above."
  exit 1
fi

echo "==> Done. Staged in $TARGET_DIR."

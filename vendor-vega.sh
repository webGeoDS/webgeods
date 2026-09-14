#!/usr/bin/env bash
# Downloads the three UMD bundles the Vega-Lite stack needs (vega,
# vega-lite, vega-embed -- vega-embed's own build expects window.vega/
# window.vegaLite as globals, not bundled in, confirmed by reading its
# own UMD wrapper before writing this script), verifies basic
# integrity, and stages all three in TARGET_DIR.
#
# Usage:
#   ./vendor-vega.sh <target-dir> [vega-version] [vega-lite-version] [vega-embed-version]
#
# Example (reproduces the current vendored files):
#   ./vendor-vega.sh shared 5.33.1 5.23.0 6.29.0
#
# Load order matters at include time: vega.js, then vega-lite.js, then
# vega-embed.js (each later file's UMD wrapper reads the previous one's
# global) -- same page-inclusion order this script's own file order
# implies.
#
# After running: verify with a real browser (not just this script),
# then sync/commit as usual -- this script never touches git or any
# remote.
set -euo pipefail

TARGET_DIR="${1:?Usage: ./vendor-vega.sh <target-dir> [vega-version] [vega-lite-version] [vega-embed-version]}"
VEGA_VERSION="${2:-5.33.1}"
VEGA_LITE_VERSION="${3:-5.23.0}"
VEGA_EMBED_VERSION="${4:-6.29.0}"

mkdir -p "$TARGET_DIR"

echo "==> Downloading vega ${VEGA_VERSION}"
curl -sL --compressed -o "$TARGET_DIR/vega.min.js" \
  "https://unpkg.com/vega@${VEGA_VERSION}/build/vega.min.js"

echo "==> Downloading vega-lite ${VEGA_LITE_VERSION}"
curl -sL --compressed -o "$TARGET_DIR/vega-lite.min.js" \
  "https://unpkg.com/vega-lite@${VEGA_LITE_VERSION}/build/vega-lite.min.js"

echo "==> Downloading vega-embed ${VEGA_EMBED_VERSION}"
curl -sL --compressed -o "$TARGET_DIR/vega-embed.min.js" \
  "https://unpkg.com/vega-embed@${VEGA_EMBED_VERSION}/build/vega-embed.min.js"

echo "==> Verifying file integrity"
fail=0

check() {
  local file="$1" min_size="$2" expected_grep="$3" label="$4"
  local size
  size="$(wc -c < "$file")"
  if [ "$size" -lt "$min_size" ]; then
    echo "  ✗ $label: suspiciously small ($size bytes, expected >$min_size)"
    fail=1
  elif ! head -c 400 "$file" | grep -q "$expected_grep"; then
    echo "  ✗ $label: missing expected marker '$expected_grep' -- got something else (an error page?)"
    fail=1
  else
    echo "  ✓ $label ($size bytes)"
  fi
}

check "$TARGET_DIR/vega.min.js" 400000 "vega" "vega.min.js"
check "$TARGET_DIR/vega-lite.min.js" 150000 "vegaLite" "vega-lite.min.js"
check "$TARGET_DIR/vega-embed.min.js" 30000 "vegaEmbed" "vega-embed.min.js"

echo ""
if [ "$fail" -ne 0 ]; then
  echo "FAILED: one or more files did not pass integrity checks -- see above."
  exit 1
fi

echo "==> Done. Staged in $TARGET_DIR."

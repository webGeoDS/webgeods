#!/usr/bin/env bash
# Rebuilds ../shared/webgeods-preact.js from scratch: npm install at the
# exact pinned versions in package.json/package-lock.json, bundle with
# esbuild, verify the result actually mounts and updates components in a
# real browser. Same shape as ../codemirror-build/build.sh.
#
# Usage: ./build.sh
#
# After building: run ../sync-shared-assets.sh (copies the bundle into
# blog/ and lessons/) before rendering, like any other shared/ file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> npm install"
npm install --no-audit --no-fund

echo "==> Building bundle"
npm run build

BUNDLE="$SCRIPT_DIR/../shared/webgeods-preact.js"

echo "==> Verifying bundle in a real browser (not just checking it exists)"
node "$SCRIPT_DIR/verify-bundle.mjs" "$BUNDLE"

echo ""
echo "==> Done. $(wc -c < "$BUNDLE") bytes -> $BUNDLE"

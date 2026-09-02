#!/usr/bin/env bash
# Rebuilds ../shared/codemirror-bundle.js from scratch: npm install at
# the exact pinned versions in package.json/package-lock.json, bundle
# with esbuild, verify the result actually works in a real browser.
#
# Usage: ./build.sh
#
# To bump a CodeMirror package version: edit package.json here AND the
# matching comment in shared/code-cell.js (the two must stay in sync —
# nothing enforces that automatically), delete package-lock.json if you
# want fresh transitive resolution, then run this script.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> npm install"
npm install --no-audit --no-fund

echo "==> Building bundle"
npm run build

BUNDLE="$SCRIPT_DIR/../shared/codemirror-bundle.js"

echo "==> Verifying bundle in a real browser (not just checking it exists)"
node "$SCRIPT_DIR/verify-bundle.mjs" "$BUNDLE"

echo ""
echo "==> Done. $(wc -c < "$BUNDLE") bytes -> $BUNDLE"

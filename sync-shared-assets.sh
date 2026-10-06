#!/usr/bin/env bash
# Copies the files from shared/ into blog/ (and lessons/, once it has
# lessons) before rendering.
# shared/ is not a Quarto project: it's just the single source of truth.
# Run this every time a file in shared/ is modified, before
# `quarto render`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$SCRIPT_DIR/shared"
# lessons/ has no lessons yet: add "$SCRIPT_DIR/lessons" back here with
# the first one (lessons/_quarto.yml already lists what it loads).
TARGET_DIRS=("$SCRIPT_DIR/blog")

FILES=(
  runtime.js
  python.js
  r.js
  code-cell.js
  map.js
  map-raster.js
  upload.js
  download.js
  ui.js
  d3.min.js
  graph-diagram.js
  vega.min.js
  vega-lite.min.js
  vega-embed.min.js
  vega-chart.js
  styles.css
  _brand.yml
  webgeods-cells.lua
  alidade_smooth.json
  webgeods-logo.svg
  maplibre-gl.js
  maplibre-gl.css
  fonts.css
  codemirror-bundle.js
  webgeods-preact.js
)

for target in "${TARGET_DIRS[@]}"; do
  mkdir -p "$target" "$target/fonts"
  for f in "${FILES[@]}"; do
    cp "$SHARED_DIR/$f" "$target/$f"
  done
  cp "$SHARED_DIR"/fonts/*.woff2 "$target/fonts/"
  echo "Synced shared assets -> $target"
done

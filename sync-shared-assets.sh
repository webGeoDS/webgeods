#!/usr/bin/env bash
# Copies the files from shared/ into blog/ and lessons/ before rendering.
# shared/ is not a Quarto project: it's just the single source of truth.
# Run this every time a file in shared/ is modified, before
# `quarto render` (see piano-separazione-blog-lezioni.md §4).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$SCRIPT_DIR/shared"
TARGET_DIRS=("$SCRIPT_DIR/blog" "$SCRIPT_DIR/lessons")

FILES=(
  runtime.js
  python.js
  r.js
  code-cell.js
  map.js
  table.js
  upload.js
  styles.css
  _brand.yml
  webgeods-cells.lua
  alidade_smooth.json
  webgeods-logo.svg
  maplibre-gl.js
  maplibre-gl.css
  fonts.css
  codemirror-bundle.js
  htl.min.js
  observable-inputs.min.js
)

for target in "${TARGET_DIRS[@]}"; do
  mkdir -p "$target" "$target/fonts"
  for f in "${FILES[@]}"; do
    cp "$SHARED_DIR/$f" "$target/$f"
  done
  cp "$SHARED_DIR"/fonts/*.woff2 "$target/fonts/"
  echo "Synced shared assets -> $target"
done

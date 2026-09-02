#!/usr/bin/env bash
# Downloads webR core + the runtime dependency closure of the given R
# packages, verifies each file's integrity, and stages everything in
# TARGET_DIR (creating v<version>/ and repo/ inside it) — ready to be
# committed/pushed to the webgeods-assets repo.
#
# Usage:
#   ./vendor-webr.sh <target-dir> [webr-version] [abi-path] [pkg1,pkg2,...]
#
# Example (reproduces the current vendored set):
#   ./vendor-webr.sh ../webgeods-assets/webr v0.6.0 4.6 sf,geojsonsf
#
# `abi-path` is the R/emscripten ABI directory webR's package repo uses
# (e.g. "4.6") — it's tied to the webR version, not guessable from it;
# check https://repo.r-wasm.org/bin/emscripten/contrib/ or a real
# `webr.installPackages()` network capture if unsure.
#
# The vfs/ file list below is NOT derived automatically (unlike the R
# package closure): it was captured by observing real network requests
# in a browser while exercising every R cell in test-architettura.qmd
# (base R, sf, geojsonsf). If a future package needs a webR subsystem
# not already covered (a different locale, a different native library),
# re-run that capture — see the isolation-test methodology used
# throughout the vendoring work — and add the missing vfs/ path here.
#
# After running: `git add`, verify with run-smoke-test.sh against a
# preview pointed at the new baseUrl/repoUrl, then commit/push the
# target repo yourself — this script never touches git or any remote.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:?Usage: ./vendor-webr.sh <target-dir> [version] [abi-path] [packages]}"
VERSION="${2:-v0.6.0}"
ABI="${3:-4.6}"
PACKAGES="${4:-sf,geojsonsf}"

CORE_SOURCE="https://webr.r-wasm.org/${VERSION}"
REPO_SOURCE="https://repo.r-wasm.org/bin/emscripten/contrib/${ABI}"

CORE_DIR="$TARGET_DIR/${VERSION}"
REPO_DIR="$TARGET_DIR/repo/bin/emscripten/contrib/${ABI}"

VFS_FILES=(
  "vfs/usr/lib/R/library/translations/DESCRIPTION"
  "vfs/usr/share/udunits.js.metadata"
  "vfs/usr/share/udunits.data.gz"
  "vfs/usr/share/proj.js.metadata"
  "vfs/usr/share/proj.data.gz"
  "vfs/usr/lib/R/library/grDevices/enc.js.metadata"
  "vfs/usr/lib/R/library/grDevices/enc.data.gz"
  "vfs/usr/lib/R/library/grDevices/afm.js.metadata"
  "vfs/usr/lib/R/library/grDevices/afm.data.gz"
  "vfs/usr/lib/R/library/parallel.js.metadata"
  "vfs/usr/lib/R/library/parallel.data.gz"
)

mkdir -p "$CORE_DIR" "$REPO_DIR"
for f in "${VFS_FILES[@]}"; do
  mkdir -p "$CORE_DIR/$(dirname "$f")"
done

echo "==> Downloading webR ${VERSION} core"
# --compressed is NOT optional here: webr.r-wasm.org serves R.wasm with
# Content-Encoding: gzip. Without --compressed, curl saves the raw
# compressed bytes under a .wasm name — WebAssembly.instantiate() then
# fails with a "wrong magic word" error (found gzip's 1f 8b instead of
# WASM's 00 61 73 6d). This is exactly the bug that broke the first
# real vendoring attempt; --compressed is the fix, applied to every
# download in this script as a precaution, not just R.wasm.
for f in webr.mjs webr-worker.js R.js R.wasm libRblas.so libRlapack.so; do
  curl -s --compressed -o "$CORE_DIR/$f" "$CORE_SOURCE/$f"
done

echo "==> Downloading webR vfs/ data files"
for f in "${VFS_FILES[@]}"; do
  curl -s --compressed -o "$CORE_DIR/$f" "$CORE_SOURCE/$f"
done

echo "==> Downloading package index"
curl -s --compressed -o "$REPO_DIR/PACKAGES.rds" "$REPO_SOURCE/PACKAGES.rds"

echo "==> Resolving runtime dependency closure for: ${PACKAGES}"
# tr -d '\r': Rscript on Windows writes CRLF line endings, and a
# trailing \r left in `file_name` below would end up embedded in the
# download URL — curl then fails with exit 3 ("URL malformed").
Rscript "$SCRIPT_DIR/resolve-r-deps.R" "$REPO_DIR/PACKAGES.rds" "$PACKAGES" | tr -d '\r' > "$REPO_DIR/.closure.tmp"
cat "$REPO_DIR/.closure.tmp"

echo "==> Downloading R packages"
while read -r name file_name; do
  [ -z "$file_name" ] && continue
  curl -s --compressed -o "$REPO_DIR/$file_name" "$REPO_SOURCE/$file_name"
done < "$REPO_DIR/.closure.tmp"
rm -f "$REPO_DIR/.closure.tmp"

echo "==> Verifying file integrity (magic bytes)"
fail=0

check_magic() {
  local file="$1" expected="$2" label="$3"
  local actual
  actual="$(od -An -tx1 -N "$(( ${#expected} / 2 ))" "$file" | tr -d ' \n')"
  if [ "$actual" != "$expected" ]; then
    echo "  ✗ $label ($file): expected magic $expected, got $actual"
    fail=1
  else
    echo "  ✓ $label"
  fi
}

# R.js is plain JS (no fixed magic to check meaningfully); R.wasm and
# the two libR*.so files are WASM modules despite the .so extension
# (Emscripten side-modules), confirmed against this exact webR build.
check_magic "$CORE_DIR/R.wasm" "0061736d" "R.wasm (WASM)"
check_magic "$CORE_DIR/libRblas.so" "0061736d" "libRblas.so (WASM)"
check_magic "$CORE_DIR/libRlapack.so" "0061736d" "libRlapack.so (WASM)"
# PACKAGES.rds: not magic-checked — R's RDS format varies its own
# compression (gzip/xz/bzip2) depending on how it was saved, so no
# single expected magic applies.

for f in "$REPO_DIR"/*.tgz; do
  [ -e "$f" ] || continue
  magic="$(od -An -tx1 -N2 "$f" | tr -d ' \n')"
  if [ "$magic" != "1f8b" ]; then
    echo "  ✗ $(basename "$f"): expected gzip magic 1f8b, got $magic"
    fail=1
  fi
done
echo "  ✓ $(ls "$REPO_DIR"/*.tgz | wc -l) R packages have valid gzip magic"

echo ""
if [ "$fail" -ne 0 ]; then
  echo "FAILED: one or more files did not pass integrity checks — see above."
  exit 1
fi

echo "==> Done. Staged in $TARGET_DIR:"
du -sh "$TARGET_DIR"

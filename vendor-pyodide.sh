#!/usr/bin/env bash
# Downloads Pyodide core + the runtime dependency closure of the given
# packages, verifies each file's integrity, and stages everything in
# TARGET_DIR — ready to be committed/pushed to the webgeods-assets repo
# (or wherever WebGeoDS.Runtime's `indexURL` points).
#
# Usage:
#   ./vendor-pyodide.sh <target-dir> [pyodide-version] [pkg1,pkg2,...]
#
# Example (reproduces the current vendored set):
#   ./vendor-pyodide.sh ../webgeods-assets/pyodide/v0.29.4 v0.29.4 geopandas
#
# After running: `git add`, verify with run-smoke-test.sh against a
# preview pointed at the new indexURL, then commit/push the target repo
# yourself — this script never touches git or any remote.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:?Usage: ./vendor-pyodide.sh <target-dir> [version] [packages]}"
VERSION="${2:-v0.29.4}"
PACKAGES="${3:-geopandas}"

SOURCE="https://cdn.jsdelivr.net/pyodide/${VERSION}/full"

mkdir -p "$TARGET_DIR"

echo "==> Downloading Pyodide ${VERSION} core"
for f in pyodide-lock.json pyodide.mjs pyodide.asm.js pyodide.asm.wasm python_stdlib.zip; do
  curl -s --compressed -o "$TARGET_DIR/$f" "$SOURCE/$f"
done

echo "==> Resolving runtime dependency closure for: ${PACKAGES}"
node "$SCRIPT_DIR/resolve-py-deps.mjs" "$TARGET_DIR/pyodide-lock.json" "$PACKAGES" > "$TARGET_DIR/.closure.tmp"
cat "$TARGET_DIR/.closure.tmp"

echo "==> Downloading package wheels"
while read -r name file_name; do
  [ -z "$file_name" ] && continue
  curl -s --compressed -o "$TARGET_DIR/$file_name" "$SOURCE/$file_name"
done < "$TARGET_DIR/.closure.tmp"
rm -f "$TARGET_DIR/.closure.tmp"

echo "==> Verifying file integrity (magic bytes)"
fail=0

# $2 is the expected magic bytes as a hex string (e.g. "0061736d").
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

check_magic "$TARGET_DIR/pyodide.asm.wasm" "0061736d" "pyodide.asm.wasm (WASM)"
python_stdlib_magic="$(od -An -tx1 -N2 "$TARGET_DIR/python_stdlib.zip" | tr -d ' \n')"
if [ "$python_stdlib_magic" != "504b" ]; then
  echo "  ✗ python_stdlib.zip: expected ZIP magic 504b, got $python_stdlib_magic"
  fail=1
else
  echo "  ✓ python_stdlib.zip (ZIP)"
fi

for f in "$TARGET_DIR"/*.whl; do
  [ -e "$f" ] || continue
  magic="$(od -An -tx1 -N2 "$f" | tr -d ' \n')"
  if [ "$magic" != "504b" ]; then
    echo "  ✗ $(basename "$f"): expected ZIP magic 504b, got $magic"
    fail=1
  fi
done
echo "  ✓ $(ls "$TARGET_DIR"/*.whl | wc -l) wheels have valid ZIP magic"

# Piped via stdin (fd 0), not passed as a path string: avoids Git-Bash
# vs Node path-translation mismatches on Windows for this one check.
if node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" < "$TARGET_DIR/pyodide-lock.json" > /dev/null 2>&1; then
  echo "  ✓ pyodide-lock.json is valid JSON"
else
  echo "  ✗ pyodide-lock.json failed to parse"
  fail=1
fi

echo ""
if [ "$fail" -ne 0 ]; then
  echo "FAILED: one or more files did not pass integrity checks — see above."
  exit 1
fi

echo "==> Done. Staged in $TARGET_DIR:"
du -sh "$TARGET_DIR"
ls "$TARGET_DIR" | wc -l
echo "files."

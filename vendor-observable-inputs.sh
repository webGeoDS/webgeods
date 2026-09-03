#!/usr/bin/env bash
# Downloads the Observable Inputs UMD bundle + its htl (hypertext
# literal) dependency, verifies basic integrity, and stages both in
# TARGET_DIR. There is no separate CSS file — Inputs injects its own
# styles via JS on first use.
#
# htl is a SEPARATE package, not bundled into inputs.min.js: the UMD
# build's global-script branch reads `window.htl` itself (verified
# empirically — without it, `Inputs.range()` throws "Cannot read
# properties of undefined (reading 'html')"). Quarto's own OJS
# runtime uses htl internally too, but only as its own scoped import,
# not exposed as `window.htl` — also verified empirically, don't
# assume it's already there.
#
# Usage:
#   ./vendor-observable-inputs.sh <target-dir> [inputs-version] [htl-version]
#
# Example (reproduces the current vendored files):
#   ./vendor-observable-inputs.sh shared 0.12.0 0.3.1
#
# After running: verify with run-smoke-test.sh, then sync/commit as
# usual — this script never touches git or any remote.
set -euo pipefail

TARGET_DIR="${1:?Usage: ./vendor-observable-inputs.sh <target-dir> [inputs-version] [htl-version]}"
INPUTS_VERSION="${2:-0.12.0}"
HTL_VERSION="${3:-0.3.1}"

mkdir -p "$TARGET_DIR"

echo "==> Downloading htl ${HTL_VERSION} (Inputs' own runtime dependency)"
curl -s --compressed -o "$TARGET_DIR/htl.min.js" \
  "https://cdn.jsdelivr.net/npm/htl@${HTL_VERSION}/dist/htl.min.js"

echo "==> Downloading Observable Inputs ${INPUTS_VERSION} (UMD build)"
curl -s --compressed -o "$TARGET_DIR/observable-inputs.min.js" \
  "https://cdn.jsdelivr.net/npm/@observablehq/inputs@${INPUTS_VERSION}/dist/inputs.min.js"

echo "==> Verifying file integrity"
fail=0

htl_size="$(wc -c < "$TARGET_DIR/htl.min.js")"
if [ "$htl_size" -lt 4000 ]; then
  echo "  ✗ htl.min.js: suspiciously small ($htl_size bytes, expected ~7KB)"
  fail=1
elif ! grep -q "htl" "$TARGET_DIR/htl.min.js"; then
  echo "  ✗ htl.min.js: missing expected 'htl' global — got something else"
  fail=1
else
  echo "  ✓ htl.min.js ($htl_size bytes)"
fi

inputs_size="$(wc -c < "$TARGET_DIR/observable-inputs.min.js")"
if [ "$inputs_size" -lt 15000 ]; then
  echo "  ✗ observable-inputs.min.js: suspiciously small ($inputs_size bytes, expected ~27KB)"
  fail=1
elif ! grep -q "Inputs" "$TARGET_DIR/observable-inputs.min.js"; then
  echo "  ✗ observable-inputs.min.js: missing expected 'Inputs' global — got something else"
  fail=1
else
  echo "  ✓ observable-inputs.min.js ($inputs_size bytes)"
fi

echo ""
if [ "$fail" -ne 0 ]; then
  echo "FAILED: one or more files did not pass integrity checks — see above."
  exit 1
fi

echo "==> Done. Staged in $TARGET_DIR."
